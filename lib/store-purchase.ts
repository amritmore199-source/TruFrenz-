/**
 * Store purchases → the receipt the server verifies.
 *
 * The store SDK hands back whatever the platform felt like returning: Android
 * gives a `purchaseToken`, iOS gives a signed JWS, and either may be missing a
 * field on a cancelled or restored transaction. This module keeps that untidy
 * shape out of the components and, more importantly, refuses to invent a token.
 * A receipt without proof is worthless to the server, so it becomes `null` here
 * and the caller tells the member the store did not confirm the purchase.
 */

import type { StoreReceiptPayload } from "./account-client";
import { planIdForProductId, type StoreChannel } from "./subscription-store";

/**
 * The purchase fields we read, described structurally so this stays pure and
 * testable without the native SDK present.
 */
export type StorePurchaseLike = {
  productId?: string | null;
  purchaseToken?: string | null;
  purchaseTokenAndroid?: string | null;
  transactionId?: string | null;
  transactionReceipt?: string | null;
  originalTransactionIdentifierIOS?: string | null;
  originalTransactionId?: string | null;
};

/**
 * Which store a purchase came from, given the platform the app is running on.
 *
 * Deliberately narrower than `StoreChannel`: this describes an actual purchase,
 * so it can only ever be one of the two real stores. A `comp` is granted
 * server-side and never originates from a device, which is why it is excluded
 * here rather than handled below.
 */
export type StorePurchaseChannel = Exclude<StoreChannel, "comp">;

export function storeChannelForPlatform(platform: string): StorePurchaseChannel {
  return platform === "ios" ? "app-store" : "play";
}

/** The product ids to ask the store about, in plan order. */
export function subscriptionProductIds(productIds: readonly string[]): string[] {
  return [...productIds];
}

/**
 * The purchase token, whichever field this platform uses.
 *
 * Android: `purchaseToken`. iOS: the signed transaction (`transactionReceipt`,
 * or `purchaseToken` on newer SDK builds). Both count as proof — the server
 * decides which verification path to take.
 */
export function purchaseTokenOf(purchase: StorePurchaseLike): string | null {
  const candidates = [purchase.purchaseToken, purchase.purchaseTokenAndroid, purchase.transactionReceipt];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

/** The store's own transaction id, used for idempotency on the server. */
export function transactionIdOf(purchase: StorePurchaseLike): string | null {
  const candidates = [
    purchase.transactionId,
    purchase.originalTransactionIdentifierIOS,
    purchase.originalTransactionId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

/**
 * Map a store purchase to the receipt the server verifies.
 *
 * Returns `null` when the store did not return a product we sell, or returned no
 * usable token. The caller treats `null` as "the store did not confirm this",
 * never as a free upgrade.
 */
export function toReceiptPayload(
  purchase: StorePurchaseLike,
  channel: StorePurchaseChannel,
): StoreReceiptPayload | null {
  const productId = typeof purchase.productId === "string" ? purchase.productId.trim() : "";
  if (!productId || !planIdForProductId(productId)) return null;

  const purchaseToken = purchaseTokenOf(purchase);
  if (!purchaseToken) return null;

  const transactionId = transactionIdOf(purchase);
  // iOS sends a signed transaction rather than an opaque token, so pass it along
  // for the server's JWS check while keeping the token as the fallback proof.
  const signedTransaction =
    channel === "app-store" && purchaseToken.split(".").length === 3 ? purchaseToken : null;

  return {
    channel,
    productId,
    purchaseToken,
    signedTransaction,
    originalTransactionId: transactionId ?? purchaseToken,
  };
}

/** True when this purchase is for a product the app sells. */
export function isKnownProduct(purchase: StorePurchaseLike): boolean {
  const productId = typeof purchase.productId === "string" ? purchase.productId.trim() : "";
  return Boolean(productId) && planIdForProductId(productId) !== null;
}

/**
 * What to say when the store hands back something unusable.
 *
 * Members read this, so it explains the next step rather than naming a field.
 */
export const STORE_INCOMPLETE_PURCHASE =
  "The store did not confirm that purchase. Nothing was charged — try again, or restore purchases if you were already billed.";

/** What to say when the store sheet itself fails or is dismissed. */
export function storePurchaseFailureMessage(reason?: string): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return "The store did not complete the purchase.";
  if (/cancel/i.test(trimmed)) return "Purchase cancelled. Nothing was charged.";
  return trimmed;
}
