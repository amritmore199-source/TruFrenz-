/**
 * Store prices.
 *
 * The catalogue in `lib/subscription.ts` prices the plans in rupees, because
 * India is the launch market and the paywall has to say *something* before a
 * store connection exists. The store, however, is the only party that knows what
 * a member will actually be charged: Play and the App Store both localise the
 * subscription price for the account's own country, and the console price is
 * whatever operations entered there. Showing the rupee figure to someone paying
 * in another currency is therefore a mismatched number at the exact moment money
 * changes hands.
 *
 * So the store's own quote wins whenever we have one. Everything here is pure:
 * the native SDK call lives in `lib/store-client.ts`, and this module only turns
 * its response into something the paywall can render, plus a cache so the
 * paywall does not wait on the store to draw its first frame.
 */

import { planById, type Plan, type PlanId } from "./subscription";
import type { StoreChannel } from "./subscription-store";

/** One plan's price, as the store quoted it. */
export type StorePriceQuote = {
  productId: string;
  planId: PlanId;
  /**
   * Exactly how the store renders the price, e.g. "₹49.00" or "US$0.99".
   *
   * Kept as the store's own string rather than reformatted from the amount,
   * because the store applies the market's currency conventions — symbol
   * placement, decimal separators, and whether the currency has minor units at
   * all. Reformatting "¥1,200" as a number and back is how a paywall ends up
   * showing a price the member does not recognise.
   */
  displayPrice: string;
  /** Numeric amount in the store's currency, when it exposes one. */
  amount: number | null;
  /** ISO 4217 code, e.g. "INR". Play always supplies one; Apple sometimes does not. */
  currencyCode: string | null;
};

export type StorePriceCatalogue = {
  channel: StoreChannel;
  /** When the store was asked, so a stale read can be refreshed. */
  fetchedAt: number;
  quotes: Partial<Record<PlanId, StorePriceQuote>>;
};

export const STORE_PRICE_CACHE_KEY = "trufrenz.store-prices.v1";

/**
 * How long a quote stays good.
 *
 * Store prices change when operations change them in the console, which is rare
 * and always accompanied by a new app review for the App Store. Half a day keeps
 * the paywall instant on open while still picking up a change the same day.
 */
export const STORE_PRICE_TTL_MS = 12 * 60 * 60 * 1000;

/** A missing or broken cache is normal on a first launch: it just means no quote yet. */
export function parseStoredCatalogue(raw: unknown): StorePriceCatalogue | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StorePriceCatalogue>;
  if (value.channel !== "play" && value.channel !== "app-store") return null;
  if (typeof value.fetchedAt !== "number" || !Number.isFinite(value.fetchedAt)) return null;

  const quotes: Partial<Record<PlanId, StorePriceQuote>> = {};
  for (const planId of ["monthly", "quarterly", "annual"] as PlanId[]) {
    const quote = (value.quotes ?? {})[planId];
    if (!quote || typeof quote !== "object") continue;
    if (typeof quote.displayPrice !== "string" || !quote.displayPrice.trim()) continue;
    quotes[planId] = {
      productId: typeof quote.productId === "string" ? quote.productId : "",
      planId,
      displayPrice: quote.displayPrice.trim(),
      amount: typeof quote.amount === "number" && Number.isFinite(quote.amount) ? quote.amount : null,
      currencyCode: typeof quote.currencyCode === "string" ? quote.currencyCode.trim() : null,
    };
  }

  // A catalogue with no usable quotes is the same as having none, and keeping it
  // would make the paywall believe it had store prices when it did not.
  if (Object.keys(quotes).length === 0) return null;
  return { channel: value.channel, fetchedAt: value.fetchedAt, quotes };
}

export function isCatalogueFresh(
  catalogue: StorePriceCatalogue | null,
  now: number,
  ttlMs: number = STORE_PRICE_TTL_MS,
): boolean {
  if (!catalogue) return false;
  // A clock that moved backwards would otherwise pin a quote as fresh forever.
  if (catalogue.fetchedAt > now) return false;
  return now - catalogue.fetchedAt < ttlMs;
}

/**
 * Turn a store product response into quotes.
 *
 * Field names differ across SDK versions and platforms — `displayPrice` and
 * `localizedPrice` have both been the documented name at different times, and
 * Play and Apple disagree about whether a numeric amount is included — so every
 * field is read defensively and a product that yields no readable price is left
 * out rather than guessed at. A missing quote falls back to the rupee catalogue,
 * which is the pre-existing behaviour.
 */
export function parseStorePriceQuotes(
  raw: unknown,
  productIdForPlanId: (planId: PlanId) => string,
): Partial<Record<PlanId, StorePriceQuote>> {
  const list = Array.isArray(raw) ? raw : [];
  const quotes: Partial<Record<PlanId, StorePriceQuote>> = {};

  for (const planId of ["monthly", "quarterly", "annual"] as PlanId[]) {
    const wanted = productIdForPlanId(planId);
    const match = list.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Record<string, unknown>;
      const id = String(item.id ?? item.productId ?? item.sku ?? "");
      return id === wanted;
    });
    if (!match) continue;

    const item = match as Record<string, unknown>;
    const displayPrice = firstString(item.displayPrice, item.localizedPrice, item.priceString);
    if (!displayPrice) continue;

    const currencyCode = firstString(item.currency, item.currencyCode, item.isoCurrencyCode);

    quotes[planId] = {
      productId: wanted,
      planId,
      displayPrice,
      amount: readAmount(item),
      currencyCode: currencyCode ? currencyCode.toUpperCase() : null,
    };
  }

  return quotes;
}

/** How a price should read on the paywall, and where the number came from. */
export type PriceLine = {
  /** The full line, e.g. "₹49 / month" or "US$0.99 / month". */
  line: string;
  /** True when the store supplied this price, so nothing is being estimated. */
  fromStore: boolean;
};

/**
 * The price line for a plan.
 *
 * The store's quote replaces the rupee figure only — never the period, which is
 * a property of the plan rather than of the member's market. So a member reading
 * in another currency still sees "… / 3 months" and knows what they are buying.
 */
export function priceLineFor(plan: Plan, catalogue: StorePriceCatalogue | null): PriceLine {
  const quote = catalogue?.quotes[plan.id];
  const period = plan.months === 1 ? "month" : `${plan.months} months`;
  if (quote) return { line: `${quote.displayPrice} / ${period}`, fromStore: true };
  const price = planById(plan.id).priceInr;
  return { line: `₹${Math.round(price)} / ${period}`, fromStore: false };
}

/**
 * The saving against the monthly plan, computed in one consistent currency.
 *
 * This has to follow the same source as the prices above: quoting a store price
 * for the annual plan and a rupee-derived percentage beside it would compare two
 * different currencies. When the store quotes both plans, the percentage is
 * computed from those amounts; otherwise the rupee catalogue is used for both.
 * Returns an empty string when the monthly plan is the plan being priced, since
 * it saves nothing by definition.
 */
export function savingLineFor(plan: Plan, catalogue: StorePriceCatalogue | null): string {
  if (plan.months === 1) return "";

  const monthlyQuote = catalogue?.quotes.monthly;
  const planQuote = catalogue?.quotes[plan.id];
  const sameCurrency =
    monthlyQuote?.amount != null &&
    planQuote?.amount != null &&
    monthlyQuote.amount > 0 &&
    (monthlyQuote.currencyCode === null ||
      planQuote.currencyCode === null ||
      monthlyQuote.currencyCode === planQuote.currencyCode);

  let percent: number;
  if (sameCurrency) {
    const full = monthlyQuote!.amount! * plan.months;
    percent = full > 0 ? Math.round(((full - planQuote!.amount!) / full) * 100) : 0;
  } else {
    const monthly = planById("monthly");
    const full = monthly.priceInr * plan.months;
    percent = full > 0 ? Math.round(((full - plan.priceInr) / full) * 100) : 0;
  }

  return percent > 0 ? `Save ~${percent}%` : "";
}

/**
 * Whether the store is charging something other than the catalogue expects.
 *
 * This is a configuration check, not member-facing copy: the member always sees
 * the store's number, because that is the number they will be charged. A
 * mismatch means the console price and the price the paywall's own maths assumes
 * have drifted apart — most often because the launch discount was never entered
 * in the console — so it is reported to the developer log at QA time.
 *
 * Only INR quotes are comparable. In any other currency the difference is the
 * expected localisation, not a mismatch.
 */
export function priceMismatch(
  plan: Plan,
  catalogue: StorePriceCatalogue | null,
  expectedInr: number,
): { storeAmount: number; expectedInr: number } | null {
  const quote = catalogue?.quotes[plan.id];
  if (!quote || quote.amount === null) return null;
  if (quote.currencyCode !== "INR") return null;
  if (Math.round(quote.amount) === Math.round(expectedInr)) return null;
  return { storeAmount: quote.amount, expectedInr };
}

/** True when any plan has a store price, so a caller can skip the whole feature. */
export function hasStorePrices(catalogue: StorePriceCatalogue | null): boolean {
  if (!catalogue) return false;
  return Object.keys(catalogue.quotes).length > 0;
}

/**
 * The price as a number of currency units, whichever form the SDK used.
 *
 * Google Play reports `priceAmountMicros` — millionths of a unit — while Apple
 * reports `price` already in units. The two are not interchangeable, and getting
 * it wrong would make a ₹49 plan look like ₹49,000,000 to the mismatch check. So
 * the micros fields are converted here, once, and every caller downstream only
 * ever sees currency units.
 *
 * `price` is preferred when present: the SDKs set it alongside the micros value,
 * and it is already in units.
 */
function readAmount(item: Record<string, unknown>): number | null {
  const units = firstNumber(item.price);
  if (units !== null) return units;

  const micros = firstNumber(item.priceAmountMicros, item.priceAmount);
  if (micros !== null) return micros / 1_000_000;

  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // Some SDK versions hand back a numeric string.
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}