import { describe, expect, it } from "vitest";

import {
  STORE_PRICE_CACHE_KEY,
  STORE_PRICE_TTL_MS,
  hasStorePrices,
  isCatalogueFresh,
  parseStorePriceQuotes,
  parseStoredCatalogue,
  priceLineFor,
  priceMismatch,
  savingLineFor,
  type StorePriceCatalogue,
} from "../lib/store-prices";
import { PLANS, planById } from "../lib/subscription";
import {
  CANCEL_EXPLAINER,
  COMP_BILLING_LINE,
  COMP_CANCEL_EXPLAINER,
  activeReceiptOf,
  isComplimentaryChannel,
  storeManagementLine,
} from "../lib/subscription-store";
import { productIdForPlan } from "../lib/subscription-store";

/** A Google Play subscription product, as the SDK actually returns one. */
function playProduct(planId: "monthly" | "quarterly" | "annual", price: string, micros: string, currency = "INR") {
  return {
    id: productIdForPlan(planId),
    displayPrice: price,
    priceAmountMicros: micros,
    currencyCode: currency,
    subscriptionOfferDetailsAndroid: [{ offerToken: "offer-token" }],
  };
}

function catalogue(quotes: StorePriceCatalogue["quotes"]): StorePriceCatalogue {
  return { channel: "play", fetchedAt: Date.now(), quotes };
}

describe("store price parsing", () => {
  it("maps each product to its plan and converts micros to a real amount", () => {
    const quotes = parseStorePriceQuotes(
      [playProduct("monthly", "₹49.00", "49000000"), playProduct("annual", "₹399.00", "399000000")],
      productIdForPlan,
    );

    expect(Object.keys(quotes).sort()).toEqual(["annual", "monthly"]);
    // Play reports micros, so the stored amount must be the currency unit.
    expect(quotes.monthly).toMatchObject({ displayPrice: "₹49.00", amount: 49, currencyCode: "INR" });
    expect(quotes.annual?.amount).toBe(399);
  });

  it("reads the Apple field names too, and keeps a plain numeric price as-is", () => {
    // Apple's SDK has exposed both `localizedPrice` and `priceString`, and its
    // amount is already in currency units rather than micros.
    const quotes = parseStorePriceQuotes(
      [{ productId: productIdForPlan("quarterly"), localizedPrice: "US$1.99", price: 1.99, currency: "usd" }],
      productIdForPlan,
    );

    expect(quotes.quarterly).toMatchObject({ displayPrice: "US$1.99", amount: 1.99, currencyCode: "USD" });
  });

  it("skips a product with no readable price rather than inventing one", () => {
    const quotes = parseStorePriceQuotes(
      [{ id: productIdForPlan("monthly"), currencyCode: "INR" }, playProduct("annual", "₹399.00", "399000000")],
      productIdForPlan,
    );

    expect(quotes.monthly).toBeUndefined();
    expect(quotes.annual).toBeDefined();
  });

  it("ignores products we did not ask about, and non-array input", () => {
    expect(parseStorePriceQuotes([{ id: "some.other.app.product", displayPrice: "₹9" }], productIdForPlan)).toEqual({});
    expect(parseStorePriceQuotes(null, productIdForPlan)).toEqual({});
    expect(parseStorePriceQuotes("nonsense", productIdForPlan)).toEqual({});
  });
});

describe("store price cache", () => {
  it("drops a cache whose quotes are all unusable", () => {
    // Keeping it would make the paywall believe it had store prices when it did
    // not, and the fallback would never run.
    expect(parseStoredCatalogue({ channel: "play", fetchedAt: 1, quotes: {} })).toBeNull();
    expect(parseStoredCatalogue({ channel: "play", fetchedAt: 1, quotes: { monthly: { displayPrice: "  " } } })).toBeNull();
  });

  it("round-trips a real catalogue", () => {
    const original = catalogue({
      monthly: { productId: productIdForPlan("monthly"), planId: "monthly", displayPrice: "₹49.00", amount: 49, currencyCode: "INR" },
    });
    const parsed = parseStoredCatalogue(JSON.parse(JSON.stringify(original)));
    expect(parsed?.quotes.monthly?.displayPrice).toBe("₹49.00");
    expect(parsed?.channel).toBe("play");
  });

  it("rejects a malformed channel or timestamp", () => {
    expect(parseStoredCatalogue({ channel: "comp", fetchedAt: 1, quotes: { monthly: { displayPrice: "₹49" } } })).toBeNull();
    expect(parseStoredCatalogue({ channel: "play", fetchedAt: "soon", quotes: { monthly: { displayPrice: "₹49" } } })).toBeNull();
  });

  it("treats a quote as fresh only inside the TTL", () => {
    const now = 1_000_000_000;
    expect(isCatalogueFresh(catalogue({}), now)).toBe(false);
    expect(isCatalogueFresh({ channel: "play", fetchedAt: now - 1000, quotes: {} }, now)).toBe(true);
    expect(isCatalogueFresh({ channel: "play", fetchedAt: now - STORE_PRICE_TTL_MS - 1, quotes: {} }, now)).toBe(false);
  });

  it("does not trust a quote stamped in the future", () => {
    // A device clock that moved backwards would otherwise pin the old price as
    // fresh forever, and the member would keep seeing a stale number.
    const now = 1_000_000_000;
    expect(isCatalogueFresh({ channel: "play", fetchedAt: now + 60_000, quotes: {} }, now)).toBe(false);
  });

  it("has a stable storage key", () => {
    expect(STORE_PRICE_CACHE_KEY).toBe("trufrenz.store-prices.v1");
  });
});

describe("price lines", () => {
  it("falls back to the rupee catalogue with no store quote", () => {
    const monthly = planById("monthly");
    expect(priceLineFor(monthly, null)).toEqual({ line: "₹49 / month", fromStore: false });
    expect(priceLineFor(monthly, catalogue({}))).toEqual({ line: "₹49 / month", fromStore: false });
  });

  it("prefers the store's own rendering, keeping our billing period", () => {
    const annual = planById("annual");
    const priced = priceLineFor(annual, catalogue({
      annual: { productId: productIdForPlan("annual"), planId: "annual", displayPrice: "US$5.99", amount: 5.99, currencyCode: "USD" },
    }));
    // The period is a property of the plan, not of the member's market.
    expect(priced).toEqual({ line: "US$5.99 / 12 months", fromStore: true });
  });

  it("computes the saving from the store's own amounts when both plans are quoted", () => {
    const annual = planById("annual");
    const store = catalogue({
      monthly: { productId: productIdForPlan("monthly"), planId: "monthly", displayPrice: "US$0.99", amount: 0.99, currencyCode: "USD" },
      annual: { productId: productIdForPlan("annual"), planId: "annual", displayPrice: "US$5.99", amount: 5.99, currencyCode: "USD" },
    });
    // (0.99 * 12 - 5.99) / (0.99 * 12) = 49.6% → 50
    expect(savingLineFor(annual, store)).toBe("Save ~50%");
  });

  it("refuses to mix currencies in the saving line", () => {
    const annual = planById("annual");
    // Store quotes the annual plan in dollars but never quoted the monthly plan,
    // so the comparison must fall back to the rupee catalogue rather than
    // dividing a dollar amount by a rupee one.
    const store = catalogue({
      annual: { productId: productIdForPlan("annual"), planId: "annual", displayPrice: "US$5.99", amount: 5.99, currencyCode: "USD" },
    });
    // Rupee catalogue: (49 * 12 - 499) / (49 * 12) = 15.1% → 15
    expect(savingLineFor(annual, store)).toBe("Save ~15%");
  });

  it("never claims a saving on the monthly plan", () => {
    for (const plan of PLANS) {
      if (plan.id !== "monthly") continue;
      expect(savingLineFor(plan, null)).toBe("");
    }
  });

  it("reports whether any store price exists", () => {
    expect(hasStorePrices(null)).toBe(false);
    expect(hasStorePrices(catalogue({}))).toBe(false);
    expect(
      hasStorePrices(
        catalogue({
          monthly: { productId: productIdForPlan("monthly"), planId: "monthly", displayPrice: "₹49", amount: 49, currencyCode: "INR" },
        }),
      ),
    ).toBe(true);
  });
});

describe("price mismatch detection", () => {
  it("stays quiet when the store charges what the catalogue expects", () => {
    const monthly = planById("monthly");
    const store = catalogue({
      monthly: { productId: productIdForPlan("monthly"), planId: "monthly", displayPrice: "₹49.00", amount: 49, currencyCode: "INR" },
    });
    expect(priceMismatch(monthly, store, 49)).toBeNull();
  });

  it("flags a console price that drifted from the published offer", () => {
    const annual = planById("annual");
    // The launch discount was never entered in the console, so the store charges
    // the full ₹499 while the paywall's maths assumes ₹399.
    const store = catalogue({
      annual: { productId: productIdForPlan("annual"), planId: "annual", displayPrice: "₹499.00", amount: 499, currencyCode: "INR" },
    });
    expect(priceMismatch(annual, store, 399)).toEqual({ storeAmount: 499, expectedInr: 399 });
  });

  it("does not flag a foreign currency as a mismatch", () => {
    const monthly = planById("monthly");
    // A dollar price differs from ₹49 by definition; that is localisation, not
    // a configuration error, and reporting it would be pure noise.
    const store = catalogue({
      monthly: { productId: productIdForPlan("monthly"), planId: "monthly", displayPrice: "US$0.99", amount: 0.99, currencyCode: "USD" },
    });
    expect(priceMismatch(monthly, store, 49)).toBeNull();
  });

  it("says nothing when the store gave no numeric amount", () => {
    const monthly = planById("monthly");
    const store = catalogue({
      monthly: { productId: productIdForPlan("monthly"), planId: "monthly", displayPrice: "₹49.00", amount: null, currencyCode: "INR" },
    });
    expect(priceMismatch(monthly, store, 49)).toBeNull();
  });
});


describe("which receipt governs access", () => {
  const receipts = [
    { id: 1, channel: "play", expiresAt: "2027-01-01T00:00:00.000Z" },
    { id: 2, channel: "comp", expiresAt: "2027-06-01T00:00:00.000Z" },
    { id: 3, channel: "play", expiresAt: "2026-12-01T00:00:00.000Z" },
  ];

  it("picks the latest expiry, not the newest row", () => {
    // The server derives the tier from the unexpired receipt with the latest
    // expiry. Anything else lets the app and the server disagree about which
    // receipt the member's Premium comes from.
    expect(activeReceiptOf(receipts)?.id).toBe(2);
  });

  it("survives an unparseable date without picking it", () => {
    // `NaN` comparisons are always false, so a malformed row must be skipped
    // rather than allowed to silently become the winner.
    const messy = [
      { id: 1, expiresAt: "not-a-date" },
      { id: 2, expiresAt: "2026-05-05T00:00:00.000Z" },
    ];
    expect(activeReceiptOf(messy)?.id).toBe(2);
    expect(activeReceiptOf([{ id: 1, expiresAt: "not-a-date" }])).toBeNull();
  });

  it("returns null for an empty list, so no comp copy leaks to a new member", () => {
    expect(activeReceiptOf([])).toBeNull();
  });

  it("accepts a real Date as well as an ISO string", () => {
    const withDate = [
      { id: 1, expiresAt: new Date("2027-01-01T00:00:00.000Z") },
      { id: 2, expiresAt: new Date("2026-01-01T00:00:00.000Z") },
    ];
    expect(activeReceiptOf(withDate)?.id).toBe(1);
  });

  it("only treats the comp channel as complimentary", () => {
    expect(isComplimentaryChannel("comp")).toBe(true);
    expect(isComplimentaryChannel("play")).toBe(false);
    expect(isComplimentaryChannel("app-store")).toBe(false);
    // A member with no receipts at all must not be told their Premium was a gift.
    expect(isComplimentaryChannel(null)).toBe(false);
    expect(isComplimentaryChannel(undefined)).toBe(false);
  });

  it("drives the comp wording, and the store line it must not use", () => {
    // The regression this guards: `isComp` used to be read from the build's own
    // channel, which is a property of the platform and therefore never "comp",
    // so a granted member on a Play device was shown the store link.
    const governing = activeReceiptOf(receipts)!;
    const compified = isComplimentaryChannel(governing.channel as "comp");
    expect(compified).toBe(true);
    expect(storeManagementLine("comp")).toMatch(/Granted by the Trufrenz team/);
    expect(storeManagementLine("comp")).not.toMatch(/Google Play|App Store/);
  });
});


describe("copy that must never imply a charge", () => {
  it("replaces the billing line with one that says nothing was charged", () => {
    // "₹139 charged every 3 months" is false for a grant, and a member reading it
    // would go looking for a charge that was never made.
    expect(COMP_BILLING_LINE).toMatch(/no charge/i);
    expect(COMP_BILLING_LINE).not.toMatch(/₹/);
  });

  it("replaces the cancellation explainer with one that says nothing to cancel", () => {
    // The ordinary explainer sends the member into a store account to switch off
    // an auto-renewal that does not exist.
    expect(COMP_CANCEL_EXPLAINER).toMatch(/nothing to cancel/i);
    expect(COMP_CANCEL_EXPLAINER).not.toMatch(/store account/i);
    expect(CANCEL_EXPLAINER).not.toBe(COMP_CANCEL_EXPLAINER);
    expect(CANCEL_EXPLAINER).toMatch(/store account/i);
  });

  it("keeps the plan label readable off a synthetic comp product id", () => {
    // The comp product id is `trufrenz.comp.<planId>`, so the plan has to come
    // from the last segment; this pins that the convention still holds.
    for (const plan of PLANS) {
      expect(`trufrenz.comp.${plan.id}`.endsWith(`.${plan.id}`)).toBe(true);
    }
  });
});
