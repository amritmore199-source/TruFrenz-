/**
 * The store client.
 *
 * `react-native-iap` is a native module, so it only exists in a development or
 * production build — never in Expo Go and never on web. Everything here is
 * therefore lazy: the SDK is imported the moment a real purchase starts, and on
 * web (or if the import fails) the app falls back to a clearly-labelled demo
 * receipt so the paywall, verification, and management screens still work
 * end to end in the browser preview.
 *
 * What the store returns is never trusted by the app itself: the receipt is
 * handed to the server, which is the only thing allowed to grant Premium.
 */

import { Platform } from "react-native";

import {
  STORE_INCOMPLETE_PURCHASE,
  storeChannelForPlatform,
  storePurchaseFailureMessage,
  toReceiptPayload,
  type StorePurchaseLike,
} from "./store-purchase";

export { storeChannelForPlatform };
import { productIdForPlan, STORE_PRODUCTS } from "./subscription-store";
import type { StorePurchaseChannel } from "./store-purchase";
import type { PlanId } from "./subscription";
import type { StoreReceiptPayload } from "./account-client";

/** Where the receipt came from, so the member can be told the truth about it. */
export type PurchaseOrigin = "store" | "demo";

export type StorePurchaseOutcome =
  | { ok: true; origin: PurchaseOrigin; receipt: StoreReceiptPayload }
  | { ok: false; cancelled: boolean; error: string };

/**
 * True only where the native SDK can actually load.
 *
 * `Platform.OS` is enough: the module is linked into the native build, so on
 * web it must never be imported, and on a device the import either resolves or
 * fails loudly (which we catch).
 */
export function storeSdkAvailable(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/**
 * The store this device buys through.
 *
 * Narrower than `StoreChannel` because a device can only ever be on one of the
 * two real stores: a `comp` is granted server-side and has no originating
 * platform.
 */
export function currentStoreChannel(): StorePurchaseChannel {
  return storeChannelForPlatform(Platform.OS);
}

/**
 * A demo receipt, used only when no store is present (web preview, Expo Go).
 *
 * It is deliberately identifiable — the token starts with `demo-` and the
 * server records the resulting entitlement as `sandbox`, so simulated revenue is
 * never mistaken for real revenue.
 */
export function demoReceipt(planId: PlanId, accountHint: string): StoreReceiptPayload {
  const productId = productIdForPlan(planId);
  const token = `demo-${currentStoreChannel()}-${productId}-${accountHint || "guest"}-${Date.now()}`;
  return {
    channel: currentStoreChannel(),
    productId,
    purchaseToken: token,
    signedTransaction: null,
    originalTransactionId: token,
  };
}

/* ----------------------------- native SDK path ---------------------------- */

type IapModule = {
  initConnection: () => Promise<boolean>;
  endConnection: () => Promise<boolean>;
  fetchProducts: (request: { skus: string[]; type: "subs" }) => Promise<
    Array<{
      id?: string;
      productId?: string;
      /*
       * How the store renders the price for *this* account's country, plus the
       * numeric amount when the platform exposes one. Field names have varied
       * across SDK versions, so `parseStorePriceQuotes` reads all of them.
       */
      displayPrice?: string;
      localizedPrice?: string;
      priceString?: string;
      price?: number | string;
      priceAmountMicros?: number | string;
      priceAmount?: number | string;
      currency?: string;
      currencyCode?: string;
      isoCurrencyCode?: string;
      subscriptionOfferDetailsAndroid?: Array<{ offerToken?: string | null }>;
      subscriptionOffers?: Array<{ offerToken?: string | null }>;
    }>
  >;
  requestPurchase: (request: unknown) => Promise<unknown>;
  finishTransaction: (args: { purchase: unknown; isConsumable?: boolean }) => Promise<void>;
  getAvailablePurchases: () => Promise<StorePurchaseLike[]>;
};

/** Load the native SDK. Throws if this build does not include it. */
async function loadIap(): Promise<IapModule> {
  const module = (await import("react-native-iap")) as unknown as IapModule;
  if (typeof module.initConnection !== "function" || typeof module.requestPurchase !== "function") {
    throw new Error("The in-app purchase SDK is not available in this build.");
  }
  return module;
}

/** Read the plan's offer token, which Google Play requires for subscriptions. */
function offerTokenFor(
  products: Awaited<ReturnType<IapModule["fetchProducts"]>>,
  productId: string,
): string | null {
  const product = products.find(
    (item) => (item.id ?? item.productId ?? "") === productId,
  );
  const details = product?.subscriptionOfferDetailsAndroid ?? product?.subscriptionOffers ?? [];
  const token = details.find((offer) => typeof offer.offerToken === "string" && offer.offerToken)?.offerToken;
  return token ?? null;
}

/**
 * Buy a plan through the platform store.
 *
 * The purchase is finished (acknowledged) only after the server has verified the
 * receipt. Google Play refunds a subscription that is never acknowledged, so
 * finishing early would hand out Premium for a charge the store may reverse.
 */
export async function purchasePlanThroughStore(planId: PlanId): Promise<StorePurchaseOutcome> {
  let iap: IapModule;
  try {
    iap = await loadIap();
  } catch (error) {
    return {
      ok: false,
      cancelled: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "This build does not include the in-app purchase SDK.",
    };
  }

  const productId = productIdForPlan(planId);
  let purchase: StorePurchaseLike | null = null;

  try {
    await iap.initConnection();
    const products = await iap.fetchProducts({ skus: [productId], type: "subs" });
    if (!products.length) {
      return {
        ok: false,
        cancelled: false,
        error: `The store does not list ${productId} for this account yet.`,
      };
    }

    const offerToken = offerTokenFor(products, productId);
    const google = offerToken
      ? { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken }] }
      : { skus: [productId] };

    const result = (await iap.requestPurchase({
      request: { apple: { sku: productId }, google },
      type: "subs",
    })) as StorePurchaseLike | StorePurchaseLike[] | null;

    purchase = Array.isArray(result) ? (result[0] ?? null) : result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, cancelled: /cancel/i.test(message), error: storePurchaseFailureMessage(message) };
  }

  if (!purchase) {
    // The sheet closed without a purchase — a dismissal, not a failure.
    return { ok: false, cancelled: true, error: storePurchaseFailureMessage("cancelled") };
  }

  const receipt = toReceiptPayload(purchase, currentStoreChannel());
  if (!receipt) {
    return { ok: false, cancelled: false, error: STORE_INCOMPLETE_PURCHASE };
  }

  return { ok: true, origin: "store", receipt };
}

/** Acknowledge a verified purchase so the store stops chasing it. */
export async function finishVerifiedPurchase(receipt: StoreReceiptPayload): Promise<void> {
  if (!storeSdkAvailable()) return;
  try {
    const iap = await loadIap();
    await iap.initConnection();
    await iap.finishTransaction({
      purchase: {
        productId: receipt.productId,
        purchaseToken: receipt.purchaseToken,
        transactionId: receipt.originalTransactionId ?? receipt.purchaseToken,
      },
      isConsumable: false,
    });
  } catch {
    // Acknowledging is best-effort: the server already has the receipt, and the
    // store retries acknowledgement on the next launch.
  }
}

/**
 * The store's purchase history for this account, used by Restore purchases.
 *
 * Returns an empty list rather than throwing when the SDK is unavailable, so the
 * caller can report "nothing found" honestly.
 */
export async function storePurchaseHistory(): Promise<StoreReceiptPayload[]> {
  if (!storeSdkAvailable()) return [];
  try {
    const iap = await loadIap();
    await iap.initConnection();
    const purchases = await iap.getAvailablePurchases();
    const channel = currentStoreChannel();
    return purchases
      .map((purchase) => toReceiptPayload(purchase, channel))
      .filter((receipt): receipt is StoreReceiptPayload => receipt !== null);
  } catch {
    return [];
  }
}

/** The product ids the app expects the store to know about. */
export function expectedStoreProducts(): string[] {
  return STORE_PRODUCTS.map((product) => product.productId);
}

/**
 * Ask the store what it charges for each plan, in the member's own market.
 *
 * Returns null when there is no store to ask — on web, in Expo Go, or if the SDK
 * is missing — which the caller treats as "keep showing the rupee catalogue".
 * This is a lookup, not a purchase: it opens no sheet and takes no money.
 */
export async function fetchStorePrices(): Promise<StorePriceQuotes | null> {
  if (!storeSdkAvailable()) return null;
  try {
    const iap = await loadIap();
    await iap.initConnection();
    const products = await iap.fetchProducts({ skus: expectedStoreProducts(), type: "subs" });
    const quotes = parseStorePriceQuotes(products, productIdForPlan);
    // Nothing readable means the caller should stay on the catalogue price
    // rather than render an empty price line.
    return Object.keys(quotes).length > 0 ? quotes : null;
  } catch {
    return null;
  }
}
import { parseStorePriceQuotes, type StorePriceQuote } from "./store-prices";

/** The plan-keyed quotes a price fetch returns. */
export type StorePriceQuotes = Partial<Record<PlanId, StorePriceQuote>>;
