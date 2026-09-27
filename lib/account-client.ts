/**
 * Consumer account client.
 *
 * Bridges the app to the account service. Everything here degrades quietly: if
 * the server is unreachable the app keeps working on its local session, because
 * a network hiccup should never look like a broken product. The one thing that
 * is *not* silent is a moderation decision — that always surfaces.
 */

import { getApiBaseUrl } from "@/constants/oauth";
import {
  normalizeAccountStatus,
  normalizeVerificationTier,
  type AccountStatus,
  type AccountState,
  type VerificationTier,
} from "@/lib/account-access";
import type { ConnectionRow } from "@/lib/connection-sync";

/** The account payload the server returns. */
export type RemoteAccount = {
  id: number;
  handle: string;
  name: string;
  phone: string;
  email: string | null;
  age: number | null;
  dateOfBirth: string | null;
  homeArea: string | null;
  verificationTier: VerificationTier;
  subscriptionTier: "free" | "premium";
  available: boolean;
  accountStatus: AccountStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  joinedAt: string;
  capabilities: string[];
  isMemberAccount: boolean;
};

export type MemberNotice = {
  id: number;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

/** Events the app reports to the analytics stream. */
export type ReportableEvent = {
  eventType: string;
  groupId?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code?: string;
      /**
       * How long the server says to wait, in seconds.
       *
       * Carried through so a rate limit reads as "try again in 45 seconds"
       * rather than a bare refusal. The server owns the number because only it
       * knows the window; the client must not invent one.
       */
      retryAfterSeconds?: number;
    }
> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const body = (parsed ?? {}) as { error?: string; code?: string; retryAfterSeconds?: number };
      return {
        ok: false,
        error: body.error ?? "Something went wrong.",
        code: body.code,
        retryAfterSeconds:
          typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined,
      };
    }
    return { ok: true, data: (parsed ?? {}) as T };
  } catch {
    // Offline or unreachable: callers fall back to local state.
    return { ok: false, error: "Could not reach Trufrenz. Check your connection." };
  }
}

/* ------------------------------ sign-in -------------------------------- */

/** Which channel a code travelled over. */
export type SigninChannel = "phone" | "email";

/**
 * What the server reports about a code request.
 *
 * `delivery` is the honest answer, and it is why this type carries more than an
 * `ok` flag: "demo" means the code came back in the response because nothing
 * can send it, and "unavailable" means nothing can send it and demo mode is
 * off, so the member should not be shown a code box that can never be
 * satisfied.
 */
export type CodeRequestResult = {
  ok: boolean;
  channel: SigninChannel;
  /** Partly hidden: "•••• 0142" or "d•••@example.com". */
  destination: string;
  isNewAccount: boolean;
  /** Present only when no provider exists and demo mode is on. */
  demoCode?: string;
  delivery: SigninChannel | "demo" | "unavailable";
  /** Set when a configured channel could not deliver. */
  deliveryUnavailable?: boolean;
  /**
   * How long until another code may be requested.
   *
   * Sent on success so the app can count its "send a new code" button down for
   * exactly the window the server will enforce.
   */
  retryAfterSeconds?: number;
  /**
   * Which transport carried the code: "email", "whatsapp", "msg91", "twilio".
   *
   * Destroyed down to a transport name rather than a provider name the member
   * would not recognise — "WhatsApp" and "text message" are the words that mean
   * something to them.
   */
  transport?: string;
};

export async function requestOtp(phone: string, purpose: "signup" | "login") {
  return request<CodeRequestResult>("/api/account/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone, purpose }),
  });
}

/** Ask for a code by email, which needs no SMS provider to work. */
export async function requestEmailOtp(email: string, purpose: "signup" | "login") {
  return request<CodeRequestResult>("/api/account/request-email-otp", {
    method: "POST",
    body: JSON.stringify({ email, purpose }),
  });
}

/**
 * Check a code without spending the sign-in.
 *
 * Separate from completion because this app's onboarding spans several screens.
 * Verifying early and creating the account later is exactly what used to fail:
 * the old single route deleted the challenge the moment the code matched, so
 * the final call had nothing to work with and the account was never created on
 * the server at all.
 */
export async function verifyCode(code: string) {
  return request<{ ok: boolean; verified: boolean; channel: SigninChannel; destination: string }>(
    "/api/account/verify-code",
    { method: "POST", body: JSON.stringify({ code }) },
  );
}

/** Create the account, or sign in, using a code that was already accepted. */
export async function completeSignin(input: {
  name?: string;
  dateOfBirth?: string;
  age?: number;
  homeArea?: string;
  email?: string;
  phone?: string;
}) {
  return request<{ ok: boolean; token: string; account: RemoteAccount }>(
    "/api/account/complete-signin",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function verifyOtp(input: {
  code: string;
  name?: string;
  dateOfBirth?: string;
  age?: number;
  homeArea?: string;
  email?: string;
}) {
  return request<{ ok: boolean; token: string; account: RemoteAccount }>(
    "/api/account/verify-otp",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function fetchSession() {
  return request<{ account: RemoteAccount; unreadNotices: number }>("/api/account/session");
}

export async function signOutRemote() {
  return request<{ ok: boolean }>("/api/account/sign-out", { method: "POST" });
}

/* ------------------------------ notices -------------------------------- */

export async function fetchNotices() {
  return request<{ notices: MemberNotice[] }>("/api/account/notices");
}

export async function markNoticesRead(ids: number[]) {
  return request<{ ok: boolean }>("/api/account/notices/read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

/* --------------------------- the member's circle ------------------------ */

/**
 * The circle as the server has it.
 *
 * The app is the only writer, so this is read at launch and after a change, and
 * a failure is silent: the device's own graph stays usable while offline, and
 * the unsent changes are pushed on the next successful call.
 */
export async function fetchConnections() {
  return request<{ connections: ConnectionRow[] }>("/api/account/connections");
}

/**
 * Sends the changes this device still owes and returns the full circle back.
 *
 * State changes and removals travel together so one request leaves the row in
 * exactly one place. A removal is what a block does: it ends the relationship
 * rather than recording a decision about a request, so the server deletes the
 * row instead of storing a fifth state.
 */
export async function pushConnections(rows: ConnectionRow[], removed: string[] = []) {
  return request<{ ok: boolean; applied: number; removed: number; connections: ConnectionRow[] }>(
    "/api/account/connections",
    { method: "POST", body: JSON.stringify({ connections: rows, removed }) },
  );
}

/* ------------------------------- actions ------------------------------- */

/**
 * Run a capability-guarded action.
 *
 * A refusal is returned, never thrown: the caller shows the message the server
 * gave, which is the same wording the account rules use locally.
 */
export async function runGuardedAction(
  action:
    | "friend-request"
    | "friendship-accepted"
    | "message"
    | "meetup-join"
    | "meetup-create"
    | "group-create"
    | "call"
    | "share-location"
    | "verification-submit",
  payload: Record<string, unknown> = {},
): Promise<{ allowed: boolean; error?: string; code?: string }> {
  const result = await request<{ ok: boolean }>(`/api/account/actions/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.ok) return { allowed: true };
  return { allowed: false, error: result.error, code: result.code };
}

/** Report product events. Fire-and-forget: failures are never user-visible. */
export async function reportEvents(events: ReportableEvent[]): Promise<void> {
  if (events.length === 0) return;
  await request<{ ok: boolean; accepted: number }>("/api/account/events", {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

/* ------------------------------ adapters ------------------------------- */

/** The server's view of the member's paid tier, derived from verified receipts. */
export type RemoteEntitlement = {
  tier: "free" | "premium";
  planId: string;
  renewsOn: string | null;
  /**
   * True when the current period ends within a week. The server computes this so
   * the manage screen can say "renews in a few days" without duplicating the
   * reminder window rules on the client, where they could drift.
   */
  renewingSoon: boolean;
  autoRenewing: boolean;
  cancelledAt: string | null;
  lastVerifiedAt: string | null;
  /** "store" for a real verification, "sandbox" while no credentials exist. */
  verifiedBy: "store" | "sandbox" | null;
};

export type RemoteReceipt = {
  id: number;
  channel: "play" | "app-store" | "comp";
  productId: string;
  planId: string;
  status: string;
  expiresAt: string;
  autoRenewing: boolean;
  cancelledAt: string | null;
  verifiedBy: string;
  lastVerifiedAt: string | null;
  createdAt: string;
};

/** A receipt handed back to the server for verification. */
export type StoreReceiptPayload = {
  channel: "play" | "app-store" | "comp";
  productId: string;
  purchaseToken: string;
  signedTransaction?: string | null;
  originalTransactionId?: string | null;
};

/* ------------------------------- billing -------------------------------- */

/** The product catalogue and which verification mode the server is running. */
export async function fetchBillingProducts() {
  return request<{
    products: { planId: string; productId: string; chargeInr: number }[];
    verification: "store" | "sandbox";
  }>("/api/account/billing/products");
}

/** The member's real entitlement, straight from the server. */
export async function fetchEntitlement() {
  return request<{
    entitlement: RemoteEntitlement;
    receipts: RemoteReceipt[];
    verification: "store" | "sandbox";
  }>("/api/account/billing/entitlement");
}

/**
 * Send a store receipt for verification.
 *
 * The receipt is passed through untouched. A rejection carries the store's
 * reason, which is what the member sees.
 */
export async function verifyPurchase(receipt: StoreReceiptPayload) {
  return request<{
    ok: boolean;
    entitlement: RemoteEntitlement;
    transactionId: string;
    changed: boolean;
  }>("/api/account/billing/verify", {
    method: "POST",
    body: JSON.stringify(receipt),
  });
}

/** Replay the store's purchase history for this account. */
export async function restorePurchases(receipts: StoreReceiptPayload[]) {
  return request<{ ok: boolean; restored: boolean; entitlement: RemoteEntitlement }>(
    "/api/account/billing/restore",
    { method: "POST", body: JSON.stringify({ receipts }) },
  );
}

/** Tell the server the store reported a cancellation. */
export async function reportStoreCancellation() {
  return request<{ ok: boolean; entitlement: RemoteEntitlement }>("/api/account/billing/cancel", {
    method: "POST",
  });
}

/** Ask the server to re-check receipts that have gone stale. */
export async function revalidateEntitlements() {
  return request<{ ok: boolean; checked: number; lapsed: number }>("/api/account/billing/revalidate", {
    method: "POST",
  });
}

/** Convert a server entitlement into the shape the app's tier model uses. */
export function subscriptionFromEntitlement(entitlement: RemoteEntitlement): {
  tier: "free" | "premium";
  planId: string;
  renewsOn: string | null;
} {
  if (entitlement.tier !== "premium") return { tier: "free", planId: entitlement.planId, renewsOn: null };
  return { tier: "premium", planId: entitlement.planId, renewsOn: entitlement.renewsOn };
}

/** Convert a remote account into the shape the access rules expect. */
export function accountStateFrom(account: RemoteAccount | null): AccountState | null {
  if (!account) return null;
  return {
    status: normalizeAccountStatus(account.accountStatus),
    verificationTier: normalizeVerificationTier(account.verificationTier),
    statusReason: account.statusReason,
    statusChangedAt: account.statusChangedAt,
  };
}

/** Unread notices that deserve a badge, ignoring routine announcements. */
export function actionableNotices(notices: MemberNotice[]): MemberNotice[] {
  return notices.filter((notice) => !notice.readAt);
}
