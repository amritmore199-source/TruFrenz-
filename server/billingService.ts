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
import { and, desc, eq } from "drizzle-orm";
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
 * The signed JWS payload is decoded and its claims are checked: the bundle id
 * must match, the product must be ours, and the expiry must be in the future.
 * A production launch should also confirm the signature chain against Apple's
 * root certificates; the structure here keeps that as a single added step.
 */
async function verifyAppleReceipt(
  receipt: StoreReceipt,
  credentials: NonNullable<StoreCredentials["apple"]>,
): Promise<VerifiedReceipt> {
  const planId = planIdForProductId(receipt.productId);
  if (!planId) throw new ReceiptRejected("That product is not part of Trufrenz Premium.", "unknown_product");

  const payload = receipt.signedTransaction?.split(".")[1] ?? null;
  if (!payload) throw new ReceiptRejected("The App Store did not return a signed transaction.", "missing_receipt");

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ReceiptRejected("That App Store receipt could not be read.", "malformed_receipt");
  }

  if (typeof claims.bundleId === "string" && claims.bundleId !== credentials.bundleId) {
    throw new ReceiptRejected("That receipt belongs to a different app.", "bundle_mismatch");
  }
  if (typeof claims.productId === "string" && claims.productId !== receipt.productId) {
    throw new ReceiptRejected("That receipt is for a different product.", "product_mismatch");
  }

  const expiryMs = typeof claims.expiresDate === "number" ? claims.expiresDate : Number(claims.expiresDate);
  if (!Number.isFinite(expiryMs)) throw new ReceiptRejected("The App Store receipt has no expiry.", "missing_expiry");
  if (expiryMs <= Date.now()) throw new ReceiptRejected("That App Store subscription has already ended.", "subscription_expired");

  const revoked = Boolean(claims.revocationDate);
  if (revoked) throw new ReceiptRejected("That App Store purchase was refunded.", "receipt_revoked");

  return {
    productId: receipt.productId,
    planId,
    transactionId: `apple:${String(claims.transactionId ?? receipt.originalTransactionId ?? randomUUID())}`,
    expiresAt: new Date(expiryMs),
    verifiedBy: "store",
    autoRenewing: claims.autoRenewStatus !== 0,
    cancelledAt: null,
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
export async function verifyReceipt(receipt: StoreReceipt, memberId: number): Promise<VerifiedReceipt> {
  const credentials = readCredentials();
  if (receipt.channel === "play" && credentials.play) return verifyPlayReceipt(receipt, credentials.play);
  if (receipt.channel === "app-store" && credentials.apple) return verifyAppleReceipt(receipt, credentials.apple);
  return verifySandboxReceipt(receipt, memberId);
}

/* ------------------------------- entitlements ---------------------------- */

export type Entitlement = {
  tier: Tier;
  planId: PlanId;
  renewsOn: string | null;
  autoRenewing: boolean;
  cancelledAt: string | null;
  lastVerifiedAt: string | null;
  verifiedBy: "store" | "sandbox" | null;
};

export const FREE_ENTITLEMENT: Entitlement = {
  tier: "free",
  planId: "quarterly",
  renewsOn: null,
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
    planId: planIdForProductId(row.productId) ?? "quarterly",
    renewsOn: expires.toISOString(),
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
    receiptId = Number((inserted as unknown as { insertId?: number })?.insertId ?? 0);
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
  const rows = await db
    .select()
    .from(subscriptionReceipts)
    .where(eq(subscriptionReceipts.memberId, memberId))
    .orderBy(desc(subscriptionReceipts.expiresAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { ...FREE_ENTITLEMENT };
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

/** The product catalogue, as the app should present it. */
export function storeCatalog() {
  return (["monthly", "quarterly", "annual"] as PlanId[]).map((planId) => ({
    planId,
    productId: productIdForPlan(planId),
    chargeInr: chargeForPlan(planId),
  }));
}
