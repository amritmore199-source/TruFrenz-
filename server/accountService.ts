/**
 * Consumer account service.
 *
 * This is the real backend for the member app: phone-based sign-in issues a
 * session, and every mutating action is checked against the account's current
 * status. Because the moderation queue writes to the same `members` rows, a
 * suspension takes effect on the member's very next request rather than only
 * being hidden in the UI.
 *
 * Two rules are enforced here rather than in the client:
 *   1. A restricted account cannot perform the actions its status blocks.
 *   2. Sessions belonging to a suspended or banned account stop working.
 */

import { randomBytes, createHash } from "node:crypto";

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { getDb } from "./db";
import { analyticsEvents, memberNotices, memberSessions, members } from "../drizzle/schema";
import {
  canAccount,
  normalizeAccountStatus,
  normalizeVerificationTier,
  type AccountCapability,
  type AccountState,
} from "../lib/account-access";
import { dayKey, isAnalyticsEventType } from "../lib/analytics-events";

/** Sessions last 30 days; the app refreshes them on each launch. */
export const MEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type MemberRecord = typeof members.$inferSelect;

/** The account state as the access rules expect it. */
export function accountStateFor(member: MemberRecord): AccountState {
  return {
    status: normalizeAccountStatus(member.accountStatus),
    verificationTier: normalizeVerificationTier(member.verificationTier),
    statusReason: member.statusReason,
    statusChangedAt: member.statusChangedAt ? member.statusChangedAt.toISOString() : null,
  };
}

export function hashMemberToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Normalise a phone number to E.164 so "+1 415 555 0134" and "14155550134"
 * resolve to the same account instead of creating duplicates.
 */
export function normalizePhone(raw: string, defaultCountryCode = "1"): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  // Bare digits: treat a leading country code as already included.
  if (digits.length === 11 && digits.startsWith(defaultCountryCode)) return `+${digits}`;
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** Last four digits, for display without leaking the full number. */
export function maskPhone(phoneE164: string | null): string {
  if (!phoneE164) return "";
  const digits = phoneE164.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "";
}

/** A six-digit OTP, generated with a cryptographically secure source. */
export function generateOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/* ------------------------------- lookups -------------------------------- */

export async function findMemberByPhone(phoneE164: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(members).where(eq(members.phoneE164, phoneE164)).limit(1);
  return rows[0];
}

export async function findMemberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(members).where(eq(members.id, id)).limit(1);
  return rows[0];
}

/** Derive a unique handle from a display name, e.g. "Maya Chen" -> "maya.chen". */
export async function deriveHandle(name: string): Promise<string> {
  const db = await getDb();
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 40) || "member";
  if (!db) return base;

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}.${attempt + 1}`;
    const existing = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.handle, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${base}.${randomBytes(3).toString("hex")}`;
}

/* ------------------------------- sign-up -------------------------------- */

export type CreateAccountInput = {
  phoneE164: string;
  name: string;
  email?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  homeArea?: string | null;
};

/**
 * Create the account behind a phone number. Idempotent by phone: signing in
 * again returns the existing account rather than creating a second one.
 */
export async function createAccount(input: CreateAccountInput): Promise<MemberRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await findMemberByPhone(input.phoneE164);
  if (existing) return existing;

  const handle = await deriveHandle(input.name || "member");
  await db.insert(members).values({
    handle,
    name: input.name.trim().slice(0, 120) || "Member",
    phoneE164: input.phoneE164,
    email: input.email ? input.email.trim().slice(0, 320) : null,
    age: input.age ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    homeArea: input.homeArea ? input.homeArea.trim().slice(0, 120) : null,
    // A completed phone sign-up earns the phone verification tier.
    verificationTier: "phone",
    accountStatus: "active",
    subscriptionTier: "free",
  });

  const created = await findMemberByPhone(input.phoneE164);
  if (!created) throw new Error("Account creation failed");

  await recordEvent({ eventType: "signup", memberId: created.id });
  return created;
}

/* ------------------------------- sessions ------------------------------- */

export async function issueMemberSession(memberId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const token = generateSessionToken();
  await db.insert(memberSessions).values({
    memberId,
    tokenHash: hashMemberToken(token),
    expiresAt: new Date(Date.now() + MEMBER_SESSION_TTL_MS),
  });
  return token;
}

/**
 * Resolve a session token to a member. Returns `null` when the token is
 * unknown or expired.
 *
 * A suspended or banned account still resolves: the member is entitled to sign
 * in and read the notice explaining the decision. What they *cannot* do is
 * participate — every mutating route re-checks the account's capabilities, so
 * enforcement does not depend on hiding the session. Their existing sessions
 * are revoked when the decision is made, which is what makes it bite at once.
 */
export async function resolveMemberSession(token: string) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      member: members,
      sessionId: memberSessions.id,
      expiresAt: memberSessions.expiresAt,
    })
    .from(memberSessions)
    .innerJoin(members, eq(members.id, memberSessions.memberId))
    .where(
      and(
        eq(memberSessions.tokenHash, hashMemberToken(token)),
        gt(memberSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db
    .update(memberSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(memberSessions.id, row.sessionId));

  return row.member;
}

/** Revoke every session for an account. Used when an account is restricted. */
export async function revokeMemberSessions(memberId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.delete(memberSessions).where(eq(memberSessions.memberId, memberId));
  return Number((result as unknown as { affectedRows?: number })?.affectedRows ?? 0);
}

/* ------------------------------- notices -------------------------------- */

export type NoticeKind =
  | "warning"
  | "suspension"
  | "ban"
  | "reinstatement"
  | "verification_approved"
  | "verification_rejected"
  | "announcement"
  | "refund";

/**
 * Deliver a member-facing notice. This is the other half of a moderation
 * action: the dashboard records the decision, and this puts it in front of the
 * person it applies to.
 */
export async function sendMemberNotice(input: {
  memberId: number;
  kind: NoticeKind;
  title: string;
  body: string;
  actorEmail?: string | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(memberNotices).values({
    memberId: input.memberId,
    kind: input.kind,
    title: input.title.slice(0, 160),
    body: input.body,
    actorEmail: input.actorEmail ?? null,
  });

  const insertId = (result as unknown as { insertId?: number })?.insertId;
  return Number(insertId ?? 0);
}

export async function listMemberNotices(memberId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(memberNotices)
    .where(eq(memberNotices.memberId, memberId))
    .orderBy(desc(memberNotices.createdAt))
    .limit(limit);
}

export async function markNoticesRead(memberId: number, ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  for (const id of ids) {
    await db
      .update(memberNotices)
      .set({ readAt: new Date() })
      .where(and(eq(memberNotices.id, id), eq(memberNotices.memberId, memberId)));
  }
}

/**
 * Notify every member in a broadcast's audience. Returns how many notices were
 * written, which is the honest recipient count for the dashboard.
 */
export async function deliverBroadcast(input: {
  title: string;
  body: string;
  segment: "all" | "verified" | "unverified" | "free" | "premium";
  actorEmail: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const all = await db.select().from(members);
  const audience = all.filter((member) => {
    const verified = member.verificationTier === "id_selfie";
    switch (input.segment) {
      case "verified":
        return verified;
      case "unverified":
        return !verified;
      case "free":
        return member.subscriptionTier === "free";
      case "premium":
        return member.subscriptionTier === "premium";
      default:
        return true;
    }
  });

  // Only accounts that can actually sign in receive app notices.
  const reachable = audience.filter((member) => member.phoneE164);
  const recipients = reachable.length > 0 ? reachable : audience;

  for (const member of recipients) {
    await sendMemberNotice({
      memberId: member.id,
      kind: "announcement",
      title: input.title,
      body: input.body,
      actorEmail: input.actorEmail,
    });
  }

  return recipients.length;
}

/* ------------------------------ enforcement ----------------------------- */

export class AccountActionBlocked extends Error {
  readonly status = 403;
  readonly capability: AccountCapability;

  constructor(capability: AccountCapability, message: string) {
    super(message);
    this.name = "AccountActionBlocked";
    this.capability = capability;
  }
}

/**
 * Guard a mutating action. Throws when the account's current status forbids it,
 * so the rule is enforced on the server and cannot be bypassed by a modified
 * client.
 */
export function assertCapability(member: MemberRecord, capability: AccountCapability): void {
  const state = accountStateFor(member);
  if (canAccount(state, capability)) return;

  if (state.status === "banned") {
    throw new AccountActionBlocked(
      capability,
      "Your account has been closed, so this action is no longer available.",
    );
  }
  throw new AccountActionBlocked(
    capability,
    "Your account is suspended, so you cannot do this right now.",
  );
}

/* ------------------------------- analytics ------------------------------ */

/** Record a product event. Failures never break the user-facing action. */
export async function recordEvent(input: {
  eventType: string;
  memberId?: number | null;
  groupId?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}): Promise<void> {
  if (!isAnalyticsEventType(input.eventType)) return;

  try {
    const db = await getDb();
    if (!db) return;
    const occurredAt = input.occurredAt ?? new Date();
    await db.insert(analyticsEvents).values({
      day: dayKey(occurredAt),
      eventType: input.eventType,
      memberId: input.memberId ?? null,
      groupId: input.groupId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      occurredAt,
    });
  } catch (error) {
    console.error("[analytics] failed to record event", input.eventType, error);
  }
}

/** Record several events in one call, skipping invalid types silently. */
export async function recordEvents(
  events: Array<Parameters<typeof recordEvent>[0]>,
): Promise<void> {
  for (const event of events) await recordEvent(event);
}

/** Touch the account's activity timestamp and count the visit. */
export async function recordSessionStart(member: MemberRecord): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.update(members).set({ lastActiveAt: new Date() }).where(eq(members.id, member.id));
  }
  await recordEvent({ eventType: "session_start", memberId: member.id });
}

/** Raw events for a day range, oldest first, for the analytics rollup. */
export async function listEventsForDays(days: string[]) {
  const db = await getDb();
  if (!db || days.length === 0) return [];
  const first = days[0];
  const rows = await db
    .select({
      eventType: analyticsEvents.eventType,
      day: analyticsEvents.day,
      memberId: analyticsEvents.memberId,
      groupId: analyticsEvents.groupId,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.day} >= ${first}`)
    .orderBy(analyticsEvents.day);
  return rows.filter((row) => days.includes(row.day));
}

/** Live counters for the dashboard, straight from the event stream. */
export async function getLiveEventSummary(days: string[]) {
  const db = await getDb();
  if (!db) return { total: 0, distinctMembers: 0, byType: {} as Record<string, number> };

  const rows = await db
    .select({
      eventType: analyticsEvents.eventType,
      memberId: analyticsEvents.memberId,
      day: analyticsEvents.day,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.day} >= ${days[0] ?? "1970-01-01"}`);

  const scoped = rows.filter((row) => days.includes(row.day));
  const byType: Record<string, number> = {};
  const memberIds = new Set<number>();
  for (const row of scoped) {
    byType[row.eventType] = (byType[row.eventType] ?? 0) + 1;
    if (typeof row.memberId === "number") memberIds.add(row.memberId);
  }

  return { total: scoped.length, distinctMembers: memberIds.size, byType };
}

/** The most recent events, for the dashboard's live activity feed. */
export async function listRecentEvents(limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: analyticsEvents.id,
      eventType: analyticsEvents.eventType,
      day: analyticsEvents.day,
      memberId: analyticsEvents.memberId,
      groupId: analyticsEvents.groupId,
      occurredAt: analyticsEvents.occurredAt,
    })
    .from(analyticsEvents)
    .orderBy(desc(analyticsEvents.occurredAt))
    .limit(limit);
}
