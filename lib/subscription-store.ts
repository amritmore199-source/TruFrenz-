/**
 * Store products, purchase lifecycle, usage counters, and upgrade nudges.
 *
 * `lib/subscription.ts` owns the published prices and what each tier includes.
 * This module owns the parts that only make sense once a real store is in the
 * loop: the product ids that must exist in Google Play Console and App Store
 * Connect, the lifecycle of a purchase (pending → verified → active), the
 * "Restore purchases" behaviour, the free-plan usage counters, and the soft
 * nudges shown near a limit.
 *
 * Everything here is pure so the purchase lifecycle and the nudge wording can
 * be tested without a store connection or a server.
 */

import {
  FREE_GROUP_CAP,
  FREE_HANGOUT_PROPOSALS,
  formatInr,
  launchAnnualPriceInr,
  planById,
  planPriceLine,
  PLANS,
  type Plan,
  type PlanId,
  type Subscription,
  type Tier,
} from "./subscription";

/* ------------------------------ store products --------------------------- */

/**
 * Where an entitlement came from.
 *
 * `comp` is a time-boxed grant an administrator made for a support case rather
 * than a purchase. It is kept in the same union because the app treats the
 * resulting entitlement identically — only the copy and the "is there a store to
 * manage this in?" question differ.
 */
export type StoreChannel = "play" | "app-store" | "comp";

export type StoreProduct = {
  /** The id that must exist in the store console. Never change it once shipped. */
  productId: string;
  planId: PlanId;
  /** What the store calls it in its own console. */
  storeName: string;
  /** Base price shown in the store listing. */
  priceInr: number;
  /** Whether the store charges it as an auto-renewing subscription. */
  autoRenewing: boolean;
};

/**
 * The three products to create before launch.
 *
 * `trufrenz.premium.*` is used unchanged on both stores: a single id per plan
 * keeps the verification endpoint simple, and the store tells us which channel
 * the receipt came from.
 */
export const STORE_PRODUCTS: readonly StoreProduct[] = PLANS.map((plan) => ({
  productId: `trufrenz.premium.${plan.id}`,
  planId: plan.id,
  storeName: `Trufrenz Premium — ${plan.label}`,
  priceInr: plan.priceInr,
  autoRenewing: true,
}));

export function storeProductFor(planId: PlanId): StoreProduct {
  return STORE_PRODUCTS.find((product) => product.planId === planId) ?? STORE_PRODUCTS[0];
}

export function productIdForPlan(planId: PlanId): string {
  return storeProductFor(planId).productId;
}

/** Resolve a store product id back to a plan, or null when it is unknown. */
export function planIdForProductId(productId: string): PlanId | null {
  const match = STORE_PRODUCTS.find((product) => product.productId === productId);
  return match ? match.planId : null;
}

/**
 * What the member is actually charged right now for a plan.
 *
 * The Annual plan carries the launch discount while the window is open, and the
 * store must be configured with that same promotional price so the receipt
 * matches the paywall.
 */
export function chargeForPlan(planId: PlanId, launchWindowOpen = true): number {
  const plan = planById(planId);
  if (plan.id === "annual" && launchWindowOpen) return launchAnnualPriceInr();
  return plan.priceInr;
}

/** e.g. "₹399 charged once a year" — used on the store-confirmation step. */
export function chargeLine(planId: PlanId, launchWindowOpen = true): string {
  const plan = planById(planId);
  const amount = chargeForPlan(planId, launchWindowOpen);
  if (plan.months === 1) return `${formatInr(amount)} charged every month`;
  if (plan.months === 12) return `${formatInr(amount)} charged once a year`;
  return `${formatInr(amount)} charged every ${plan.months} months`;
}

/* --------------------------- purchase lifecycle -------------------------- */

/**
 * Where a purchase is in its life.
 *
 * - `idle`     nothing has been bought
 * - `pending`  the store sheet is open or the charge has not settled
 * - `verifying` the store returned a receipt and the server is checking it
 * - `active`   the server confirmed the receipt and the tier is unlocked
 * - `failed`   the store declined, or the server rejected the receipt
 */
export type PurchaseStatus = "idle" | "pending" | "verifying" | "active" | "failed";

export type PurchaseState = {
  status: PurchaseStatus;
  planId: PlanId | null;
  /** Store transaction id once the store has returned one. */
  transactionId: string | null;
  /** Why a purchase failed, shown to the member. */
  error: string | null;
};

export const IDLE_PURCHASE: PurchaseState = {
  status: "idle",
  planId: null,
  transactionId: null,
  error: null,
};

export function beginPurchase(planId: PlanId): PurchaseState {
  return { status: "pending", planId, transactionId: null, error: null };
}

export function beginVerification(planId: PlanId, transactionId: string): PurchaseState {
  return { status: "verifying", planId, transactionId, error: null };
}

export function failPurchase(planId: PlanId | null, error: string): PurchaseState {
  return { status: "failed", planId, transactionId: null, error };
}

export function completePurchase(planId: PlanId, transactionId: string): PurchaseState {
  return { status: "active", planId, transactionId, error: null };
}

/** True while the member should see a spinner rather than the subscribe button. */
export function purchaseInFlight(purchase: PurchaseState): boolean {
  return purchase.status === "pending" || purchase.status === "verifying";
}

/** The button label for the current step of the purchase. */
export function purchaseButtonLabel(purchase: PurchaseState, planId: PlanId, launchWindowOpen = true): string {
  if (purchase.status === "pending" && purchase.planId === planId) return "Waiting for the store…";
  if (purchase.status === "verifying" && purchase.planId === planId) return "Verifying with Trufrenz…";
  return `Subscribe · ${formatInr(chargeForPlan(planId, launchWindowOpen))}`;
}

/* ---------------------------- restore purchases -------------------------- */

/**
 * A restore attempt. Members reinstall the app or switch phones and expect the
 * plan to come back, so "Restore purchases" replays the store's own history and
 * lets the server decide — never the client.
 */
export type RestoreState = {
  status: "idle" | "checking" | "restored" | "nothing" | "failed";
  planId: PlanId | null;
  message: string;
};

export const IDLE_RESTORE: RestoreState = { status: "idle", planId: null, message: "" };

export function beginRestore(): RestoreState {
  return { status: "checking", planId: null, message: "Checking your store account…" };
}

export function restoredState(planId: PlanId): RestoreState {
  const plan = planById(planId);
  return { status: "restored", planId, message: `${plan.label} Premium restored on this device.` };
}

export const NOTHING_TO_RESTORE: RestoreState = {
  status: "nothing",
  planId: null,
  message: "No previous Trufrenz Premium purchase was found for this store account.",
};

export function restoreFailed(reason: string): RestoreState {
  return { status: "failed", planId: null, message: reason };
}

/* ------------------------------- usage limits ---------------------------- */

/** What a member has used on the free plan, counted locally for the nudges. */
export type UsageCounters = {
  /** Hangout and meetup proposals sent. */
  proposalsSent: number;
  /** Friends in the largest group the member owns. */
  largestGroupSize: number;
};

export const EMPTY_USAGE: UsageCounters = { proposalsSent: 0, largestGroupSize: 0 };

export function parseUsage(raw: unknown): UsageCounters {
  if (!raw || typeof raw !== "object") return { ...EMPTY_USAGE };
  const value = raw as Record<string, unknown>;
  const proposalsSent = Number(value.proposalsSent);
  const largestGroupSize = Number(value.largestGroupSize);
  return {
    proposalsSent: Number.isFinite(proposalsSent) && proposalsSent > 0 ? Math.floor(proposalsSent) : 0,
    largestGroupSize: Number.isFinite(largestGroupSize) && largestGroupSize > 0 ? Math.floor(largestGroupSize) : 0,
  };
}

/**
 * How close a member is to a limit.
 *
 * - `hidden`   nothing to say yet
 * - `near`     one or two steps away — a quiet hint
 * - `at-limit` the next action is blocked — the nudge earns its place
 */
export type NudgeLevel = "hidden" | "near" | "at-limit";

export type UpgradeNudge = {
  level: NudgeLevel;
  title: string;
  body: string;
  /** Button label that opens the paywall. */
  cta: string;
  /** Which plan to preselect when the nudge opens the paywall. */
  planId: PlanId;
};

/** A nudge nobody needs to see. */
const NO_NUDGE: UpgradeNudge = { level: "hidden", title: "", body: "", cta: "", planId: "quarterly" };

/**
 * The hint shown above the Hangout / Meetup buttons.
 *
 * Free members get ten proposals. The counter starts speaking once three are
 * left, because a member who has used seven is the one who values the feature.
 */
export function proposalNudge(tier: Tier, used: number): UpgradeNudge {
  if (tier === "premium") return NO_NUDGE;
  const remaining = FREE_HANGOUT_PROPOSALS - Math.max(0, Math.floor(used));
  if (remaining > 3) return NO_NUDGE;
  if (remaining <= 0) {
    return {
      level: "at-limit",
      title: `All ${FREE_HANGOUT_PROPOSALS} free invites are used`,
      body: "Premium keeps hangout and meetup plans unlimited, so you can keep suggesting places without counting.",
      cta: "See Premium plans",
      planId: "quarterly",
    };
  }
  if (remaining === 1) {
    return {
      level: "near",
      title: "1 free hangout invite left",
      body: `You have used ${used} of ${FREE_HANGOUT_PROPOSALS} free invites. Premium makes them unlimited.`,
      cta: "Compare plans",
      planId: "quarterly",
    };
  }
  return {
    level: "near",
    title: `${remaining} free hangout invites left`,
    body: `You have used ${used} of ${FREE_HANGOUT_PROPOSALS} free invites. Premium makes them unlimited.`,
    cta: "Compare plans",
    planId: "quarterly",
  };
}

/**
 * The hint shown in Group Info once a circle is close to the free cap.
 *
 * Groups are the feature members outgrow fastest, so this fires with two seats
 * left and becomes the blocking prompt at the cap.
 */
export function groupCapacityNudge(tier: Tier, members: number): UpgradeNudge {
  if (tier === "premium") return NO_NUDGE;
  const size = Math.max(0, Math.floor(members));
  const seatsLeft = FREE_GROUP_CAP - size;
  if (seatsLeft > 2) return NO_NUDGE;
  if (seatsLeft <= 0) {
    return {
      level: "at-limit",
      title: `This circle is full at ${FREE_GROUP_CAP} friends`,
      body: `Premium grows a circle up to 100 friends, so nobody has to be left out of the plan.`,
      cta: "Grow this circle",
      planId: "annual",
    };
  }
  return {
    level: "near",
    title: seatsLeft === 1 ? "1 seat left in this circle" : `${seatsLeft} seats left in this circle`,
    body: `Free circles hold ${FREE_GROUP_CAP} friends. Premium grows them to 100, so the whole plan fits in one chat.`,
    cta: "See Premium plans",
    planId: "annual",
  };
}

/** A short, quiet line for the proposal strip — no card, no buttons. */
export function proposalHintLine(tier: Tier, used: number): string {
  if (tier === "premium") return "";
  const nudge = proposalNudge(tier, used);
  if (nudge.level === "hidden") return "";
  if (nudge.level === "at-limit") return `Free plan: ${FREE_HANGOUT_PROPOSALS} of ${FREE_HANGOUT_PROPOSALS} invites used`;
  return `Free plan: ${Math.max(0, Math.floor(used))} of ${FREE_HANGOUT_PROPOSALS} invites used`;
}

/* -------------------------- subscription screen copy --------------------- */

/** e.g. "Quarterly · ₹139 / 3 months". */
export function activePlanLine(subscription: Subscription): string {
  if (subscription.tier !== "premium") return "Free plan";
  const plan = planById(subscription.planId);
  return `${plan.label} · ${planPriceLine(plan)}`;
}

/** How many days are left in the paid period, or null when not premium. */
export function daysLeftInPeriod(subscription: Subscription, now: Date = new Date()): number | null {
  if (subscription.tier !== "premium" || !subscription.renewsOn) return null;
  const renews = new Date(subscription.renewsOn);
  if (Number.isNaN(renews.getTime())) return null;
  const ms = renews.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** e.g. "18 days left in this period". */
export function periodLine(subscription: Subscription, now: Date = new Date()): string {
  const days = daysLeftInPeriod(subscription, now);
  if (days === null) return "";
  if (days <= 0) return "Renews today";
  if (days === 1) return "1 day left in this period";
  return `${days} days left in this period`;
}

/**
 * What the store does when the member stops paying.
 *
 * Google Play and the App Store both keep the subscription until the period
 * ends, so the app must say so rather than implying instant loss.
 */
export const CANCEL_EXPLAINER =
  "Cancelling happens in your store account. Premium stays active until the end of the period you already paid for.";

/** The store deep-link label, per channel. */
export function storeManagementLine(channel: StoreChannel): string {
  if (channel === "play") return "Manage in Google Play → Subscriptions";
  if (channel === "app-store") return "Manage in App Store → Apple Account → Subscriptions";
  /*
   * A comp was never sold, so there is nothing in a store account to manage and
   * sending the member there would be a wasted trip. Their access simply ends on
   * the granted date, which the manage screen states instead.
   */
  return "Granted by the Trufrenz team — nothing to manage in a store";
}

/**
 * The receipt that governs access, out of everything on file.
 *
 * `entitlementForMember` derives the tier from the unexpired receipt with the
 * latest expiry, so the app must read the same row or the two can disagree about
 * where the member's Premium comes from — which is exactly the confusion that
 * would show a store link to someone whose Premium was granted, not bought.
 *
 * Kept as a plain function over a minimal shape so it can be tested directly
 * rather than only through the component that uses it.
 */
export function activeReceiptOf<T extends { expiresAt: string | Date }>(receipts: T[]): T | null {
  let best: T | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const receipt of receipts) {
    // An unparseable date cannot be compared, so it is skipped rather than
    // allowed to win with `NaN`.
    const at = new Date(receipt.expiresAt).getTime();
    if (!Number.isFinite(at)) continue;
    if (at > bestAt) {
      best = receipt;
      bestAt = at;
    }
  }
  return best;
}

/** Whether the entitlement governing access came from a gift rather than a sale. */
export function isComplimentaryChannel(channel: StoreChannel | null | undefined): boolean {
  return channel === "comp";
}

/**
 * What to say in place of a billing line when nothing was charged.
 *
 * "₹139 charged every 3 months" is simply false for a grant, and a member reading
 * it would reasonably go looking for the charge.
 */
export const COMP_BILLING_LINE = "No charge — granted by the Trufrenz team";

/**
 * What to say in place of the store-cancellation explainer for a grant.
 *
 * The ordinary explainer tells the member to go and switch off auto-renew in a
 * store account. For a comp there is no auto-renew to switch and no purchase in
 * that account, so there is nothing to cancel and no action to take at all.
 */
export const COMP_CANCEL_EXPLAINER =
  "There is nothing to cancel. Your Premium was granted by the Trufrenz team and ends on the date shown above.";

/** Where to send a member who wants their money back. */
export const REFUND_LINE =
  "Refunds are handled by the store that took the payment. Request one from your store account's purchase history.";
