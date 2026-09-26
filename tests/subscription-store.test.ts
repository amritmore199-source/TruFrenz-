import { describe, expect, it } from "vitest";

import { DEFAULT_SUBSCRIPTION, startSubscription, type Subscription } from "../lib/subscription";
import {
  IDLE_PURCHASE,
  IDLE_RESTORE,
  NOTHING_TO_RESTORE,
  STORE_PRODUCTS,
  activePlanLine,
  beginPurchase,
  beginRestore,
  beginVerification,
  chargeForPlan,
  completePurchase,
  daysLeftInPeriod,
  failPurchase,
  groupCapacityNudge,
  parseUsage,
  planIdForProductId,
  productIdForPlan,
  periodLine,
  proposalNudge,
  purchaseButtonLabel,
  purchaseInFlight,
  restoreFailed,
  restoredState,
  storeManagementLine,
  storeProductFor,
} from "../lib/subscription-store";

/** A premium subscription that renews in `days` days. */
function premiumRenewingIn(days: number): Subscription {
  const now = new Date();
  const renews = new Date(now.getTime() + days * 86_400_000);
  return { ...startSubscription("quarterly", now), renewsOn: renews.toISOString() };
}

describe("store products", () => {
  it("maps every plan to a store product id", () => {
    for (const product of STORE_PRODUCTS) {
      expect(product.productId).toContain("trufrenz.premium");
      expect(planIdForProductId(product.productId)).toBe(product.planId);
    }
  });

  it("returns the product for a plan and refuses unknown product ids", () => {
    expect(storeProductFor("annual").productId).toBe(productIdForPlan("annual"));
    expect(planIdForProductId("com.example.other")).toBeNull();
  });

  it("charges the launch price on the annual plan while the window is open", () => {
    expect(chargeForPlan("annual", true)).toBeLessThan(chargeForPlan("annual", false));
    expect(chargeForPlan("monthly", true)).toBe(chargeForPlan("monthly", false));
  });
});

describe("purchase lifecycle", () => {
  it("walks store → verify → active without skipping the verification step", () => {
    const pending = beginPurchase("monthly");
    expect(purchaseInFlight(pending)).toBe(true);

    const verifying = beginVerification("monthly", "txn-1");
    expect(verifying.status).toBe("verifying");
    expect(verifying.transactionId).toBe("txn-1");

    const active = completePurchase("monthly", "txn-1");
    expect(active.status).toBe("active");
    expect(purchaseInFlight(active)).toBe(false);
  });

  it("keeps the plan id on a failure so the paywall can retry the same plan", () => {
    const failed = failPurchase("quarterly", "Store declined the payment.");
    expect(failed.status).toBe("failed");
    expect(failed.planId).toBe("quarterly");
    expect(failed.error).toBe("Store declined the payment.");
    expect(purchaseInFlight(failed)).toBe(false);
  });

  it("labels the button for every stage of the flow", () => {
    expect(purchaseButtonLabel(IDLE_PURCHASE, "monthly")).toContain("Subscribe");
    expect(purchaseButtonLabel(beginPurchase("monthly"), "monthly")).toMatch(/confirm|store/i);
    expect(purchaseButtonLabel(beginVerification("monthly", "t"), "monthly")).toMatch(/verif/i);
    // An active purchase is no longer in flight, so the button offers the plan
    // again rather than claiming a new charge is underway.
    expect(purchaseButtonLabel(completePurchase("monthly", "t"), "monthly")).toMatch(/subscribe/i);
  });
});

describe("restore", () => {
  it("starts idle and reports nothing found without inventing a plan", () => {
    expect(IDLE_RESTORE.status).toBe("idle");
    expect(NOTHING_TO_RESTORE.status).toBe("nothing");
    expect(NOTHING_TO_RESTORE.planId).toBeNull();
    expect(beginRestore().status).toBe("checking");
  });

  it("carries the restored plan and a plain message", () => {
    const restored = restoredState("annual");
    expect(restored.status).toBe("restored");
    expect(restored.planId).toBe("annual");
    expect(restored.message).toMatch(/annual/i);
  });

  it("surfaces a failure reason instead of failing silently", () => {
    const failed = restoreFailed("The store could not be reached.");
    expect(failed.status).toBe("failed");
    expect(failed.message).toBe("The store could not be reached.");
  });
});

describe("usage counters", () => {
  it("accepts well-formed counters and rejects nonsense", () => {
    expect(parseUsage({ proposalsSent: 4, largestGroupSize: 3 })).toEqual({
      proposalsSent: 4,
      largestGroupSize: 3,
    });
    expect(parseUsage({ proposalsSent: -2, largestGroupSize: "many" })).toEqual({
      proposalsSent: 0,
      largestGroupSize: 0,
    });
    expect(parseUsage(null)).toEqual({ proposalsSent: 0, largestGroupSize: 0 });
  });
});

describe("upgrade nudges", () => {
  it("stays hidden for premium members and for members far from the limit", () => {
    expect(proposalNudge("premium", 9).level).toBe("hidden");
    expect(proposalNudge("free", 2).level).toBe("hidden");
  });

  it("speaks up near the proposal limit and again at the limit", () => {
    const near = proposalNudge("free", 7);
    expect(near.level).toBe("near");
    expect(near.body).toMatch(/7/);

    const atLimit = proposalNudge("free", 10);
    expect(atLimit.level).toBe("at-limit");
    expect(atLimit.cta.length).toBeGreaterThan(0);
  });

  it("nudges the group cap only as the group fills up", () => {
    expect(groupCapacityNudge("free", 2).level).toBe("hidden");
    expect(groupCapacityNudge("free", 4).level).toBe("near");
    expect(groupCapacityNudge("free", 5).level).toBe("at-limit");
    expect(groupCapacityNudge("premium", 40).level).toBe("hidden");
  });
});

describe("plan summary lines", () => {
  it("describes the free plan plainly", () => {
    expect(activePlanLine(DEFAULT_SUBSCRIPTION)).toMatch(/free/i);
    // There is no period to describe on the free plan, so the line stays empty
    // rather than inventing a renewal date.
    expect(periodLine(DEFAULT_SUBSCRIPTION)).toBe("");
    expect(daysLeftInPeriod(DEFAULT_SUBSCRIPTION)).toBeNull();
  });

  it("counts the days left in a paid period", () => {
    const subscription = premiumRenewingIn(10);
    expect(daysLeftInPeriod(subscription)).toBeGreaterThanOrEqual(9);
    expect(activePlanLine(subscription)).toMatch(/quarterly/i);
    expect(periodLine(subscription)).toMatch(/days left in this period/);
  });

  it("points the member at their own store account for cancellation", () => {
    expect(storeManagementLine("play")).toMatch(/play/i);
    expect(storeManagementLine("app-store")).toMatch(/app store/i);
  });
});
