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
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }> {
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
      const body = (parsed ?? {}) as { error?: string; code?: string };
      return { ok: false, error: body.error ?? "Something went wrong.", code: body.code };
    }
    return { ok: true, data: (parsed ?? {}) as T };
  } catch {
    // Offline or unreachable: callers fall back to local state.
    return { ok: false, error: "Could not reach Trufrenz. Check your connection." };
  }
}

/* ------------------------------ sign-in -------------------------------- */

export async function requestOtp(phone: string, purpose: "signup" | "login") {
  return request<{
    ok: boolean;
    phone: string;
    isNewAccount: boolean;
    /** Present only when the server has no SMS provider configured. */
    demoCode?: string;
    delivery: "sms" | "demo";
  }>("/api/account/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone, purpose }),
  });
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
