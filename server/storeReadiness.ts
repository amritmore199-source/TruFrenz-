/**
 * Store launch readiness, and the production App Store verifier.
 *
 * Two related jobs live here.
 *
 * **Readiness** answers, honestly, "is this deployment able to take real
 * money?" It reports each store separately — environment variables present,
 * App Store signing key parseable, identifiers consistent — and returns the
 * catalogue in the exact shape someone has to type into Play Console and App
 * Store Connect. Nothing here claims a product exists in a store console:
 * only the store's own console can know that, and this process has no access
 * to it. The checklist it renders is what a human must complete by hand.
 *
 * **Apple verification** is the production path. The client hands over a signed
 * transaction, but a decoded JWS payload is just a claim — anything can forge
 * one. So the signature is verified against Apple's own root certificates with
 * Apple's own library, and the authoritative period end is then read back from
 * the App Store Server API rather than taken from the payload.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from "@apple/app-store-server-library";
import {
  chargeForPlan,
  productIdForPlan,
  STORE_PRODUCTS,
} from "../lib/subscription-store";
import { PLANS, planById, type PlanId } from "../lib/subscription";
/** The App Store environment to talk to. Production unless explicitly overridden. */
function appleEnvironment(): Environment {
  const raw = process.env.APPLE_ENVIRONMENT?.trim().toLowerCase();
  return raw === "sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
}
/**
 * Apple's trust anchors, read from disk.
 *
 * Apple publishes these DER-encoded roots for exactly this purpose. They ship
 * with the repository rather than being fetched at boot so verification cannot
 * depend on network reachability to apple.com, and so a compromised DNS answer
 * cannot substitute its own root.
 */
let cachedRoots: Buffer[] | null = null;
export function appleRootCertificates(): Buffer[] {
  if (cachedRoots) return cachedRoots;
  const directory = join(process.cwd(), "server", "apple-roots");
  const files = ["AppleRootCA-G3.cer", "AppleRootCA-G2.cer"];
  const roots: Buffer[] = [];
  for (const file of files) {
    try {
      roots.push(readFileSync(join(directory, file)));
    } catch {
      // A missing anchor is reported by the readiness check, not thrown here:
      // an unreadable root must fail verification, not crash the server.
    }
  }
  cachedRoots = roots;
  return roots;
}
export type AppleCredentials = {
  bundleId: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
};
/**
 * The subset of Apple's decoded transaction the billing rules depend on.
 *
 * Apple's own decoded type carries many more fields; naming only what is used
 * keeps the decision in `billingService` readable and makes it obvious which
 * claims a forged payload would have to fake — all of them, since the signature
 * chain has to hold first.
 */
export type AppleTransactionClaims = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  /** Period end, in milliseconds since the epoch. */
  expiresDate?: number;
  /** 1 when renewal is on, 0 when the member turned it off. */
  autoRenewStatus?: number;
  /** Set when Apple refunded the purchase. */
  revocationDate?: number;
};
/** The Apple credentials this deployment holds, or null when any part is absent. */
export function readAppleCredentials(): AppleCredentials | null {
  const env = process.env;
  const bundleId = env.APPLE_BUNDLE_ID?.trim();
  const issuerId = env.APPLE_ISSUER_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const privateKey = env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!bundleId || !issuerId || !keyId || !privateKey) return null;
  return { bundleId, issuerId, keyId, privateKey };
}
/**
 * Verify a signed transaction against Apple's signature chain.
 *
 * This is the step that makes a client-supplied payload trustworthy: the JWS is
 * checked against Apple's roots, the app identifier must match ours, and the
 * signer's certificate must chain to Apple. `enableOnlineChecks` turns on OCSP
 * revocation and expiry checks, which costs a network round trip and is worth
 * it for a payment path.
 */
export async function verifyAppleSignedTransaction(
  signedTransaction: string,
  credentials: AppleCredentials,
): Promise<AppleTransactionClaims> {
  const roots = appleRootCertificates();
  if (roots.length === 0) {
    throw new Error(
      "Apple root certificates are missing from server/apple-roots, so App Store receipts cannot be verified.",
    );
  }
  const verifier = new SignedDataVerifier(roots, true, appleEnvironment(), credentials.bundleId);
  // Throws VerificationException when the chain, the bundle id, or the dates do
  // not check out. The caller maps that to a user-facing rejection.
  return verifier.verifyAndDecodeTransaction(signedTransaction);
}
/**
 * Read the authoritative transaction from the App Store Server API.
 *
 * The signature check proves Apple signed the transaction the *client* handed
 * over; this proves the subscription is still what Apple says it is right now.
 * Apple's response is itself signed, so it is verified before it is trusted.
 */
export async function fetchAppleTransaction(
  transactionId: string,
  credentials: AppleCredentials,
): Promise<AppleTransactionClaims | null> {
  const client = new AppStoreServerAPIClient(
    credentials.privateKey,
    credentials.keyId,
    credentials.issuerId,
    credentials.bundleId,
    appleEnvironment(),
  );
  const response = await client.getTransactionInfo(transactionId);
  if (!response.signedTransactionInfo) return null;
  return verifyAppleSignedTransaction(response.signedTransactionInfo, credentials);
}
/* ------------------------------- readiness ------------------------------- */
/**
 * Outcome of inspecting a credential *value*, not just its presence.
 *
 * Presence alone is a weak signal: `APPLE_PRIVATE_KEY=x` is present and useless,
 * and a service account JSON with no `client_email` cannot mint a token. Reporting
 * `ready` for something that fails on the first real purchase is worse than
 * reporting `partial`, because it sends whoever is on call looking elsewhere.
 */
export type CredentialProblem = {
  /** The environment variable at fault. */
  variable: string;
  /** What is wrong, in a sentence, without echoing the value. */
  problem: string;
};
/** A PEM or PKCS#8 block, which is the only key shape Apple and Google accept. */
function looksLikePem(value: string): boolean {
  /*
   * Both markers are required, not just the opening one. A key that was cut off
   * mid-paste still contains "-----BEGIN PRIVATE KEY-----", so checking only the
   * start would pass a key that cannot sign anything — exactly the failure this
   * check exists to catch.
   */
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) && /-----END [A-Z ]*PRIVATE KEY-----/.test(value);
}
/** One line naming what is unusable, for the dashboard's detail sentence. */
function summariseProblems(problems: CredentialProblem[]): string {
  const names = problems.map((entry) => entry.variable).join(", ");
  return `However, ${names} ${problems.length === 1 ? "is" : "are"} present but unusable — see below.`;
}
/**
 * Whether the Apple credentials can actually sign an App Store Server API request.
 *
 * Shape only — the variables are never logged, and the key never leaves this
 * process. This is a pre-flight check, not a substitute for trying a purchase.
 */
export function validateAppleCredentials(): CredentialProblem[] {
  const problems: CredentialProblem[] = [];
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim() ?? "";
  const issuerId = process.env.APPLE_ISSUER_ID?.trim() ?? "";
  const keyId = process.env.APPLE_KEY_ID?.trim() ?? "";
  const privateKey = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();

  // A bundle id is dotted; a bare word means someone set a display name instead.
  if (bundleId && !bundleId.includes(".")) {
    problems.push({
      variable: "APPLE_BUNDLE_ID",
      problem: "does not look like a bundle identifier (expected at least one dot).",
    });
  }
  if (issuerId && !/^[0-9a-fA-F-]{8,}$/.test(issuerId)) {
    problems.push({ variable: "APPLE_ISSUER_ID", problem: "is not in Apple's issuer id format." });
  }
  // Apple's key ids are exactly ten characters.
  if (keyId && keyId.length !== 10) {
    problems.push({ variable: "APPLE_KEY_ID", problem: `should be 10 characters, but is ${keyId.length}.` });
  }
  if (privateKey && !looksLikePem(privateKey)) {
    problems.push({
      variable: "APPLE_PRIVATE_KEY",
      problem: "is not a PEM private key block — copy the whole .p8 contents, including the BEGIN and END lines.",
    });
  }
  // The roots are part of the trust chain, so their absence is a credential
  // problem in the only sense that matters here.
  if (appleRootCertificates().length === 0) {
    problems.push({
      variable: "server/apple-roots",
      problem: "Apple's root certificates are missing, so no signature can be trusted.",
    });
  }
  return problems;
}
/**
 * Whether the Play credentials can actually call the Play Developer API.
 *
 * The service account is pasted as JSON, and the two mistakes people make are
 * pasting a file *path* instead of the contents, and pasting a key with no usable
 * `private_key`. Both otherwise fail only at verification time, which is exactly
 * when a paying member is waiting.
 */
export function validatePlayCredentials(): CredentialProblem[] {
  const problems: CredentialProblem[] = [];
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() ?? "";
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim() ?? "";

  if (pkg && pkg.split(".").length < 2) {
    problems.push({
      variable: "GOOGLE_PLAY_PACKAGE_NAME",
      problem: "does not look like an Android package name.",
    });
  }
  if (!raw) return problems;

  if (raw.endsWith(".json") && !raw.startsWith("{")) {
    problems.push({
      variable: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
      problem: "looks like a file path — paste the JSON contents instead.",
    });
    return problems;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    problems.push({ variable: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", problem: "is not valid JSON." });
    return problems;
  }

  for (const field of ["client_email", "private_key"]) {
    const value = parsed[field];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push({
        variable: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
        problem: `is missing the "${field}" field, so no access token can be minted.`,
      });
    }
  }
  if (typeof parsed.private_key === "string" && !looksLikePem(parsed.private_key)) {
    problems.push({
      variable: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
      problem: 'has a "private_key" that is not a PEM block — check the key was not truncated.',
    });
  }
  return problems;
}
export type ReadinessState = "ready" | "partial" | "not-configured";
export type ChannelReadiness = {
  channel: "play" | "app-store";
  label: string;
  state: ReadinessState;
  /** Plain-language status for the dashboard. Never contains secret values. */
  detail: string;
  /** The exact environment variables this channel needs. */
  requiredEnv: string[];
  /** Which of them are actually present. */
  presentEnv: string[];
  /** Values that are present but unusable, so "ready" is never claimed falsely. */
  problems: CredentialProblem[];
  /** What a human must still do in the store's own console. */
  manualSteps: string[];
};
/** The catalogue exactly as it must be entered in both consoles. */
export function consoleCatalogue() {
  return PLANS.map((plan) => {
    const product = STORE_PRODUCTS.find((entry) => entry.planId === plan.id);
    return {
      productId: productIdForPlan(plan.id),
      planLabel: plan.label,
      storeName: product?.storeName ?? `Trufrenz Premium — ${plan.label}`,
      priceInr: plan.priceInr,
      billingPeriod: plan.id === "monthly" ? "1 month" : plan.id === "quarterly" ? "3 months" : "12 months",
      autoRenewing: true,
    };
  });
}
/**
 * What is and is not ready to take real money.
 *
 * Each store is reported on its own, because they come up at different times:
 * a team usually finishes Play first and App Store weeks later. The state is
 * derived from what is actually configured — never from whether a product id
 * appears in the local catalogue, which says nothing about the store console.
 */
export function storeReadiness(): {
  verificationMode: "store" | "sandbox";
  channels: ChannelReadiness[];
  catalogue: ReturnType<typeof consoleCatalogue>;
  readyToSell: boolean;
} {
  const playEnv = ["GOOGLE_PLAY_PACKAGE_NAME", "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
  const playPresent = playEnv.filter((name) => (process.env[name] ?? "").trim() !== "");

  const appleEnv = ["APPLE_BUNDLE_ID", "APPLE_ISSUER_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"];
  const applePresent = appleEnv.filter((name) => (process.env[name] ?? "").trim() !== "");

  /*
   * Check the values, not just that they exist. A key that is present but
   * truncated passes a presence test and fails the first real purchase.
   */
  const playProblems = validatePlayCredentials();
  const appleProblems = validateAppleCredentials();

  let appleDetail: string;
  if (applePresent.length === 0) {
    appleDetail = "No App Store credentials configured. Receipts from the App Store cannot be verified.";
  } else if (applePresent.length < appleEnv.length) {
    const missing = appleEnv.filter((name) => !applePresent.includes(name));
    appleDetail = `App Store credentials are incomplete — still needed: ${missing.join(", ")}.`;
  } else {
    const credentials = readAppleCredentials()!;
    const roots = appleRootCertificates().length;
    const base =
      `App Store verification is configured for bundle ${credentials.bundleId} against ` +
      `${appleEnvironment() === Environment.SANDBOX ? "the sandbox" : "production"}, with ${roots} trust anchor(s).`;
    appleDetail = appleProblems.length > 0 ? `${base} ${summariseProblems(appleProblems)}` : base;
  }

  let playDetail: string;
  if (playPresent.length === 0) {
    playDetail = "No Google Play credentials configured. Receipts from Play cannot be verified.";
  } else if (playPresent.length < playEnv.length) {
    const missing = playEnv.filter((name) => !playPresent.includes(name));
    playDetail = `Google Play credentials are incomplete — still needed: ${missing.join(", ")}.`;
  } else {
    const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim();
    const base = `Google Play verification is configured for package ${pkg} through the Play Developer API.`;
    playDetail = playProblems.length > 0 ? `${base} ${summariseProblems(playProblems)}` : base;
  }

  /*
   * The state is `ready` only when every variable is present *and* every value
   * passes its shape check. A deployment with `APPLE_PRIVATE_KEY=nope` is not
   * ready, and saying so here is cheaper than discovering it on the first sale.
   */
  const playState: ReadinessState =
    playPresent.length === 0 ? "not-configured" : playProblems.length > 0 || playPresent.length < playEnv.length ? "partial" : "ready";
  const appleState: ReadinessState =
    applePresent.length === 0
      ? "not-configured"
      : appleProblems.length > 0 || applePresent.length < appleEnv.length
        ? "partial"
        : "ready";

  const play: ChannelReadiness = {
    channel: "play",
    label: "Google Play",
    state: playState,
    detail: playDetail,
    requiredEnv: playEnv,
    presentEnv: playPresent,
    problems: playProblems,
    manualSteps: [
      "Create the three subscription products in Play Console with the exact product ids below.",
      "Complete payments profile, bank account, and tax details — Play will not bill without them.",
      "Grant the service account access to the app in Play Console → Users and permissions with financial data rights.",
      "Upload a signed AAB to a closed track, then create and activate the products against that release.",
      "Add licence testers and buy each plan in test mode before launch.",
    ],
  };

  const apple: ChannelReadiness = {
    channel: "app-store",
    label: "App Store",
    state: appleState,
    detail: appleDetail,
    requiredEnv: appleEnv,
    presentEnv: applePresent,
    problems: appleProblems,
    manualSteps: [
      "Create the three auto-renewable subscriptions in App Store Connect with the exact product ids below.",
      "Register them in a subscription group that also carries the 20% launch offer for the annual plan.",
      "Complete agreements, tax, and banking in App Store Connect — payouts stay blocked until they are approved.",
      "Generate an App Store Server API key (In-App Purchase key) and copy the key id, issuer id, and .p8 contents into the environment.",
      "Test with a StoreKit sandbox account on a real device before submitting for review.",
    ],
  };

  const channels = [play, apple];
  const readyToSell = channels.every((channel) => channel.state === "ready");
  return {
    verificationMode: readyToSell ? "store" : "sandbox",
    channels,
    catalogue: consoleCatalogue(),
    readyToSell,
  };
}
/** The next charge the store will make for a plan, for reminder copy. */
export function nextChargeInr(planId: PlanId): number {
  return chargeForPlan(planById(planId).id);
}
