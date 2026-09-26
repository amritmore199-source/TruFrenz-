import { describe, expect, it } from "vitest";

import {
  STORE_INCOMPLETE_PURCHASE,
  isKnownProduct,
  purchaseTokenOf,
  storeChannelForPlatform,
  storePurchaseFailureMessage,
  toReceiptPayload,
  transactionIdOf,
} from "../lib/store-purchase";
import { planIdForProductId, productIdForPlan } from "../lib/subscription-store";

const monthly = productIdForPlan("monthly");

describe("store purchase mapping", () => {
  it("maps an Android subscription purchase to a server receipt", () => {
    const receipt = toReceiptPayload(
      {
        productId: monthly,
        purchaseToken: "play-token-abc123",
        transactionId: "GPA.1234-5678",
      },
      "play",
    );

    expect(receipt).toEqual({
      channel: "play",
      productId: monthly,
      purchaseToken: "play-token-abc123",
      signedTransaction: null,
      originalTransactionId: "GPA.1234-5678",
    });
  });

  it("reads the Android purchase token from either Android field", () => {
    expect(purchaseTokenOf({ purchaseTokenAndroid: "from-alt-field" })).toBe("from-alt-field");
    expect(purchaseTokenOf({ purchaseToken: "  padded  " })).toBe("padded");
    expect(purchaseTokenOf({ purchaseToken: "   " })).toBeNull();
    expect(purchaseTokenOf({})).toBeNull();
  });

  it("treats an iOS signed transaction as the token and passes it through", () => {
    const jws = "header.payload.signature";
    const receipt = toReceiptPayload(
      { productId: monthly, transactionReceipt: jws, transactionId: "1000000123456789" },
      "app-store",
    );

    expect(receipt?.purchaseToken).toBe(jws);
    expect(receipt?.signedTransaction).toBe(jws);
    expect(receipt?.originalTransactionId).toBe("1000000123456789");
  });

  it("does not claim an iOS signature for an opaque token", () => {
    const receipt = toReceiptPayload(
      { productId: monthly, purchaseToken: "opaque-token-without-dots" },
      "app-store",
    );

    expect(receipt?.signedTransaction).toBeNull();
    expect(receipt?.purchaseToken).toBe("opaque-token-without-dots");
  });

  it("refuses a purchase with no usable token", () => {
    expect(toReceiptPayload({ productId: monthly }, "play")).toBeNull();
    expect(toReceiptPayload({ productId: monthly, purchaseToken: "  " }, "play")).toBeNull();
    expect(toReceiptPayload({ productId: monthly, purchaseToken: null }, "play")).toBeNull();
  });

  it("refuses a product the app does not sell", () => {
    expect(toReceiptPayload({ productId: "someone.elses.product", purchaseToken: "tok-123456" }, "play")).toBeNull();
    expect(toReceiptPayload({ purchaseToken: "tok-123456" }, "play")).toBeNull();
    expect(toReceiptPayload({ productId: "", purchaseToken: "tok-123456" }, "play")).toBeNull();
  });

  it("knows which products are ours", () => {
    expect(isKnownProduct({ productId: monthly })).toBe(true);
    expect(isKnownProduct({ productId: "not.ours" })).toBe(false);
    expect(isKnownProduct({})).toBe(false);
  });

  it("falls back to the token when the store sends no transaction id", () => {
    const receipt = toReceiptPayload({ productId: monthly, purchaseToken: "only-a-token" }, "play");
    expect(receipt?.originalTransactionId).toBe("only-a-token");
    expect(transactionIdOf({})).toBeNull();
  });

  it("derives the store channel from the platform", () => {
    expect(storeChannelForPlatform("ios")).toBe("app-store");
    expect(storeChannelForPlatform("android")).toBe("play");
    // Web and anything unexpected resolve to Play, matching the existing default.
    expect(storeChannelForPlatform("web")).toBe("play");
  });

  it("tells the member what happened without naming internal fields", () => {
    expect(STORE_INCOMPLETE_PURCHASE).toMatch(/nothing was charged/i);
    expect(storePurchaseFailureMessage("User cancelled the purchase")).toMatch(/cancelled/i);
    expect(storePurchaseFailureMessage("")).toMatch(/did not complete/i);
    expect(storePurchaseFailureMessage("Billing service unavailable")).toBe("Billing service unavailable");
  });

  it("only maps products the plan resolver agrees with", () => {
    for (const planId of ["monthly", "quarterly", "annual"] as const) {
      const productId = productIdForPlan(planId);
      expect(planIdForProductId(productId)).toBe(planId);
      expect(toReceiptPayload({ productId, purchaseToken: "tok-12345678" }, "play")?.productId).toBe(productId);
    }
  });
});
