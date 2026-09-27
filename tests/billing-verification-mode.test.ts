import { afterEach, describe, expect, it } from "vitest";
import { ReceiptRejected, sandboxVerificationAllowed, verifyReceipt } from "../server/billingService";
import { consoleCatalogue, storeReadiness } from "../server/storeReadiness";

const CREDENTIAL_VARS = [
  "GOOGLE_PLAY_PACKAGE_NAME",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "APPLE_BUNDLE_ID",
  "APPLE_ISSUER_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "BILLING_ALLOW_SANDBOX",
  "NODE_ENV",
];

afterEach(() => {
  for (const name of CREDENTIAL_VARS) delete process.env[name];
});
/**
 * `NODE_ENV` is declared readonly in this project's Node typings, but the whole
 * point of these tests is to move the server between production and
 * development. One narrow cast here keeps every assertion below readable.
 */
function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

/** A receipt that is well-formed in every way the sandbox verifier checks. */
function playReceipt(productId = "trufrenz.premium.quarterly") {
  return {
    channel: "play" as const,
    productId,
    purchaseToken: "play-token-abcdef1234567890",
  };
}

function appleReceipt(productId = "trufrenz.premium.quarterly") {
  return {
    channel: "app-store" as const,
    productId,
    purchaseToken: "2000000123456789",
    signedTransaction: "header.payload.signature",
  };
}

/**
 * These tests pin the rule that closes the worst hole in the billing path: a
 * deployment that can verify one store must not silently accept receipts from
 * the other, because the sandbox verifier only checks the shape of a token.
 */
describe("sandbox verification gating", () => {
  it("refuses the sandbox path in production unless it was explicitly allowed", () => {
    setNodeEnv("production");
    expect(sandboxVerificationAllowed()).toBe(false);
  });

  it("allows the sandbox path outside production, where the purchase flow is reviewed", () => {
    setNodeEnv("development");
    expect(sandboxVerificationAllowed()).toBe(true);
    setNodeEnv(undefined);
    expect(sandboxVerificationAllowed()).toBe(true);
  });

  it("honours an explicit opt-in even in production", () => {
    setNodeEnv("production");
    process.env.BILLING_ALLOW_SANDBOX = "true";
    expect(sandboxVerificationAllowed()).toBe(true);
  });

  it("honours an explicit refusal even outside production", () => {
    setNodeEnv("development");
    process.env.BILLING_ALLOW_SANDBOX = "false";
    expect(sandboxVerificationAllowed()).toBe(false);
  });

  it("rejects an App Store receipt on a Play-only production server", async () => {
    // This is the hole the rule exists to close: Play credentials are present,
    // Apple's are not, so before this change the App Store receipt fell through
    // to the sandbox verifier and granted Premium without any store check.
    setNodeEnv("production");
    process.env.GOOGLE_PLAY_PACKAGE_NAME = "app.trufrenz";
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"client_email":"a@b.c","private_key":"x"}';

    await expect(verifyReceipt(appleReceipt(), 7)).rejects.toBeInstanceOf(ReceiptRejected);
    await expect(verifyReceipt(appleReceipt(), 7)).rejects.toMatchObject({
      code: "channel_not_configured",
    });
  });

  it("rejects a Play receipt on an App Store-only production server", async () => {
    setNodeEnv("production");
    process.env.APPLE_BUNDLE_ID = "app.trufrenz";
    process.env.APPLE_ISSUER_ID = "issuer";
    process.env.APPLE_KEY_ID = "KEYID";
    process.env.APPLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----";

    await expect(verifyReceipt(playReceipt(), 9)).rejects.toMatchObject({
      code: "channel_not_configured",
    });
  });

  it("still runs the sandbox path in development when nothing is configured", async () => {
    setNodeEnv("development");
    const verified = await verifyReceipt(playReceipt(), 12);
    expect(verified.verifiedBy).toBe("sandbox");
    expect(verified.planId).toBe("quarterly");
  });

  it("rejects a product we do not sell before it reaches any store call", async () => {
    setNodeEnv("development");
    await expect(
      verifyReceipt({ channel: "play", productId: "trufrenz.premium.lifetime", purchaseToken: "token-12345678" }, 3),
    ).rejects.toMatchObject({ code: "unknown_product" });
  });

  it("rejects a token too short to be a real store purchase", async () => {
    setNodeEnv("development");
    await expect(
      verifyReceipt({ channel: "play", productId: "trufrenz.premium.monthly", purchaseToken: "short" }, 3),
    ).rejects.toMatchObject({ code: "missing_token" });
  });
});

describe("store readiness reporting", () => {
  it("reports both channels as unconfigured on a bare server", () => {
    const readiness = storeReadiness();
    expect(readiness.channels).toHaveLength(2);
    for (const channel of readiness.channels) {
      expect(channel.state).toBe("not-configured");
      expect(channel.presentEnv).toEqual([]);
    }
    expect(readiness.readyToSell).toBe(false);
    expect(readiness.verificationMode).toBe("sandbox");
  });

  it("marks a channel ready only when every variable it needs is present", () => {
    process.env.GOOGLE_PLAY_PACKAGE_NAME = "app.trufrenz";
    // The service account is missing, so the channel is incomplete, not ready.
    let play = storeReadiness().channels.find((channel) => channel.channel === "play")!;
    expect(play.state).toBe("partial");
    expect(play.presentEnv).toEqual(["GOOGLE_PLAY_PACKAGE_NAME"]);
    expect(play.detail).toContain("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");

    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"client_email":"a@b.c","private_key":"x"}';
    play = storeReadiness().channels.find((channel) => channel.channel === "play")!;
    expect(play.state).toBe("ready");
    // The package name is reported because it is not a secret; the service
    // account JSON never appears in the detail line.
    expect(play.detail).toContain("app.trufrenz");
    expect(play.detail).not.toContain("private_key");
  });

  it("never reports a product as live merely because the catalogue names it", () => {
    // No credentials at all, yet the catalogue is fully populated: readiness
    // must still say nothing is ready to sell.
    const readiness = storeReadiness();
    expect(readiness.catalogue.length).toBeGreaterThan(0);
    expect(readiness.readyToSell).toBe(false);
  });

  it("lists the exact console catalogue with ids, prices, and periods", () => {
    const catalogue = consoleCatalogue();
    expect(catalogue.map((entry) => entry.productId)).toEqual([
      "trufrenz.premium.monthly",
      "trufrenz.premium.quarterly",
      "trufrenz.premium.annual",
    ]);
    expect(catalogue.map((entry) => entry.priceInr)).toEqual([49, 139, 499]);
    expect(catalogue.map((entry) => entry.billingPeriod)).toEqual(["1 month", "3 months", "12 months"]);
    for (const entry of catalogue) expect(entry.autoRenewing).toBe(true);
  });

  it("gives each channel the manual console steps a person still has to do", () => {
    for (const channel of storeReadiness().channels) {
      expect(channel.manualSteps.length).toBeGreaterThanOrEqual(4);
      for (const step of channel.manualSteps) expect(step.length).toBeGreaterThan(20);
    }
  });
});

/**
 * The mysql2 driver resolves an insert to an array whose first element holds the
 * result object. Reading `.insertId` off the array itself yields undefined, and
 * a caller storing that value silently records a null reference — which is what
 * happened to the reminder-to-notice link before this helper existed.
 */
describe("insert id extraction", () => {
  const driverResult = {
    fieldCount: 0,
    affectedRows: 1,
    insertId: 42,
    info: "",
    serverStatus: 2,
    warningStatus: 0,
  };

  it("reads the id from the array shape the driver actually returns", () => {
    expect(insertIdOf([driverResult, null])).toBe(42);
  });

  it("also accepts a bare result object", () => {
    expect(insertIdOf(driverResult)).toBe(42);
  });

  it("returns 0 instead of throwing when there is no usable id", () => {
    expect(insertIdOf([{ affectedRows: 0 }])).toBe(0);
    expect(insertIdOf([])).toBe(0);
    expect(insertIdOf(undefined)).toBe(0);
    expect(insertIdOf(null)).toBe(0);
    // A zero id is not something a caller can use as a reference.
    expect(insertIdOf([{ insertId: 0 }])).toBe(0);
  });
});
import { insertIdOf } from "../server/db";
