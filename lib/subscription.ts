/**
 * Trufrenz subscription tiers.
 *
 * One place decides what a plan includes, what it costs, and how a member is
 * told they have hit a limit. Everything here is pure so the pricing table and
 * the gating rules can be tested without a store connection.
 *
 * Prices are in Indian rupees and are written as plain numbers of paise-free
 * rupees. The store (Google Play Billing / Apple In-App Purchase) remains the
 * source of truth for what is actually charged; this catalogue drives the
 * paywall copy and the client-side gates.
 */

export type Tier = "free" | "premium";

/** Where the member's plan is cached on the device. */
export const SUBSCRIPTION_STORAGE_KEY = "trufrenz.subscription.v1";

/* ------------------------------- pricing -------------------------------- */

export type PlanId = "monthly" | "quarterly" | "annual";

export type Plan = {
  id: PlanId;
  label: string;
  /** Billing period in months. */
  months: number;
  /** Price charged each cycle, in INR. */
  priceInr: number;
  /** Short line used under the plan name. */
  blurb: string;
};

/** The published plan ladder. Order matters: it is the order shown on the paywall. */
export const PLANS: readonly Plan[] = [
  { id: "monthly", label: "Monthly", months: 1, priceInr: 49, blurb: "Flexible, cancel any time" },
  { id: "quarterly", label: "Quarterly", months: 3, priceInr: 139, blurb: "A season at a time" },
  { id: "annual", label: "Annual", months: 12, priceInr: 499, blurb: "Best value for the year" },
];

export const DEFAULT_PLAN_ID: PlanId = "quarterly";

/** The plan with this id, or the default when the id is unknown. */
export function planById(id: PlanId | string | null | undefined): Plan {
  return PLANS.find((plan) => plan.id === id) ?? PLANS.find((plan) => plan.id === DEFAULT_PLAN_ID)!;
}

/** Effective monthly cost, rounded to whole rupees. */
export function monthlyEquivalent(plan: Plan): number {
  return Math.round(plan.priceInr / plan.months);
}

/**
 * Saving against paying the monthly price for the same period, as a whole
 * percentage. The monthly plan therefore saves nothing.
 */
export function savingsPercent(plan: Plan): number {
  const monthly = planById("monthly");
  if (plan.id === monthly.id) return 0;
  const full = monthly.priceInr * plan.months;
  if (full <= 0) return 0;
  return Math.round(((full - plan.priceInr) / full) * 100);
}

/** Format rupees the way the paywall shows them. */
export function formatInr(amount: number): string {
  return `₹${Math.round(amount)}`;
}

/** e.g. "₹42 / month", "₹49 / month", "₹139 / 3 months". */
export function planPriceLine(plan: Plan): string {
  if (plan.months === 1) return `${formatInr(plan.priceInr)} / month`;
  return `${formatInr(plan.priceInr)} / ${plan.months} months`;
}

/** e.g. "Save ~15%" — empty for the monthly plan. */
export function planSavingLine(plan: Plan): string {
  const percent = savingsPercent(plan);
  return percent > 0 ? `Save ~${percent}%` : "";
}

/* ------------------------------ launch offers ---------------------------- */

export type LaunchOffer = {
  id: string;
  title: string;
  detail: string;
  /** Which plan the offer applies to, when it is tied to one. */
  planId?: PlanId;
};

export const LAUNCH_OFFERS: readonly LaunchOffer[] = [
  {
    id: "launch",
    title: "Launch discount",
    detail: "20% off the Annual plan for the first 90 days after launch.",
    planId: "annual",
  },
  {
    id: "referral",
    title: "Referral perk",
    detail: "You and your friend each get a free month of Premium when they subscribe.",
  },
  {
    id: "festive",
    title: "Seasonal offers",
    detail: "Campaign slots such as New Year or admission season, run occasionally rather than always on.",
  },
];

/** Discounted annual price during the launch window. */
export function launchAnnualPriceInr(discountPercent = 20): number {
  const annual = planById("annual");
  return Math.round(annual.priceInr * (1 - discountPercent / 100));
}

/* ----------------------------- entitlements ------------------------------ */

/**
 * Everything a plan controls. Free is the baseline; Premium flips the gated
 * entries on. Keeping this as one table means a feature is never half-gated.
 */
export type Entitlements = {
  /** Live map, exact distance, and travel time. */
  liveMap: boolean;
  /** Voice and video calling, 1:1 and in groups. */
  calling: boolean;
  /** Group capacity beyond the free cap. */
  groupCapacity: number;
  /** Priority placement in Discovery and Suggested. */
  priorityDiscovery: boolean;
  /** Read receipts. Free members only see "delivered". */
  readReceipts: boolean;
  /** Advanced search: verified-only and multi-interest combinations. */
  advancedFilters: boolean;
  /** Banner ads. Premium is ad-free. */
  ads: boolean;
  /** Seeing who requested or is interested in you. */
  seeInterested: boolean;
  /** Block, report, and privacy controls. Included on both tiers. */
  privacyControls: boolean;
  /** How many Hangout / Meetup proposals a member can send. */
  hangoutProposals: number;
  /** How many friend requests a member can send. */
  friendRequests: number;
  /** Group capacity, also exposed here for convenience. */
  groupMembers: number;
};

export const FREE_GROUP_CAP = 5;
export const PREMIUM_GROUP_CAP = 100;
export const FREE_HANGOUT_PROPOSALS = 10;
export const UNLIMITED = Number.POSITIVE_INFINITY;

export const FREE_ENTITLEMENTS: Entitlements = {
  liveMap: false,
  calling: false,
  groupCapacity: FREE_GROUP_CAP,
  priorityDiscovery: false,
  readReceipts: false,
  advancedFilters: false,
  ads: true,
  seeInterested: false,
  privacyControls: true,
  hangoutProposals: FREE_HANGOUT_PROPOSALS,
  friendRequests: UNLIMITED,
  groupMembers: FREE_GROUP_CAP,
};

export const PREMIUM_ENTITLEMENTS: Entitlements = {
  ...FREE_ENTITLEMENTS,
  liveMap: true,
  calling: true,
  groupCapacity: PREMIUM_GROUP_CAP,
  priorityDiscovery: true,
  readReceipts: true,
  advancedFilters: true,
  ads: false,
  seeInterested: true,
  hangoutProposals: UNLIMITED,
  friendRequests: UNLIMITED,
  groupMembers: PREMIUM_GROUP_CAP,
};

export function entitlementsFor(tier: Tier): Entitlements {
  return tier === "premium" ? PREMIUM_ENTITLEMENTS : FREE_ENTITLEMENTS;
}

export function isPremium(tier: Tier): boolean {
  return tier === "premium";
}

/* ------------------------------- feature list ---------------------------- */

/** A row on the comparison table. */
export type FeatureRow = {
  label: string;
  free: string;
  premium: string;
};

/**
 * The published comparison. `free` and `premium` are the short cell values, so
 * a tick or a limit reads the same in the app and in any marketing surface.
 */
export const FEATURE_COMPARISON: readonly FeatureRow[] = [
  { label: "Signup and OTP verification", free: "Phone + email", premium: "Phone + email" },
  { label: "ID / selfie verification", free: "Basic", premium: "Basic" },
  { label: "Discovery feed and filters", free: "Age, gender, locality, interests", premium: "Age, gender, locality, interests" },
  { label: "Home-locality suggestions", free: "Included", premium: "Included" },
  { label: "Friend requests", free: "Unlimited", premium: "Unlimited" },
  { label: "1:1 chat", free: "Text, photo, voice note", premium: "Text, photo, voice note" },
  { label: "Hangout and meetup proposals", free: `First ${FREE_HANGOUT_PROPOSALS}`, premium: "Unlimited" },
  { label: "Groups", free: `Up to ${FREE_GROUP_CAP} members`, premium: `Up to ${PREMIUM_GROUP_CAP} members` },
  { label: "Availability toggle", free: "Included", premium: "Included" },
  { label: "Live map and exact distance", free: "—", premium: "Included" },
  { label: "Voice and video calling", free: "—", premium: "Included" },
  { label: "Read receipts", free: "—", premium: "Included" },
  { label: "Advanced filters", free: "—", premium: "Verified-only, combinations" },
  { label: "Priority in Discovery", free: "—", premium: "Included" },
  { label: "Who requested or is interested", free: "—", premium: "Included" },
  { label: "Ads", free: "Small banner", premium: "Ad-free" },
  { label: "Block, report, and privacy", free: "Included", premium: "Included" },
];

/* --------------------------------- gating -------------------------------- */

export type GateResult = { allowed: boolean; message: string };

const ALLOWED: GateResult = { allowed: true, message: "" };

/** Shown whenever a locked feature is tapped. */
export function upgradeMessage(feature: string): string {
  return `${feature} is part of Trufrenz Premium. Upgrade to unlock it.`;
}

/** Live map and exact distance. */
export function liveMapGate(tier: Tier): GateResult {
  if (entitlementsFor(tier).liveMap) return ALLOWED;
  return { allowed: false, message: "Live map and exact distance are part of Trufrenz Premium. Upgrade to see who is nearby right now." };
}

/** Calling, 1:1 and group. */
export function callingGate(tier: Tier): GateResult {
  if (entitlementsFor(tier).calling) return ALLOWED;
  return { allowed: false, message: "Calls are part of Trufrenz Premium. Upgrade to call your friends." };
}

/** Read receipts. Free members' outgoing messages stop at "delivered". */
export function readReceiptGate(tier: Tier): GateResult {
  if (entitlementsFor(tier).readReceipts) return ALLOWED;
  return { allowed: false, message: "Read receipts are part of Trufrenz Premium. Upgrade to see when your messages are read." };
}

/** Advanced discovery filters. */
export function advancedFilterGate(tier: Tier): GateResult {
  if (entitlementsFor(tier).advancedFilters) return ALLOWED;
  return { allowed: false, message: "Verified-only search and interest combinations are part of Trufrenz Premium." };
}

/** Seeing who requested or is interested in you. */
export function interestedGate(tier: Tier): GateResult {
  if (entitlementsFor(tier).seeInterested) return ALLOWED;
  return { allowed: false, message: "Seeing who requested or is interested in you is part of Trufrenz Premium." };
}

/** Banner ads. */
export function adFreeGate(tier: Tier): GateResult {
  if (!entitlementsFor(tier).ads) return ALLOWED;
  return { allowed: false, message: "Premium removes banner ads. Upgrade for an ad-free experience." };
}

/**
 * Adding a friend to a group. Free members stop at the free cap and are shown
 * the upgrade prompt rather than a plain refusal.
 */
export function groupCapacityGate(tier: Tier, currentMembers: number): GateResult {
  const cap = entitlementsFor(tier).groupCapacity;
  if (currentMembers < cap) return ALLOWED;
  if (tier === "free") {
    return { allowed: false, message: `Groups hold up to ${FREE_GROUP_CAP} friends on the free plan. Upgrade to Premium to grow a circle to ${PREMIUM_GROUP_CAP}.` };
  }
  return { allowed: false, message: `Groups hold up to ${PREMIUM_GROUP_CAP} members. Start another circle for the rest.` };
}

/**
 * Sending a Hangout or Meetup proposal. Free members get the first ten, then a
 * gentle nudge to upgrade.
 */
export function hangoutProposalGate(tier: Tier, used: number): GateResult {
  const limit = entitlementsFor(tier).hangoutProposals;
  if (used < limit) return ALLOWED;
  return { allowed: false, message: `You have sent your first ${FREE_HANGOUT_PROPOSALS} hangout invites on the free plan. Upgrade to Premium to keep planning without a limit.` };
}

/** Banner ad copy, only shown to free members. */
export const BANNER_AD_COPY = "Go Premium — ad-free, with calls, live map, and up to 100 friends per group.";

/** Short tier badge label. */
export function tierLabel(tier: Tier): string {
  return tier === "premium" ? "Premium" : "Free";
}

/* ------------------------------ subscription state ----------------------- */

export type Subscription = {
  tier: Tier;
  planId: PlanId;
  /** ISO date the current period ends, or null on the free plan. */
  renewsOn: string | null;
  /** True while a purchase is being confirmed with the store. */
  pending: boolean;
};

export const DEFAULT_SUBSCRIPTION: Subscription = { tier: "free", planId: DEFAULT_PLAN_ID, renewsOn: null, pending: false };

/** A subscription for a completed purchase, renewing from `now`. */
export function startSubscription(planId: PlanId, now: Date = new Date()): Subscription {
  const plan = planById(planId);
  const renews = new Date(now.getTime());
  renews.setMonth(renews.getMonth() + plan.months);
  return { tier: "premium", planId: plan.id, renewsOn: renews.toISOString(), pending: false };
}

export function cancelSubscription(): Subscription {
  return { ...DEFAULT_SUBSCRIPTION };
}

/** e.g. "Renews 26 Dec 2026" — empty when there is nothing to renew. */
export function renewalLine(subscription: Subscription): string {
  if (subscription.tier !== "premium" || !subscription.renewsOn) return "";
  const date = new Date(subscription.renewsOn);
  if (Number.isNaN(date.getTime())) return "";
  return `Renews ${date.getDate()} ${date.toLocaleString("en-IN", { month: "short" })} ${date.getFullYear()}`;
}

/**
 * Read back a stored subscription. Anything malformed falls back to free, so a
 * corrupted value can never hand out Premium by accident.
 */
export function parseSubscription(raw: unknown): Subscription {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SUBSCRIPTION };
  const value = raw as Record<string, unknown>;
  const tier: Tier = value.tier === "premium" ? "premium" : "free";
  if (tier === "free") return { ...DEFAULT_SUBSCRIPTION };
  const plan = planById(typeof value.planId === "string" ? value.planId : DEFAULT_PLAN_ID);
  const renewsOn = typeof value.renewsOn === "string" && !Number.isNaN(new Date(value.renewsOn).getTime()) ? value.renewsOn : null;
  return { tier, planId: plan.id, renewsOn, pending: false };
}
