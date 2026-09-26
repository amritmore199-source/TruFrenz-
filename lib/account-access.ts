/**
 * Account access rules.
 *
 * These turn a member's real account status — as written by the moderation
 * queue — into concrete, testable permissions. The consumer app and the server
 * both read from this single source of truth so a suspension means the same
 * thing everywhere.
 *
 * Ordering matters: every restriction below is *stricter* than the last, so the
 * resolver checks from most severe to least.
 */

export type AccountStatus = "active" | "warned" | "suspended" | "banned";
export type VerificationTier = "none" | "phone" | "id_selfie";

export type AccountState = {
  status: AccountStatus;
  verificationTier: VerificationTier;
  /** Why the account is restricted, shown in-app. */
  statusReason?: string | null;
  statusChangedAt?: string | null;
};

export type AccountCapability =
  | "browse"
  | "appear-in-discovery"
  | "send-friend-requests"
  | "open-chats"
  | "send-messages"
  | "join-meetups"
  | "share-location"
  | "start-calls"
  | "request-verification";

/** Everything a healthy account can do. */
const FULL_ACCESS: AccountCapability[] = [
  "browse",
  "appear-in-discovery",
  "send-friend-requests",
  "open-chats",
  "send-messages",
  "join-meetups",
  "share-location",
  "start-calls",
  "request-verification",
];

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Active",
  warned: "Warned",
  suspended: "Suspended",
  banned: "Banned",
};

/** The consequences shown to a member whose account has been restricted. */
export type AccountRestriction = {
  /** Short headline for the in-app banner. */
  title: string;
  /** One or two sentences explaining what changed and why. */
  body: string;
  /** What the member can still do. */
  stillAllowed: string;
  /** Whether a moderator decision caused this. */
  imposedByStaff: boolean;
};

const RESTRICTIONS: Record<Exclude<AccountStatus, "active">, AccountRestriction> = {
  warned: {
    title: "You have a warning on your account",
    body: "A moderator reviewed a report about your account and issued a warning. Nothing is blocked — but repeated reports can lead to a suspension.",
    stillAllowed: "You can keep browsing, chatting, and joining meetups as usual.",
    imposedByStaff: true,
  },
  suspended: {
    title: "Your account is suspended",
    body: "A moderator suspended your account after reviewing reports. You can still browse and read your existing conversations, but you cannot send new messages, send friend requests, join meetups, share your location, or start calls.",
    stillAllowed: "Browsing and reading existing chats stay available while we review.",
    imposedByStaff: true,
  },
  banned: {
    title: "Your account has been closed",
    body: "A moderator closed your account after reviewing reports. Your account is hidden from other members and you can no longer take part. If you believe this was a mistake, contact support.",
    stillAllowed: "You can read this notice and contact support.",
    imposedByStaff: true,
  },
};

/**
 * The capabilities a member actually holds. A banned account keeps nothing but
 * the ability to see why, which is what the notice screen needs.
 */
export function resolveCapabilities(state: AccountState): AccountCapability[] {
  switch (state.status) {
    case "banned":
      return [];
    case "suspended":
      // Read-only: browsing and reading threads survive, participation does not.
      return ["browse", "open-chats"];
    case "warned":
    case "active":
      return [...FULL_ACCESS];
    default:
      return [...FULL_ACCESS];
  }
}

export function canAccount(state: AccountState, capability: AccountCapability): boolean {
  return resolveCapabilities(state).includes(capability);
}

/** The banner copy for a restricted account, or null when nothing is wrong. */
export function describeRestriction(state: AccountState): AccountRestriction | null {
  if (state.status === "active") return null;
  return RESTRICTIONS[state.status] ?? null;
}

/**
 * Whether the account should still appear in other members' discovery feeds.
 * Suspended and banned accounts disappear so they cannot keep collecting
 * requests while under review.
 */
export function isDiscoverable(state: AccountState): boolean {
  return canAccount(state, "appear-in-discovery");
}

/**
 * The in-app message shown when a restricted member attempts a blocked action.
 * Returns null when the action is allowed, so callers can use it as a guard.
 */
export function blockedActionMessage(
  state: AccountState,
  capability: AccountCapability,
): string | null {
  if (canAccount(state, capability)) return null;

  if (state.status === "banned") {
    return "Your account has been closed, so this is no longer available. Contact support if you believe this was a mistake.";
  }
  if (state.status === "suspended") {
    return "Your account is suspended, so you cannot do this right now. Browsing and reading existing chats still work.";
  }
  return "This action is unavailable on your account right now.";
}

/**
 * Whether the member may start a fresh verification submission. Someone already
 * at the top tier does not need to resubmit, and a banned account cannot.
 */
export function canRequestVerification(state: AccountState): boolean {
  if (!canAccount(state, "request-verification")) return false;
  return state.verificationTier !== "id_selfie";
}

/** Normalise an unknown string from storage or the API into a known status. */
export function normalizeAccountStatus(value: unknown): AccountStatus {
  return value === "warned" || value === "suspended" || value === "banned" ? value : "active";
}

/** Normalise an unknown string into a known verification tier. */
export function normalizeVerificationTier(value: unknown): VerificationTier {
  return value === "phone" || value === "id_selfie" ? value : "none";
}

/**
 * True when the account is restricted in a way that should block the member
 * from using the app at all. Used to decide whether to show the notice screen.
 */
export function requiresAccountNotice(state: AccountState): boolean {
  return state.status === "suspended" || state.status === "banned";
}
