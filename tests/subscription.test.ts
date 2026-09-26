import { describe, expect, it } from "vitest";

import {
  BANNER_AD_COPY,
  DEFAULT_PLAN_ID,
  DEFAULT_SUBSCRIPTION,
  FEATURE_COMPARISON,
  FREE_ENTITLEMENTS,
  FREE_GROUP_CAP,
  FREE_HANGOUT_PROPOSALS,
  LAUNCH_OFFERS,
  PLANS,
  PREMIUM_ENTITLEMENTS,
  PREMIUM_GROUP_CAP,
  UNLIMITED,
  adFreeGate,
  advancedFilterGate,
  callingGate,
  cancelSubscription,
  entitlementsFor,
  formatInr,
  groupCapacityGate,
  hangoutProposalGate,
  interestedGate,
  isPremium,
  launchAnnualPriceInr,
  liveMapGate,
  monthlyEquivalent,
  parseSubscription,
  planById,
  planPriceLine,
  planSavingLine,
  readReceiptGate,
  renewalLine,
  savingsPercent,
  startSubscription,
  tierLabel,
  upgradeMessage,
} from "../lib/subscription";

describe("plan ladder", () => {
  it("publishes the three agreed plans in order", () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(["monthly", "quarterly", "annual"]);
  });

  it("charges the agreed rupee prices", () => {
    expect(planById("monthly").priceInr).toBe(49);
    expect(planById("quarterly").priceInr).toBe(139);
    expect(planById("annual").priceInr).toBe(499);
  });

  it("bills for the agreed number of months", () => {
    expect(planById("monthly").months).toBe(1);
    expect(planById("quarterly").months).toBe(3);
    expect(planById("annual").months).toBe(12);
  });

  it("falls back to the default plan for an unknown id", () => {
    expect(planById("lifetime").id).toBe(DEFAULT_PLAN_ID);
    expect(planById(null).id).toBe(DEFAULT_PLAN_ID);
    expect(planById(undefined).id).toBe(DEFAULT_PLAN_ID);
  });

  it("has a sane default plan", () => {
    expect(PLANS.some((plan) => plan.id === DEFAULT_PLAN_ID)).toBe(true);
  });
});

describe("effective monthly price", () => {
  it("matches the published per-month figures", () => {
    expect(monthlyEquivalent(planById("monthly"))).toBe(49);
    expect(monthlyEquivalent(planById("quarterly"))).toBe(46);
    expect(monthlyEquivalent(planById("annual"))).toBe(42);
  });

  it("always beats paying monthly over the same period", () => {
    const monthly = monthlyEquivalent(planById("monthly"));
    expect(monthlyEquivalent(planById("quarterly"))).toBeLessThan(monthly);
    expect(monthlyEquivalent(planById("annual"))).toBeLessThan(monthly);
  });
});

describe("savings", () => {
  it("reports the published savings", () => {
    expect(savingsPercent(planById("quarterly"))).toBe(5);
    expect(savingsPercent(planById("annual"))).toBe(15);
  });

  it("shows no saving on the monthly plan", () => {
    expect(savingsPercent(planById("monthly"))).toBe(0);
    expect(planSavingLine(planById("monthly"))).toBe("");
  });

  it("formats a saving line for the longer plans", () => {
    expect(planSavingLine(planById("quarterly"))).toBe("Save ~5%");
    expect(planSavingLine(planById("annual"))).toBe("Save ~15%");
  });
});

describe("price formatting", () => {
  it("writes rupees with the symbol and no decimals", () => {
    expect(formatInr(49)).toBe("₹49");
    expect(formatInr(499.4)).toBe("₹499");
  });

  it("writes a monthly plan as per-month", () => {
    expect(planPriceLine(planById("monthly"))).toBe("₹49 / month");
  });

  it("writes longer plans as per-period", () => {
    expect(planPriceLine(planById("quarterly"))).toBe("₹139 / 3 months");
    expect(planPriceLine(planById("annual"))).toBe("₹499 / 12 months");
  });
});

describe("launch offers", () => {
  it("lists the three agreed offers", () => {
    expect(LAUNCH_OFFERS.map((offer) => offer.id)).toEqual(["launch", "referral", "festive"]);
  });

  it("ties the launch discount to the annual plan", () => {
    expect(LAUNCH_OFFERS.find((offer) => offer.id === "launch")?.planId).toBe("annual");
  });

  it("takes 20% off the annual plan", () => {
    expect(launchAnnualPriceInr(20)).toBe(399);
    expect(launchAnnualPriceInr(20)).toBeLessThan(planById("annual").priceInr);
  });
});

describe("entitlements", () => {
  it("gates the paid features on the free plan", () => {
    expect(FREE_ENTITLEMENTS.liveMap).toBe(false);
    expect(FREE_ENTITLEMENTS.calling).toBe(false);
    expect(FREE_ENTITLEMENTS.readReceipts).toBe(false);
    expect(FREE_ENTITLEMENTS.advancedFilters).toBe(false);
    expect(FREE_ENTITLEMENTS.seeInterested).toBe(false);
    expect(FREE_ENTITLEMENTS.priorityDiscovery).toBe(false);
    expect(FREE_ENTITLEMENTS.ads).toBe(true);
  });

  it("unlocks them on premium", () => {
    expect(PREMIUM_ENTITLEMENTS.liveMap).toBe(true);
    expect(PREMIUM_ENTITLEMENTS.calling).toBe(true);
    expect(PREMIUM_ENTITLEMENTS.readReceipts).toBe(true);
    expect(PREMIUM_ENTITLEMENTS.advancedFilters).toBe(true);
    expect(PREMIUM_ENTITLEMENTS.seeInterested).toBe(true);
    expect(PREMIUM_ENTITLEMENTS.priorityDiscovery).toBe(true);
    expect(PREMIUM_ENTITLEMENTS.ads).toBe(false);
  });

  it("gives both tiers the free-by-design features", () => {
    for (const tier of ["free", "premium"] as const) {
      const entitlements = entitlementsFor(tier);
      expect(entitlements.privacyControls).toBe(true);
      expect(entitlements.friendRequests).toBe(UNLIMITED);
    }
  });

  it("caps free groups at five and premium at one hundred", () => {
    expect(FREE_ENTITLEMENTS.groupCapacity).toBe(FREE_GROUP_CAP);
    expect(PREMIUM_ENTITLEMENTS.groupCapacity).toBe(PREMIUM_GROUP_CAP);
    expect(FREE_GROUP_CAP).toBe(5);
    expect(PREMIUM_GROUP_CAP).toBe(100);
  });

  it("limits free hangout proposals to ten", () => {
    expect(FREE_ENTITLEMENTS.hangoutProposals).toBe(10);
    expect(PREMIUM_ENTITLEMENTS.hangoutProposals).toBe(UNLIMITED);
  });

  it("never makes premium worse than free", () => {
    for (const key of Object.keys(FREE_ENTITLEMENTS) as (keyof typeof FREE_ENTITLEMENTS)[]) {
      const free = FREE_ENTITLEMENTS[key];
      const premium = PREMIUM_ENTITLEMENTS[key];
      if (typeof free === "boolean") {
        // Ads is the one flag where "off" is the upgrade.
        if (key === "ads") expect(premium).toBe(false);
        else expect(premium).toBe(true);
      } else {
        expect(premium).toBeGreaterThanOrEqual(free);
      }
    }
  });

  it("reports the tier plainly", () => {
    expect(isPremium("premium")).toBe(true);
    expect(isPremium("free")).toBe(false);
    expect(tierLabel("premium")).toBe("Premium");
    expect(tierLabel("free")).toBe("Free");
  });
});

describe("feature comparison table", () => {
  it("covers every published row", () => {
    expect(FEATURE_COMPARISON).toHaveLength(17);
  });

  it("names the paid-only rows", () => {
    const labels = FEATURE_COMPARISON.map((row) => row.label);
    expect(labels).toContain("Live map and exact distance");
    expect(labels).toContain("Voice and video calling");
    expect(labels).toContain("Read receipts");
    expect(labels).toContain("Advanced filters");
    expect(labels).toContain("Priority in Discovery");
    expect(labels).toContain("Who requested or is interested");
    expect(labels).toContain("Ads");
  });

  it("shows the group cap in the cells rather than hardcoding it twice", () => {
    const row = FEATURE_COMPARISON.find((entry) => entry.label === "Groups");
    expect(row?.free).toBe(`Up to ${FREE_GROUP_CAP} members`);
    expect(row?.premium).toBe(`Up to ${PREMIUM_GROUP_CAP} members`);
  });

  it("shows the free proposal allowance", () => {
    const row = FEATURE_COMPARISON.find((entry) => entry.label === "Hangout and meetup proposals");
    expect(row?.free).toBe(`First ${FREE_HANGOUT_PROPOSALS}`);
    expect(row?.premium).toBe("Unlimited");
  });

  it("never leaves a cell blank", () => {
    for (const row of FEATURE_COMPARISON) {
      expect(row.free.trim().length).toBeGreaterThan(0);
      expect(row.premium.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("feature gates", () => {
  it("blocks the paid features on free and explains the upgrade", () => {
    for (const gate of [liveMapGate("free"), callingGate("free"), readReceiptGate("free"), advancedFilterGate("free"), interestedGate("free")]) {
      expect(gate.allowed).toBe(false);
      expect(gate.message).toMatch(/Premium/);
    }
  });

  it("allows the paid features on premium", () => {
    for (const gate of [liveMapGate("premium"), callingGate("premium"), readReceiptGate("premium"), advancedFilterGate("premium"), interestedGate("premium")]) {
      expect(gate.allowed).toBe(true);
      expect(gate.message).toBe("");
    }
  });

  it("keeps ads for free and removes them for premium", () => {
    expect(adFreeGate("free").allowed).toBe(false);
    expect(adFreeGate("premium").allowed).toBe(true);
    expect(BANNER_AD_COPY).toMatch(/Premium/);
  });

  it("names the feature in the generic upgrade message", () => {
    expect(upgradeMessage("Live map")).toBe("Live map is part of Trufrenz Premium. Upgrade to unlock it.");
  });
});

describe("group capacity gate", () => {
  it("lets a free member keep adding below the cap", () => {
    expect(groupCapacityGate("free", 0).allowed).toBe(true);
    expect(groupCapacityGate("free", FREE_GROUP_CAP - 1).allowed).toBe(true);
  });

  it("stops a free member at the cap with an upgrade prompt", () => {
    const gate = groupCapacityGate("free", FREE_GROUP_CAP);
    expect(gate.allowed).toBe(false);
    expect(gate.message).toMatch(/Premium/);
    expect(gate.message).toContain(String(PREMIUM_GROUP_CAP));
  });

  it("lets a premium member grow past the free cap", () => {
    expect(groupCapacityGate("premium", FREE_GROUP_CAP).allowed).toBe(true);
    expect(groupCapacityGate("premium", PREMIUM_GROUP_CAP - 1).allowed).toBe(true);
  });

  it("stops a premium member at the premium cap without selling anything", () => {
    const gate = groupCapacityGate("premium", PREMIUM_GROUP_CAP);
    expect(gate.allowed).toBe(false);
    expect(gate.message).not.toMatch(/Upgrade/);
  });
});

describe("hangout proposal gate", () => {
  it("lets a free member send the first ten", () => {
    expect(hangoutProposalGate("free", 0).allowed).toBe(true);
    expect(hangoutProposalGate("free", FREE_HANGOUT_PROPOSALS - 1).allowed).toBe(true);
  });

  it("nudges a free member to upgrade on the eleventh", () => {
    const gate = hangoutProposalGate("free", FREE_HANGOUT_PROPOSALS);
    expect(gate.allowed).toBe(false);
    expect(gate.message).toMatch(/Premium/);
  });

  it("never limits a premium member", () => {
    expect(hangoutProposalGate("premium", 0).allowed).toBe(true);
    expect(hangoutProposalGate("premium", 10_000).allowed).toBe(true);
  });
});

describe("subscription state", () => {
  it("starts on the free plan", () => {
    expect(DEFAULT_SUBSCRIPTION.tier).toBe("free");
    expect(DEFAULT_SUBSCRIPTION.renewsOn).toBeNull();
  });

  it("sets a renewal date when a purchase completes", () => {
    const subscription = startSubscription("quarterly", new Date("2026-01-31T10:00:00Z"));
    expect(subscription.tier).toBe("premium");
    expect(subscription.planId).toBe("quarterly");
    expect(subscription.pending).toBe(false);
    expect(subscription.renewsOn).not.toBeNull();
  });

  it("renews a monthly plan one month later", () => {
    const subscription = startSubscription("monthly", new Date("2026-03-15T00:00:00Z"));
    const renews = new Date(subscription.renewsOn!);
    expect(renews.getMonth()).toBe(new Date("2026-04-15T00:00:00Z").getMonth());
  });

  it("renews an annual plan a year later", () => {
    const subscription = startSubscription("annual", new Date("2026-03-15T00:00:00Z"));
    expect(new Date(subscription.renewsOn!).getFullYear()).toBe(2027);
  });

  it("returns to free when cancelled", () => {
    const cancelled = cancelSubscription();
    expect(cancelled.tier).toBe("free");
    expect(cancelled.renewsOn).toBeNull();
  });

  it("writes a renewal line for premium only", () => {
    expect(renewalLine(DEFAULT_SUBSCRIPTION)).toBe("");
    expect(renewalLine(startSubscription("monthly", new Date("2026-12-26T00:00:00Z")))).toMatch(/^Renews 26 /);
  });
});

describe("reading back a stored subscription", () => {
  it("restores a premium subscription", () => {
    const stored = startSubscription("annual", new Date("2026-06-01T00:00:00Z"));
    const parsed = parseSubscription(JSON.parse(JSON.stringify(stored)));
    expect(parsed.tier).toBe("premium");
    expect(parsed.planId).toBe("annual");
  });

  it("falls back to free for junk", () => {
    for (const junk of [null, undefined, 42, "premium", [], {}]) {
      expect(parseSubscription(junk).tier).toBe("free");
    }
  });

  it("never grants premium from a partial record", () => {
    // Only an explicit tier of "premium" unlocks anything.
    expect(parseSubscription({ planId: "annual" }).tier).toBe("free");
    expect(parseSubscription({ tier: "Premium" }).tier).toBe("free");
    expect(parseSubscription({ tier: "premium" }).tier).toBe("premium");
  });

  it("drops a malformed renewal date rather than showing an invalid one", () => {
    const parsed = parseSubscription({ tier: "premium", planId: "monthly", renewsOn: "not-a-date" });
    expect(parsed.renewsOn).toBeNull();
    expect(renewalLine(parsed)).toBe("");
  });

  it("falls back to the default plan for an unknown stored plan", () => {
    const parsed = parseSubscription({ tier: "premium", planId: "lifetime" });
    expect(parsed.planId).toBe(DEFAULT_PLAN_ID);
  });
});
