/**
 * Store billing and entitlement service.
 *
 * The client never grants Premium. It hands the store's receipt to this service,
 * which verifies it against the store's own API, records the entitlement, and
 * only then flips the member's tier. That order matters: a modified client can
 * ask for Premium as loudly as it likes, and nothing happens without a receipt
 * the store will vouch for.
 *
 * Two verification paths exist:
 *
 * 1. **Real** — set `GOOGLE_PLAY_*` or `APPLE_*` credentials and the receipt is
 *    checked against the Play Developer API / App Store Server API.
 * 2. **Sandbox** — with no credentials configured, receipts are verified
 *    against the store's public receipt format and a deterministic fake
 *    transaction id is derived, so the whole purchase → verify → entitlement
 *    path is reviewable before the store accounts exist. Sandbox receipts are
 *    recorded with `verifiedBy: "sandbox"` so they are never mistaken for real
 *    revenue in the dashboard.
 */

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "./db";
import { members, subscriptionEvents, subscriptionReceipts } from "../drizzle/schema";
import {
  chargeForPlan,
  planIdForProductId,
  productIdForPlan,
  type PurchaseStatus,
  type StoreChannel,
} from "../lib/subscription-store";
import { planById, type PlanId, type Tier } from "../lib/subscription";

/* ------------------------------ configuration ---------------------------- */

/**
 * Which stores can actually be verified.
 *
 * An absent credential pair is not an error: it means the deployment runs the
 * sandbox path and says so in every record it writes.
 */
export type StoreCredentials = {
  play: { packageName: string; serviceAccountJson: string } | null;
  apple: { bundleId: string; issuerId: string; keyId: string; privateKey: string } | null;
};

function readCredentials(): StoreCredentials {
  const env = process.env;
  const playPackage = env.GOOGLE_PLAY_PACKAGE_NAME?.trim();
  const playKey = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  const appleBundle = env.APPLE_BUNDLE_ID?.trim();
  const appleIssuer = env.APPLE_ISSUER_ID?.trim();
  const appleKeyId = env.APPLE_KEY_ID?.trim();
  const appleKey = env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return {
    play: playPackage && playKey ? { packageName: playPackage, serviceAccountJson: playKey } : null,
    apple:
      appleBundle && appleIssuer && appleKeyId && appleKey
        ? { bundleId: appleBundle, issuerId: appleIssuer, keyId: appleKeyId, privateKey: appleKey }
        : null,
  };
}

export function storeCredentials(): StoreCredentials {
  return readCredentials();
}

/** True when at least one store can be verified for real. */
export function liveVerificationAvailable(): boolean {
  const credentials = readCredentials();
  return Boolean(credentials.play || credentials.apple);
}

/** The verification mode recorded on every receipt this deployment writes. */
export function verificationMode(): "store" | "sandbox" {
  return liveVerificationAvailable() ? "store" : "sandbox";
}

/* ------------------------------- receipt shape --------------------------- */

/**
 * What the app sends after the store sheet closes.
 *
 * On Google Play this is the purchase token plus the product id. On the App
 * Store it is the JWS transaction representation. The app passes both through
 * untouched — it must never summarise or rewrite them.
 */
export type StoreReceipt = {
  channel: StoreChannel;
  productId: string;
  /** Play: the purchase token. App Store: the transaction id. */
  purchaseToken: string;
  /** App Store only: the signed transaction payload. */
  signedTransaction?: string | null;
  /** App Store only: the original transaction id, used for restores. */
  originalTransactionId?: string | null;
};

export type VerifiedReceipt = {
  productId: string;
  planId: PlanId;
  /** The store's own transaction id. */
  transactionId: string;
  /** When the paid period ends, from the store's response. */
  expiresAt: Date;
  /** How this receipt was checked. */
  verifiedBy: "store" | "sandbox";
  /** True when the store says the subscription will renew. */
  autoRenewing: boolean;
  /** Set when the store reports a cancellation that runs to period end. */
  cancelledAt: Date | null;
};

export class ReceiptRejected extends Error {
  code: string;
  constructor(message: string, code = "receipt_rejected") {
    super(message);
    this.name = "ReceiptRejected";
    this.code = code;
  }
}

/* ---------------------------- verification paths ------------------------- */

/** Add the plan's length in months to a date, matching the store's period. */
function periodEnd(planId: PlanId, from: Date): Date {
  const plan = planById(planId);
  const end = new Date(from.getTime());
  end.setMonth(end.getMonth() + plan.months);
  return end;
}

/**
 * Verify a Google Play subscription purchase.
 *
 * Calls `purchases.subscriptionsv2.get`, which is the current Play Developer API
 * endpoint, and reads the expiry the store reports rather than trusting a date
 * the client sent. A network or credential failure surfaces as a rejection so
 * the member is told to try again instead of being silently upgraded.
 */
async function verifyPlayReceipt(
  receipt: StoreReceipt,
  credentials: NonNullable<StoreCredentials["play"]>,
): Promise<VerifiedReceipt> {
  const planId = planIdForProductId(receipt.productId);
  if (!planId) throw new ReceiptRejected("That product is not part of Trufrenz Premium.", "unknown_product");
  if (!receipt.purchaseToken) throw new ReceiptRejected("The store did not return a purchase token.", "missing_token");

  const account = JSON.parse(credentials.serviceAccountJson) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };

  // Google's OAuth token exchange: sign a JWT assertion, swap it for an access token.
  const tokenUrl = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: tokenUrl,
    iat: now,
    exp: now + 3600,
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signature = (await import("node:crypto")).sign("RSA-SHA256", Buffer.from(signingInput), account.private_key);
  const assertion = `${signingInput}.${signature.toString("base64url")}`;

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResponse.ok) {
    throw new ReceiptRejected("Google Play could not be reached to confirm the purchase. Try again in a moment.", "store_unreachable");
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) throw new ReceiptRejected("Google Play returned no access token.", "store_unreachable");

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    credentials.packageName,
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(receipt.purchaseToken)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404 || response.status === 400) {
    throw new ReceiptRejected("Google Play has no record of that purchase.", "receipt_not_found");
  }
  if (!response.ok) {
    throw new ReceiptRejected("Google Play could not be reached to confirm the purchase. Try again in a moment.", "store_unreachable");
  }
  const body = (await response.json()) as {
    subscriptionState?: string;
    lineItems?: { productId?: string; expiryTime?: string; autoRenewingPlan?: unknown }[];
  };

  const state = body.subscriptionState ?? "";
  if (state === "SUBSCRIPTION_STATE_CANCELED" || state === "SUBSCRIPTION_STATE_EXPIRED") {
    // Cancelled still means the member keeps the period they paid for.
    if (state === "SUBSCRIPTION_STATE_EXPIRED") {
      throw new ReceiptRejected("That Google Play subscription has already ended.", "subscription_expired");
    }
  }
  const line = (body.lineItems ?? []).find((item) => item.productId === receipt.productId) ?? body.lineItems?.[0];
  const expiry = line?.expiryTime ? new Date(line.expiryTime) : null;
  if (!expiry || Number.isNaN(expiry.getTime())) {
    throw new ReceiptRejected("Google Play did not report a subscription period.", "missing_expiry");
  }
  if (expiry.getTime() <= Date.now()) {
    throw new ReceiptRejected("That Google Play subscription has already ended.", "subscription_expired");
  }

  return {
    productId: receipt.productId,
    planId,
    transactionId: `play:${receipt.purchaseToken.slice(0, 48)}`,
    expiresAt: expiry,
    verifiedBy: "store",
    autoRenewing: state !== "SUBSCRIPTION_STATE_CANCELED",
    cancelledAt: state === "SUBSCRIPTION_STATE_CANCELED" ? new Date() : null,
  };
}

/**
 * Verify an App Store subscription transaction.
 *
 * Three steps, and all three matter:
 *
 * 1. **Signature chain.** The client hands us a signed transaction, but a
 *    decoded JWS payload is only a claim — anything can produce one. Apple's
 *    own verifier confirms the signature chains to Apple's published roots,
 *    that it was signed for *our* bundle id, and that the signing certificate
 *    has not been revoked.
 * 2. **Authoritative read.** That signature proves Apple signed that
 *    transaction, not that the subscription is still current. The period end is
 *    therefore read back from the App Store Server API for that transaction id
 *    using our server key, and Apple's signed response is verified the same way.
 * 3. **Our rules.** The product must be one we sell, the period must not
 *    already be over, and a refund ends access at once.
 */
async function verifyAppleReceipt(
  receipt: StoreReceipt,
  credentials: NonNullable<StoreCredentials["apple"]>,
): Promise<VerifiedReceipt> {
  const planId = planIdForProductId(receipt.productId);
  if (!planId) throw new ReceiptRejected("That product is not part of Trufrenz Premium.", "unknown_product");

  const signedTransaction = receipt.signedTransaction?.trim();
  if (!signedTransaction) {
    throw new ReceiptRejected("The App Store did not return a signed transaction.", "missing_receipt");
  }

  // 1. The client's transaction, verified against Apple's certificate chain.
  let decoded: AppleTransactionClaims;
  try {
    decoded = await verifyAppleSignedTransaction(signedTransaction, credentials);
  } catch {
    // Why it failed is worth an audit log, not a member-facing message.
    throw new ReceiptRejected("That App Store receipt could not be verified.", "unverified_receipt");
  }

  if (decoded.productId && decoded.productId !== receipt.productId) {
    throw new ReceiptRejected("That receipt is for a different product.", "product_mismatch");
  }

  const claimedTransactionId = decoded.transactionId ?? receipt.purchaseToken;
  if (!claimedTransactionId) {
    throw new ReceiptRejected("That App Store receipt has no transaction id.", "malformed_receipt");
  }

  // 2. Ask Apple what this subscription is right now: the authoritative period.
  let authoritative: AppleTransactionClaims | null = null;
  try {
    authoritative = await fetchAppleTransaction(claimedTransactionId, credentials);
  } catch (error) {
    // A missing transaction is a definitive answer; a network failure is not,
    // and must never be reported to the member as a bad receipt.
    const message = error instanceof Error ? error.message : "";
    if (/404|not found/i.test(message)) {
      throw new ReceiptRejected("The App Store has no record of that purchase.", "receipt_not_found");
    }
    throw new ReceiptRejected(
      "The App Store could not be reached to confirm the purchase. Try again in a moment.",
      "store_unreachable",
    );
  }

  const final = authoritative ?? decoded;
  if (final.productId && final.productId !== receipt.productId) {
    throw new ReceiptRejected("That receipt is for a different product.", "product_mismatch");
  }

  const expiryMs = Number(final.expiresDate);
  if (!Number.isFinite(expiryMs) || expiryMs <= 0) {
    throw new ReceiptRejected("The App Store receipt has no expiry.", "missing_expiry");
  }
  if (expiryMs <= Date.now()) {
    throw new ReceiptRejected("That App Store subscription has already ended.", "subscription_expired");
  }
  if (final.revocationDate) {
    throw new ReceiptRejected("That App Store purchase was refunded.", "receipt_revoked");
  }

  /*
   * `autoRenewStatus` is 1 when the subscription will renew and 0 when the
   * member has switched renewal off. Anything else means we could not tell, and
   * the safe reading is "will not renew": a needless reminder beats promising
   * someone their plan continues when it may not.
   */
  const renewing = Number(final.autoRenewStatus) === 1;

  return {
    productId: receipt.productId,
    planId,
    transactionId: `apple:${String(final.transactionId ?? claimedTransactionId)}`,
    expiresAt: new Date(expiryMs),
    verifiedBy: "store",
    autoRenewing: renewing,
    cancelledAt: renewing ? null : new Date(),
  };
}

/**
 * Sandbox verification.
 *
 * Runs only when the deployment has no store credentials. It checks the shape
 * the store guarantees — a product we sell, a token of plausible length, and a
 * transaction id that has not already been spent on another account — then
 * issues the period the plan promises. Every record it writes is marked
 * `sandbox`, so a reviewer can always tell simulated revenue from real revenue.
 */
async function verifySandboxReceipt(receipt: StoreReceipt, claimedByMemberId: number): Promise<VerifiedReceipt> {
  const planId = planIdForProductId(receipt.productId);
  if (!planId) throw new ReceiptRejected("That product is not part of Trufrenz Premium.", "unknown_product");
  if (!receipt.purchaseToken || receipt.purchaseToken.trim().length < 8) {
    throw new ReceiptRejected("The store did not return a usable purchase token.", "missing_token");
  }
  if (receipt.channel !== "play" && receipt.channel !== "app-store") {
    throw new ReceiptRejected("That store is not supported.", "unsupported_channel");
  }

  const fingerprint = createHash("sha256")
    .update(`${receipt.channel}:${receipt.productId}:${receipt.purchaseToken}`)
    .digest("hex");
  const transactionId = `sandbox:${fingerprint.slice(0, 40)}`;

  const db = await getDb();
  if (db) {
    const existing = await db
      .select({ memberId: subscriptionReceipts.memberId })
      .from(subscriptionReceipts)
      .where(eq(subscriptionReceipts.transactionId, transactionId))
      .limit(1);
    if (existing.length > 0 && existing[0].memberId !== claimedByMemberId) {
      throw new ReceiptRejected("That purchase is already attached to another account.", "receipt_already_claimed");
    }
  }

  return {
    productId: receipt.productId,
    planId,
    transactionId,
    expiresAt: periodEnd(planId, new Date()),
    verifiedBy: "sandbox",
    autoRenewing: true,
    cancelledAt: null,
  };
}

/** Verify a receipt with whichever path this deployment supports. */
/**
 * Verify a receipt with whichever path this deployment supports.
 *
 * The dangerous case is a deployment that can verify one store but not the
 * other. Falling back to the sandbox there would let a production server that
 * holds only Play credentials hand out Premium to anyone who posts a made-up
 * App Store receipt, because the sandbox path checks the *shape* of a token and
 * nothing more. So the fallback is gated behind an explicit opt-in:
 *
 * - Channel unconfigured and `BILLING_ALLOW_SANDBOX` is not `true` → rejected.
 *   This is the correct behaviour for production.
 * - `BILLING_ALLOW_SANDBOX=true` → the sandbox path runs, for development and
 *   for reviewing the purchase flow before either store account exists.
 *
 * Unset means "allowed outside production, refused inside it", so a developer's
 * local server keeps working while a deployed one cannot be talked into it.
 */
export async function verifyReceipt(receipt: StoreReceipt, memberId: number): Promise<VerifiedReceipt> {
  const credentials = readCredentials();

  // A comp is granted server-side only; see `refuseCompChannel`.
  refuseCompChannel(receipt.channel);

  // A configured store is always the only acceptable path for its own channel.
  if (receipt.channel === "play") {
    if (credentials.play) return verifyPlayReceipt(receipt, credentials.play);
    if (!sandboxVerificationAllowed()) throw unconfiguredChannel("Google Play");
  }
  if (receipt.channel === "app-store") {
    if (credentials.apple) return verifyAppleReceipt(receipt, credentials.apple);
    if (!sandboxVerificationAllowed()) throw unconfiguredChannel("the App Store");
  }

  return verifySandboxReceipt(receipt, memberId);
}
/**
 * Whether the development-only sandbox verifier may run at all.
 *
 * Exported so the readiness report and the tests can assert on the same rule
 * the purchase path uses, rather than re-deriving it.
 */
export function sandboxVerificationAllowed(): boolean {
  const raw = process.env.BILLING_ALLOW_SANDBOX?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Unset: allowed outside production, refused inside it.
  return process.env.NODE_ENV !== "production";
}
/**
 * Refuse any attempt to verify a comp as if it were a purchase.
 *
 * Exported so every write path can share it. The reason it matters: the receipt's
 * channel is taken from the request body and then stored on the row that grants
 * the entitlement, so a client posting `channel: "comp"` would otherwise fall
 * through to the development sandbox verifier and mint itself Premium. Comps are
 * granted server-side by an administrator (`grantComp`), so that is the only
 * legitimate source.
 */
export function refuseCompChannel(channel: string): void {
  if (channel === "comp") {
    throw new ReceiptRejected(
      "That purchase could not be verified. Please contact support.",
      "comp_not_accepted",
    );
  }
}

/** The rejection for a receipt from a store this deployment cannot verify. */
function unconfiguredChannel(storeName: string): ReceiptRejected {
  return new ReceiptRejected(
    `Purchases from ${storeName} are not enabled on Trufrenz yet. Please update the app and try again.`,
    "channel_not_configured",
  );
}

/* ------------------------------- entitlements ---------------------------- */

export type Entitlement = {
  tier: Tier;
  planId: PlanId;
  renewsOn: string | null;
  /** True when the current period ends within the week. Drives the renewal nudge. */
  renewingSoon: boolean;
  autoRenewing: boolean;
  cancelledAt: string | null;
  lastVerifiedAt: string | null;
  verifiedBy: "store" | "sandbox" | null;
};

export const FREE_ENTITLEMENT: Entitlement = {
  tier: "free",
  planId: "quarterly",
  renewsOn: null,
  renewingSoon: false,
  autoRenewing: false,
  cancelledAt: null,
  lastVerifiedAt: null,
  verifiedBy: null,
};

/**
 * The member's real entitlement.
 *
 * A paid tier only survives while the store's own expiry is in the future. If
 * the period has lapsed the member is reported as free, even if the cached row
 * still says premium — the store is the clock, not the database.
 */
export async function entitlementForMember(memberId: number): Promise<Entitlement> {
  const db = await getDb();
  if (!db) return { ...FREE_ENTITLEMENT };

  const rows = await db
    .select()
    .from(subscriptionReceipts)
    .where(eq(subscriptionReceipts.memberId, memberId))
    .orderBy(desc(subscriptionReceipts.expiresAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { ...FREE_ENTITLEMENT };

  const expires = new Date(row.expiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    return { ...FREE_ENTITLEMENT };
  }

  return {
    tier: "premium",
    /*
     * The row's own plan id, not one re-derived from the product id.
     *
     * A comp is stored with a synthetic product id (`trufrenz.comp.annual`) that
     * no store catalogue knows, so mapping from the product id silently fell back
     * to a quarterly plan — and the member was told they had a quarterly plan
     * while holding an annual grant.
     */
    planId: planById(row.planId).id,
    renewsOn: expires.toISOString(),
    // Within the reminder horizon, so the manage screen can say so plainly.
    renewingSoon: expires.getTime() - Date.now() <= REMINDER_HORIZON_MS,
    autoRenewing: row.autoRenewing,
    cancelledAt: row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null,
    lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toISOString() : null,
    verifiedBy: row.verifiedBy === "store" ? "store" : "sandbox",
  };
}

export type EntitlementResult = {
  entitlement: Entitlement;
  /** True when this call changed the member's tier. */
  changed: boolean;
  receiptId: number;
  transactionId: string;
};

/**
 * Verify a receipt and write the entitlement.
 *
 * Order: verify with the store → record the receipt → update the member's tier →
 * append the subscription event the dashboard reads. The member's tier is only
 * touched after verification succeeds.
 */
export async function applyReceipt(memberId: number, receipt: StoreReceipt): Promise<EntitlementResult> {
  const verified = await verifyReceipt(receipt, memberId);
  const db = await getDb();
  if (!db) throw new ReceiptRejected("Trufrenz could not record that purchase. Try again shortly.", "storage_unavailable");

  const previous = await entitlementForMember(memberId);

  const existing = await db
    .select({ id: subscriptionReceipts.id, memberId: subscriptionReceipts.memberId })
    .from(subscriptionReceipts)
    .where(eq(subscriptionReceipts.transactionId, verified.transactionId))
    .limit(1);

  let receiptId: number;
  if (existing.length > 0) {
    if (existing[0].memberId !== memberId) {
      throw new ReceiptRejected("That purchase is already attached to another account.", "receipt_already_claimed");
    }
    await db
      .update(subscriptionReceipts)
      .set({
        expiresAt: verified.expiresAt,
        autoRenewing: verified.autoRenewing,
        cancelledAt: verified.cancelledAt,
        lastVerifiedAt: new Date(),
        verifiedBy: verified.verifiedBy,
      })
      .where(eq(subscriptionReceipts.id, existing[0].id));
    receiptId = existing[0].id;
  } else {
    const inserted = await db.insert(subscriptionReceipts).values({
      memberId,
      channel: receipt.channel,
      productId: verified.productId,
      planId: verified.planId,
      transactionId: verified.transactionId,
      purchaseTokenHash: createHash("sha256").update(receipt.purchaseToken).digest("hex"),
      status: "active" satisfies PurchaseStatus,
      expiresAt: verified.expiresAt,
      autoRenewing: verified.autoRenewing,
      cancelledAt: verified.cancelledAt,
      lastVerifiedAt: new Date(),
      verifiedBy: verified.verifiedBy,
    });
    // See `insertIdOf`: the id sits at `[0].insertId` with the mysql2 driver,
    // so a receipt reference stored here would otherwise be null.
    receiptId = insertIdOf(inserted);
  }

  const tier: Tier = "premium";
  const changed = previous.tier !== tier;
  await db
    .update(members)
    .set({ subscriptionTier: tier })
    .where(eq(members.id, memberId));

  await db.insert(subscriptionEvents).values({
    memberId,
    memberName: (await db.select({ name: members.name }).from(members).where(eq(members.id, memberId)).limit(1))[0]?.name ?? "Member",
    kind: "grant",
    tier,
    amountCents: Math.round(chargeForPlan(verified.planId) * 100),
    reason: `Store purchase verified (${verified.verifiedBy}) · ${verified.productId}`,
    actorEmail: `${receipt.channel}-store`,
  });

  const entitlement = await entitlementForMember(memberId);
  return { entitlement, changed, receiptId, transactionId: verified.transactionId };
}

/**
 * Restore purchases.
 *
 * The app replays the receipts the store already has for this account. Each one
 * is verified exactly like a fresh purchase, so a reinstall can never hand out a
 * tier the store will not confirm.
 */
export async function restoreReceipts(memberId: number, receipts: StoreReceipt[]): Promise<EntitlementResult | null> {
  let best: EntitlementResult | null = null;
  for (const receipt of receipts) {
    try {
      const result = await applyReceipt(memberId, receipt);
      if (!best || (result.entitlement.renewsOn ?? "") > (best.entitlement.renewsOn ?? "")) best = result;
    } catch (error) {
      if (!(error instanceof ReceiptRejected)) throw error;
    }
  }
  return best;
}

/**
 * Record a store-reported cancellation.
 *
 * Both stores keep the subscription running to the end of the paid period, so
 * this marks the receipt as cancelled and leaves the tier alone until it lapses.
 */
export async function markReceiptCancelled(memberId: number): Promise<Entitlement> {
  const db = await getDb();
  if (!db) return { ...FREE_ENTITLEMENT };
  /*
   * Only store receipts can be cancelled.
   *
   * This picks the newest receipt by expiry, which for a member holding a comp
   * would be the comp — and marking that cancelled would put store-cancellation
   * state on something never bought, while leaving the real subscription
   * untouched. A comp has no renewal to switch off in the first place.
   */
  const rows = await db
    .select()
    .from(subscriptionReceipts)
    .where(and(eq(subscriptionReceipts.memberId, memberId), ne(subscriptionReceipts.channel, "comp")))
    .orderBy(desc(subscriptionReceipts.expiresAt))
    .limit(1);
  const row = rows[0];
  // Nothing bought, so there is nothing a store could have cancelled.
  if (!row) return entitlementForMember(memberId);
  await db
    .update(subscriptionReceipts)
    .set({ cancelledAt: new Date(), autoRenewing: false, lastVerifiedAt: new Date() })
    .where(eq(subscriptionReceipts.id, row.id));
  return entitlementForMember(memberId);
}

/** Every receipt on file for a member, newest period first. */
export async function listReceiptsForMember(memberId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: subscriptionReceipts.id,
      channel: subscriptionReceipts.channel,
      productId: subscriptionReceipts.productId,
      planId: subscriptionReceipts.planId,
      status: subscriptionReceipts.status,
      expiresAt: subscriptionReceipts.expiresAt,
      autoRenewing: subscriptionReceipts.autoRenewing,
      cancelledAt: subscriptionReceipts.cancelledAt,
      verifiedBy: subscriptionReceipts.verifiedBy,
      lastVerifiedAt: subscriptionReceipts.lastVerifiedAt,
      createdAt: subscriptionReceipts.createdAt,
    })
    .from(subscriptionReceipts)
    .where(eq(subscriptionReceipts.memberId, memberId))
    .orderBy(desc(subscriptionReceipts.createdAt));
}

/**
 * Re-check every receipt that has not been verified in the last day.
 *
 * A real deployment runs this from a cron or a queue. It keeps entitlements
 * honest when a member cancels, refunds, or lets a payment fail without opening
 * the app.
 */
export async function revalidateDueReceipts(limit = 50): Promise<{ checked: number; lapsed: number }> {
  const db = await getDb();
  if (!db) return { checked: 0, lapsed: 0 };
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  /*
   * Every active receipt is in scope, comps included.
   *
   * This pass does not contact any store — it compares `expiresAt` against the
   * clock, so it is the only thing that makes a lapse stick. A comp has no store
   * to re-check, which makes it *more* dependent on this and not less: excluding
   * comps here would leave an expired grant granting Premium forever.
   */
  const rows = await db
    .select()
    .from(subscriptionReceipts)
    .where(and(eq(subscriptionReceipts.status, "active")))
    .orderBy(subscriptionReceipts.lastVerifiedAt)
    .limit(limit);

  let checked = 0;
  let lapsed = 0;
  for (const row of rows) {
    const last = row.lastVerifiedAt ? new Date(row.lastVerifiedAt) : null;
    if (last && last.getTime() > cutoff.getTime()) continue;
    checked += 1;
    const expires = new Date(row.expiresAt);
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      await db.update(subscriptionReceipts).set({ status: "expired" }).where(eq(subscriptionReceipts.id, row.id));
      await db.update(members).set({ subscriptionTier: "free" }).where(eq(members.id, row.memberId));
      lapsed += 1;
    } else {
      await db.update(subscriptionReceipts).set({ lastVerifiedAt: new Date() }).where(eq(subscriptionReceipts.id, row.id));
    }
  }
  return { checked, lapsed };
}

/* --------------------------------- comps --------------------------------- */
/**
 * A complimentary Premium period, granted for a support case.
 *
 * Comps travel through `subscription_receipts` rather than a separate table on
 * purpose. Entitlement is derived from *unexpired receipts*, so a comp inherits
 * the whole existing machine for free: it grants Premium while it lasts, the
 * revalidation job downgrades the member when it ends, and the renewal reminder
 * scan tells them it is about to. A separate table would have needed a second
 * copy of every one of those, and the second copy is where the drift starts.
 *
 * What a comp must *not* inherit is store verification. Its channel is `comp`,
 * which no store will ever verify, so both the revalidation job and the restore
 * path skip it by channel rather than by trying and failing.
 */
/** How long a comp may run. Long enough for goodwill, short enough to revisit. */
export const COMP_MAX_DAYS = 365;
export const COMP_DEFAULT_DAYS = 30;
export type CompResult = {
  receiptId: number;
  expiresAt: Date;
  planId: PlanId;
  memberName: string;
};
/**
 * Grant a time-boxed Premium period.
 *
 * The plan is validated rather than defaulted: a comp priced as an annual plan
 * drives the reminder copy ("your Annual plan…") and the manage screen's period
 * line, so silently substituting a default would show the member a plan they were
 * never given. The days are clamped, and a reason is mandatory upstream, because
 * an unexplained permanent grant is indistinguishable from an account takeover
 * when someone reads the audit log later.
 */
export async function grantComp(input: {
  memberId: number;
  planId: PlanId;
  days: number;
  reason: string;
  actor: string;
}): Promise<CompResult> {
  const db = await getDb();
  if (!db) throw new ReceiptRejected("Trufrenz could not record that grant.", "storage_unavailable");

  const plan = planById(input.planId);
  const days = Math.min(Math.max(Math.round(input.days) || COMP_DEFAULT_DAYS, 1), COMP_MAX_DAYS);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const rows = await db.select({ name: members.name }).from(members).where(eq(members.id, input.memberId)).limit(1);
  const memberName = rows[0]?.name;
  if (!memberName) throw new ReceiptRejected("That member no longer exists.", "member_not_found");

  /*
   * Replace any comp this member already has rather than stacking a second one.
   *
   * Two live comps would let the *newer* expiry silently win in
   * `entitlementForMember` (which orders by expiry) while the older row kept its
   * own reminder window, so the member would be told their Premium ends on a date
   * that is not the one that actually governs their access.
   */
  await db
    .delete(subscriptionReceipts)
    .where(and(eq(subscriptionReceipts.memberId, input.memberId), eq(subscriptionReceipts.channel, "comp")));

  const inserted = await db.insert(subscriptionReceipts).values({
    memberId: input.memberId,
    channel: "comp",
    productId: compProductId(plan.id),
    planId: plan.id,
    /*
     * A synthetic unique transaction id. It keeps the table's uniqueness
     * guarantee meaningful for comps too, and makes a comp identifiable in the
     * receipt list at a glance.
     */
    transactionId: `comp-${input.memberId}-${Date.now()}`,
    // No purchase token exists, so there is nothing to hash. The column is not
    // nullable, so a fixed marker is stored rather than a hash of an empty string
    // that would look like a real token.
    purchaseTokenHash: "comp-no-token",
    status: "active" satisfies PurchaseStatus,
    expiresAt,
    // Nothing renews a comp: it ends on its date unless a human extends it.
    autoRenewing: false,
    cancelledAt: null,
    lastVerifiedAt: new Date(),
    /*
     * `verifiedBy` records *how the entitlement was established*. A human granted
     * it, which is closer to `sandbox` than to a store verification, and claiming
     * `store` would put an unverified comp into the same bucket the dashboard uses
     * to report real revenue.
     */
    verifiedBy: "sandbox",
    grantedBy: input.actor,
    grantedReason: input.reason.slice(0, 500),
  });

  await db.update(members).set({ subscriptionTier: "premium" }).where(eq(members.id, input.memberId));
  await db.insert(subscriptionEvents).values({
    memberId: input.memberId,
    memberName,
    kind: "grant",
    tier: "premium",
    // No money changed hands, so this must not add to any revenue figure.
    amountCents: 0,
    reason: `Complimentary ${plan.label} for ${days} day(s) · ${input.reason}`,
    actorEmail: input.actor,
  });

  return { receiptId: insertIdOf(inserted), expiresAt, planId: plan.id, memberName };
}
/**
 * End a comp early.
 *
 * Downgrades the member only if this comp was the one granting access — a member
 * who bought a real subscription while holding a comp must not lose it because a
 * support gesture was revoked.
 */
export async function revokeComp(input: { memberId: number; reason: string; actor: string }): Promise<{ memberName: string }> {
  const db = await getDb();
  if (!db) throw new ReceiptRejected("Trufrenz could not revoke that grant.", "storage_unavailable");

  const rows = await db.select({ name: members.name }).from(members).where(eq(members.id, input.memberId)).limit(1);
  const memberName = rows[0]?.name;
  if (!memberName) throw new ReceiptRejected("That member no longer exists.", "member_not_found");

  const comps = await db
    .select({ id: subscriptionReceipts.id })
    .from(subscriptionReceipts)
    .where(and(eq(subscriptionReceipts.memberId, input.memberId), eq(subscriptionReceipts.channel, "comp")));
  if (comps.length === 0) {
    throw new ReceiptRejected("That member has no complimentary Premium to revoke.", "no_comp");
  }

  await db
    .update(subscriptionReceipts)
    .set({ status: "revoked", expiresAt: new Date(), cancelledAt: new Date() })
    .where(and(eq(subscriptionReceipts.memberId, input.memberId), eq(subscriptionReceipts.channel, "comp")));

  // Ask what actually remains, rather than assuming the member is now free.
  const remaining = await entitlementForMember(input.memberId);
  await db
    .update(members)
    .set({ subscriptionTier: remaining.tier })
    .where(eq(members.id, input.memberId));

  await db.insert(subscriptionEvents).values({
    memberId: input.memberId,
    memberName,
    kind: "revoke",
    tier: remaining.tier,
    amountCents: 0,
    reason: `Complimentary Premium revoked · ${input.reason}`,
    actorEmail: input.actor,
  });

  return { memberName };
}
/** The comps currently on file, for the admin Subscriptions module. */
export async function listComps(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: subscriptionReceipts.id,
      memberId: subscriptionReceipts.memberId,
      memberName: members.name,
      planId: subscriptionReceipts.planId,
      status: subscriptionReceipts.status,
      expiresAt: subscriptionReceipts.expiresAt,
      grantedBy: subscriptionReceipts.grantedBy,
      grantedReason: subscriptionReceipts.grantedReason,
      createdAt: subscriptionReceipts.createdAt,
    })
    .from(subscriptionReceipts)
    .leftJoin(members, eq(members.id, subscriptionReceipts.memberId))
    .where(eq(subscriptionReceipts.channel, "comp"))
    .orderBy(desc(subscriptionReceipts.expiresAt))
    .limit(limit);
}
/** The synthetic product id stored for a comp, so the receipt list reads clearly. */
export function compProductId(planId: PlanId): string {
  return `trufrenz.comp.${planId}`;
}

/** The product catalogue, as the app should present it. */
export function storeCatalog() {
  return (["monthly", "quarterly", "annual"] as PlanId[]).map((planId) => ({
    planId,
    productId: productIdForPlan(planId),
    chargeInr: chargeForPlan(planId),
  }));
}
import {
  fetchAppleTransaction,
  verifyAppleSignedTransaction,
  type AppleTransactionClaims,
} from "./storeReadiness";
import { REMINDER_HORIZON_MS } from "../lib/renewal-reminders";
import { insertIdOf } from "./db";
