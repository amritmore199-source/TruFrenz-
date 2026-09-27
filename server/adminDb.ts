/**
 * Data access for the internal admin dashboard.
 *
 * Every helper degrades gracefully when the database is unreachable so the
 * dashboard renders an explanatory empty state instead of crashing.
 */

import { and, asc, count, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  adminAccounts,
  adminActions,
  adminSessions,
  analyticsEvents,
  blockedKeywords,
  broadcasts,
  dailyMetrics,
  featureFlags,
  memberNotices,
  members,
  reports,
  subscriptionEvents,
  verificationSubmissions,
  type InsertMember,
} from "../drizzle/schema";
import { getDb } from "./db";
import { hashPassword } from "./_core/adminAuth";
import {
  dayKey,
  dayRange,
  demoEventsForDay,
  rollupRange,
  summarizeEvents,
  type AccountSnapshot,
  type RawAnalyticsEvent,
} from "../lib/analytics-events";
import { deliverBroadcast, revokeMemberSessions, sendMemberNotice } from "./accountService";

/**
 * First-run dashboard owner.
 *
 * The password and TOTP secret are fixed so the seeded account can be signed
 * into during development; the dashboard shows these credentials on its login
 * screen and flags them as needing replacement before any real deployment.
 */
export const DEMO_ADMIN_EMAIL = "safety@trufrenz.net";

/**
 * Addresses the seeded demo account used before the domain was settled.
 *
 * The demo account is created once, on the first boot against an empty
 * database. Changing `DEMO_ADMIN_EMAIL` afterwards therefore does nothing on an
 * install that has already been seeded, and the login page went on advertising
 * `safety@trufrenz.net` while the account could only be reached at the old
 * address — the hinted credentials simply failed with "invalid email or
 * password". Reconciling these exact addresses keeps the hint true without
 * touching any account a human enrolled.
 */
const LEGACY_DEMO_ADMIN_EMAILS = ["safety@trufrenz.app"];
export const DEMO_ADMIN_PASSWORD = "Trufrenz#Safety2026";
export const DEMO_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
/** Fixed salt keeps the seeded hash stable across restarts. */
const DEMO_ADMIN_SALT = "5a1e7c0d9b2f4a6c8e0d1f3b5a7c9e0d";

/* --------------------------------- audit --------------------------------- */

/**
 * Record a product event from the dashboard side (an approval, a grant).
 * Imported lazily to keep this module free of a cycle with the account service.
 */
export async function recordAnalyticsEvent(input: {
  eventType: string;
  memberId?: number | null;
  groupId?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const occurredAt = new Date();
  await db.insert(analyticsEvents).values({
    day: dayKey(occurredAt),
    eventType: input.eventType,
    memberId: input.memberId ?? null,
    groupId: input.groupId ?? null,
    occurredAt,
  });
}

export async function logAdminAction(input: {
  actorEmail: string;
  actorRole: string;
  module: string;
  action: string;
  targetType: string;
  targetId: string | number;
  targetLabel: string;
  note?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminActions).values({
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    module: input.module,
    action: input.action,
    targetType: input.targetType,
    targetId: String(input.targetId),
    targetLabel: input.targetLabel.slice(0, 200),
    note: input.note ?? null,
  });
}

export async function listAdminActions(limit = 40) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminActions).orderBy(desc(adminActions.createdAt)).limit(limit);
}

/* ------------------------------ admin accounts --------------------------- */

export async function getAdminByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0];
}

export async function countAdminAccounts() {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ value: count() }).from(adminAccounts);
  return Number(rows[0]?.value ?? 0);
}

export async function createAdminAccount(input: {
  email: string;
  displayName: string;
  passwordHash: string;
  totpSecret: string;
  role?: "owner" | "admin" | "moderator";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(adminAccounts).values({
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName,
    passwordHash: input.passwordHash,
    totpSecret: input.totpSecret,
    role: input.role ?? "owner",
  });
}

export async function markAdminSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminAccounts).set({ lastSignedIn: new Date() }).where(eq(adminAccounts.id, id));
}

/* ------------------------------ admin sessions --------------------------- */

export async function createAdminSession(tokenHash: string, adminId: number, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(adminSessions).values({ tokenHash, adminId, expiresAt });
}

export async function getAdminSession(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select({
      sessionId: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      adminId: adminAccounts.id,
      email: adminAccounts.email,
      displayName: adminAccounts.displayName,
      role: adminAccounts.role,
      disabled: adminAccounts.disabled,
    })
    .from(adminSessions)
    .innerJoin(adminAccounts, eq(adminAccounts.id, adminSessions.adminId))
    .where(eq(adminSessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  if (row.disabled) return undefined;
  if (new Date(row.expiresAt).getTime() <= Date.now()) return undefined;
  return row;
}

export async function deleteAdminSession(tokenHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
}

/* --------------------------- 1. verification queue ----------------------- */

export async function listVerificationSubmissions(status?: "pending" | "approved" | "rejected") {
  const db = await getDb();
  if (!db) return [];

  const base = db
    .select({
      id: verificationSubmissions.id,
      memberId: verificationSubmissions.memberId,
      memberName: verificationSubmissions.memberName,
      submittedName: verificationSubmissions.submittedName,
      submittedDob: verificationSubmissions.submittedDob,
      selfieRef: verificationSubmissions.selfieRef,
      idDocumentRef: verificationSubmissions.idDocumentRef,
      riskScore: verificationSubmissions.riskScore,
      status: verificationSubmissions.status,
      rejectionReason: verificationSubmissions.rejectionReason,
      reviewedBy: verificationSubmissions.reviewedBy,
      reviewedAt: verificationSubmissions.reviewedAt,
      submittedAt: verificationSubmissions.submittedAt,
      memberHandle: members.handle,
      memberTier: members.verificationTier,
      memberArea: members.homeArea,
      memberReportCount: members.reportCount,
      memberStatus: members.accountStatus,
    })
    .from(verificationSubmissions)
    .leftJoin(members, eq(members.id, verificationSubmissions.memberId));

  const query = status ? base.where(eq(verificationSubmissions.status, status)) : base;
  return query.orderBy(desc(verificationSubmissions.submittedAt)).limit(200);
}

export async function reviewVerificationSubmission(input: {
  id: number;
  decision: "approved" | "rejected";
  rejectionReason?: string | null;
  reviewer: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(verificationSubmissions)
    .set({
      status: input.decision,
      rejectionReason: input.decision === "rejected" ? (input.rejectionReason ?? "") : null,
      reviewedBy: input.reviewer,
      reviewedAt: new Date(),
    })
    .where(eq(verificationSubmissions.id, input.id));

  if (input.decision === "approved") {
    const rows = await db
      .select({ memberId: verificationSubmissions.memberId })
      .from(verificationSubmissions)
      .where(eq(verificationSubmissions.id, input.id))
      .limit(1);
    const memberId = rows[0]?.memberId;
    if (memberId) {
      await db
        .update(members)
        .set({ verificationTier: "id_selfie" })
        .where(eq(members.id, memberId));

      await sendMemberNotice({
        memberId,
        kind: "verification_approved",
        title: "Your identity is verified",
        body: "Our safety team confirmed your ID and selfie, so your profile now carries the verified badge. It appears next to your name everywhere you show up.",
        actorEmail: input.reviewer,
      });

      await recordAnalyticsEvent({ eventType: "verification_approved", memberId });
    }
  } else {
    // A rejection must always explain itself to the member.
    const rows = await db
      .select({ memberId: verificationSubmissions.memberId })
      .from(verificationSubmissions)
      .where(eq(verificationSubmissions.id, input.id))
      .limit(1);
    const memberId = rows[0]?.memberId;
    if (memberId) {
      await sendMemberNotice({
        memberId,
        kind: "verification_rejected",
        title: "We could not verify your identity",
        body: `Our safety team reviewed your submission and could not approve it.\n\nReason: ${input.rejectionReason ?? "Not specified."}\n\nYou can submit again with clearer photos — a well-lit selfie and an unobstructed ID work best.`,
        actorEmail: input.reviewer,
      });
    }
  }
}

/* -------------------------- 2. reports & moderation --------------------- */

export type ReportStatus = "open" | "warned" | "suspended" | "banned" | "dismissed";

export async function listReports(status?: ReportStatus | "all") {
  const db = await getDb();
  if (!db) return [];

  const base = db.select().from(reports);
  const query =
    status && status !== "all" ? base.where(eq(reports.status, status as ReportStatus)) : base;

  // Auto-flagged items and the most-reported subjects surface at the top.
  return query
    .orderBy(desc(reports.autoFlagged), desc(reports.reportCount), desc(reports.createdAt))
    .limit(200);
}

export async function resolveReport(input: {
  id: number;
  action: "warned" | "suspended" | "banned" | "dismissed";
  note?: string | null;
  actor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(reports)
    .set({
      status: input.action,
      resolutionNote: input.note ?? null,
      resolvedBy: input.actor,
      resolvedAt: new Date(),
    })
    .where(eq(reports.id, input.id));

  const rows = await db
    .select({ subjectType: reports.subjectType, subjectId: reports.subjectId })
    .from(reports)
    .where(eq(reports.id, input.id))
    .limit(1);
  const report = rows[0];

  // Escalating a profile report moves the member's real account status, tells
  // them why, and ends their sessions so the change takes effect immediately.
  if (report?.subjectType === "profile" && input.action !== "dismissed") {
    await applyAccountStatusChange({
      memberId: report.subjectId,
      status: input.action,
      reason: input.note ?? null,
      actor: input.actor,
      source: `report #${input.id}`,
    });
  }

  // Sibling reports about the same subject resolve together.
  if (report && input.action !== "dismissed") {
    await db
      .update(reports)
      .set({
        status: input.action,
        resolvedBy: input.actor,
        resolvedAt: new Date(),
        resolutionNote: `Grouped with report #${input.id}`,
      })
      .where(
        and(
          eq(reports.subjectType, report.subjectType),
          eq(reports.subjectId, report.subjectId),
          eq(reports.status, "open"),
        ),
      );
  }
}

/**
 * Apply a moderation decision to a member's real account.
 *
 * This is the single path used by both the moderation queue and user
 * management, so the two modules cannot drift apart. It writes the status and
 * its reason, delivers a notice the member will actually see, and revokes
 * their sessions when access is removed.
 */
export async function applyAccountStatusChange(input: {
  memberId: number;
  status: "active" | "warned" | "suspended" | "banned";
  reason?: string | null;
  actor: string;
  source?: string;
}): Promise<{ member: typeof members.$inferSelect | undefined; sessionsRevoked: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getMember(input.memberId);
  if (!existing) return { member: undefined, sessionsRevoked: 0 };

  await db
    .update(members)
    .set({
      accountStatus: input.status,
      statusReason: input.reason ?? null,
      statusChangedBy: input.actor,
      statusChangedAt: new Date(),
    })
    .where(eq(members.id, input.memberId));

  const notice = noticeForStatus(input.status, input.reason ?? null, input.source);
  if (notice) {
    await sendMemberNotice({
      memberId: input.memberId,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      actorEmail: input.actor,
    });
  }

  // Suspension and banning remove access, so the member's sessions must end.
  let sessionsRevoked = 0;
  if (input.status === "suspended" || input.status === "banned") {
    sessionsRevoked = await revokeMemberSessions(input.memberId);
  }

  const member = await getMember(input.memberId);
  return { member, sessionsRevoked };
}

/** The member-facing notice that accompanies a status change. */
function noticeForStatus(
  status: "active" | "warned" | "suspended" | "banned",
  reason: string | null,
  source?: string,
): { kind: "warning" | "suspension" | "ban" | "reinstatement"; title: string; body: string } | null {
  const context = reason ? `\n\nReason given by our safety team: ${reason}` : "";
  const reference = source ? `\n\nReference: ${source}.` : "";

  switch (status) {
    case "warned":
      return {
        kind: "warning",
        title: "You have a warning on your account",
        body: `A moderator reviewed a report about your account and issued a warning. Nothing is blocked — but repeated reports can lead to a suspension.${context}${reference}`,
      };
    case "suspended":
      return {
        kind: "suspension",
        title: "Your account is suspended",
        body: `A moderator suspended your account after reviewing reports. You can still browse and read your existing conversations, but you cannot send messages, send friend requests, join meetups, share your location, or start calls.${context}${reference}`,
      };
    case "banned":
      return {
        kind: "ban",
        title: "Your account has been closed",
        body: `A moderator closed your account after reviewing reports. You are no longer visible to other members and can no longer take part. If you believe this was a mistake, contact support.${context}${reference}`,
      };
    case "active":
      return {
        kind: "reinstatement",
        title: "Your account is active again",
        body: `A moderator reviewed your account and restored it. Everything works as normal again.${context}${reference}`,
      };
    default:
      return null;
  }
}

/* ---------------------------- 3. user management ------------------------- */

export type MemberQuery = {
  search?: string;
  status?: string;
  tier?: string;
  page?: number;
  pageSize?: number;
};

export async function listMembers(query: MemberQuery) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0, page: 1, pageSize: 20 };

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 20));
  const filters = [];

  if (query.search?.trim()) {
    const needle = `%${query.search.trim()}%`;
    filters.push(
      or(like(members.name, needle), like(members.handle, needle), like(members.homeArea, needle)),
    );
  }
  if (query.status && query.status !== "all") {
    filters.push(eq(members.accountStatus, query.status as "active"));
  }
  if (query.tier && query.tier !== "all") {
    filters.push(eq(members.subscriptionTier, query.tier as "free"));
  }

  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(members)
    .where(where)
    .orderBy(desc(members.joinedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRows = await db.select({ value: count() }).from(members).where(where);

  return { rows, total: Number(totalRows[0]?.value ?? 0), page, pageSize };
}

export async function getMember(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(members).where(eq(members.id, id)).limit(1);
  return rows[0];
}

export async function updateMemberStatus(
  id: number,
  status: "active" | "warned" | "suspended" | "banned",
  options: { reason?: string | null; actor?: string } = {},
) {
  // Delegates to the shared path so user management and the moderation queue
  // write identical state, notices, and session revocations.
  await applyAccountStatusChange({
    memberId: id,
    status,
    reason: options.reason ?? null,
    actor: options.actor ?? "dashboard",
  });
}

export async function forceVerifyMember(id: number, actor = "dashboard") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(members).set({ verificationTier: "id_selfie" }).where(eq(members.id, id));

  await sendMemberNotice({
    memberId: id,
    kind: "verification_approved",
    title: "Your identity is verified",
    body: "Our safety team confirmed your ID and selfie, so your profile now carries the verified badge. It appears next to your name everywhere you show up.",
    actorEmail: actor,
  });
}

/**
 * Issue a one-time account-recovery token.
 *
 * The member signs in with a phone OTP, so this is the recovery path for a
 * support case: a fresh token is minted, stored as a hash, and delivered to the
 * member as a notice. A real deployment sends it by SMS or email instead of
 * showing it in-app, which is why the raw token is returned here for the
 * dashboard to display once.
 */
export async function issuePasswordReset(
  id: number,
  actor: string,
): Promise<{ token: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const token = createHash("sha256")
    .update(`${id}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();

  await db
    .update(members)
    .set({
      resetTokenHash: createHash("sha256").update(token).digest("hex"),
      resetRequestedAt: new Date(),
    })
    .where(eq(members.id, id));

  await sendMemberNotice({
    memberId: id,
    kind: "announcement",
    title: "Account recovery started",
    body: `Our support team started an account recovery for you. Use this one-time code the next time you sign in: ${token}\n\nIf you did not ask for this, contact support straight away.`,
    actorEmail: actor,
  });

  return { token };
}

export async function listMemberActivity(memberId: number, limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(adminActions)
    .where(and(eq(adminActions.targetType, "member"), eq(adminActions.targetId, String(memberId))))
    .orderBy(desc(adminActions.createdAt))
    .limit(limit);
}

/* --------------------------- 4. analytics dashboard --------------------- */

export async function listDailyMetrics(days = 14) {
  const db = await getDb();
  if (!db) return [];

  // Metrics are derived from the real event stream so the trend reflects usage.
  const keys = dayRange(dayKey(new Date()), days);
  const events = await listRawEventsForDays(keys);
  const snapshot = await getAccountSnapshot();

  // Any event outside the requested window is irrelevant to the rollup.
  const rows = rollupRange(keys, events, snapshot);

  // Persist the rollup so historical days stay queryable even after the raw
  // events are aged out, and so the table remains the dashboard's cache.
  await persistDailyMetrics(rows);

  return rows;
}

/** Verified and tier splits are point-in-time account facts, not event counts. */
async function getAccountSnapshot(): Promise<AccountSnapshot> {
  const db = await getDb();
  if (!db) return { verified: 0, unverified: 0, free: 0, premium: 0 };

  const rows = await db
    .select({
      verificationTier: members.verificationTier,
      subscriptionTier: members.subscriptionTier,
    })
    .from(members);

  const verified = rows.filter((row) => row.verificationTier === "id_selfie").length;
  const premium = rows.filter((row) => row.subscriptionTier === "premium").length;

  return {
    verified,
    unverified: rows.length - verified,
    free: rows.length - premium,
    premium,
  };
}

async function listRawEventsForDays(days: string[]): Promise<RawAnalyticsEvent[]> {
  const db = await getDb();
  if (!db || days.length === 0) return [];

  const rows = await db
    .select({
      eventType: analyticsEvents.eventType,
      day: analyticsEvents.day,
      memberId: analyticsEvents.memberId,
      groupId: analyticsEvents.groupId,
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.day, days[0]));

  return rows.filter((row) => days.includes(row.day));
}

/** Upsert the derived rows so `daily_metrics` mirrors the event stream. */
async function persistDailyMetrics(rows: Awaited<ReturnType<typeof rollupRange>>) {
  const db = await getDb();
  if (!db) return;
  for (const row of rows) {
    await db
      .insert(dailyMetrics)
      .values(row)
      .onDuplicateKeyUpdate({
        set: {
          activeUsers: row.activeUsers,
          newSignups: row.newSignups,
          verifiedUsers: row.verifiedUsers,
          unverifiedUsers: row.unverifiedUsers,
          freeUsers: row.freeUsers,
          paidUsers: row.paidUsers,
          activeGroups: row.activeGroups,
          callsMade: row.callsMade,
          matchesMade: row.matchesMade,
        },
      });
  }
}

/**
 * Where the analytics numbers come from, surfaced for the dashboard.
 *
 * Returns the live event counters for the requested window plus the most recent
 * events, so an operator can see both the totals and the raw activity behind
 * them rather than having to trust a chart.
 */
export async function getAnalyticsSources(days = 14) {
  const db = await getDb();
  if (!db) {
    return { windowDays: days, eventTotal: 0, distinctMembers: 0, byType: {}, recent: [] };
  }

  const keys = dayRange(dayKey(new Date()), days);
  const events = await listRawEventsForDays(keys);
  const summary = summarizeEvents(events);
  const recent = await db
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
    .limit(20);

  return {
    windowDays: days,
    eventTotal: summary.total,
    distinctMembers: summary.distinctMembers,
    byType: summary.counts,
    recent,
  };
}

export async function getMemberTotals() {
  const db = await getDb();
  if (!db) {
    return {
      totalUsers: 0,
      verified: 0,
      unverified: 0,
      free: 0,
      premium: 0,
      suspended: 0,
      banned: 0,
      active: 0,
      avgReportsPerUser: 0,
    };
  }

  const rows = await db.select().from(members);
  const totalUsers = rows.length;
  const verified = rows.filter((row) => row.verificationTier === "id_selfie").length;
  const premium = rows.filter((row) => row.subscriptionTier === "premium").length;
  const reportSum = rows.reduce((sum, row) => sum + row.reportCount, 0);

  return {
    totalUsers,
    verified,
    unverified: totalUsers - verified,
    free: totalUsers - premium,
    premium,
    suspended: rows.filter((row) => row.accountStatus === "suspended").length,
    banned: rows.filter((row) => row.accountStatus === "banned").length,
    active: rows.filter((row) => row.accountStatus === "active").length,
    avgReportsPerUser: totalUsers ? Number((reportSum / totalUsers).toFixed(2)) : 0,
  };
}

export async function getQueueCounts() {
  const db = await getDb();
  if (!db) return { pendingVerifications: 0, openReports: 0, autoFlagged: 0 };

  const pending = await db
    .select({ value: count() })
    .from(verificationSubmissions)
    .where(eq(verificationSubmissions.status, "pending"));
  const open = await db
    .select({ value: count() })
    .from(reports)
    .where(eq(reports.status, "open"));
  const flagged = await db
    .select({ value: count() })
    .from(reports)
    .where(and(eq(reports.status, "open"), eq(reports.autoFlagged, true)));

  return {
    pendingVerifications: Number(pending[0]?.value ?? 0),
    openReports: Number(open[0]?.value ?? 0),
    autoFlagged: Number(flagged[0]?.value ?? 0),
  };
}

/* ------------------------ 5. content & safety controls ------------------ */

export async function listFeatureFlags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(featureFlags).orderBy(asc(featureFlags.id));
}

export async function setFeatureFlag(flagKey: string, enabled: boolean, actor: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(featureFlags)
    .set({ enabled, updatedBy: actor })
    .where(eq(featureFlags.flagKey, flagKey));
}

export async function listBlockedKeywords() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blockedKeywords).orderBy(desc(blockedKeywords.hits));
}

export async function addBlockedKeyword(input: {
  keyword: string;
  severity: "low" | "medium" | "high";
  actor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(blockedKeywords)
    .values({
      keyword: input.keyword.trim().toLowerCase(),
      severity: input.severity,
      addedBy: input.actor,
    })
    .onDuplicateKeyUpdate({ set: { severity: input.severity } });
}

export async function removeBlockedKeyword(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blockedKeywords).where(eq(blockedKeywords.id, id));
}

export async function listBroadcasts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(50);
}

export async function createBroadcast(input: {
  title: string;
  body: string;
  segment: "all" | "verified" | "unverified" | "free" | "premium";
  actor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Deliver the announcement to every member in the audience before recording
  // it, so the recipient count in the log is the number actually reached.
  const delivered = await deliverBroadcast({
    title: input.title,
    body: input.body,
    segment: input.segment,
    actorEmail: input.actor,
  });

  await db.insert(broadcasts).values({
    title: input.title,
    body: input.body,
    segment: input.segment,
    recipientCount: delivered,
    sentBy: input.actor,
  });

  return delivered;
}


/* ------------------------ 6. subscription management -------------------- */

export async function listSubscriptionEvents(kind?: "grant" | "revoke" | "refund") {
  const db = await getDb();
  if (!db) return [];
  const base = db.select().from(subscriptionEvents);
  const query = kind ? base.where(eq(subscriptionEvents.kind, kind)) : base;
  return query.orderBy(desc(subscriptionEvents.createdAt)).limit(100);
}

export async function listPaidMembers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(members)
    .where(eq(members.subscriptionTier, "premium"))
    .orderBy(desc(members.joinedAt))
    .limit(200);
}

export async function changeSubscription(input: {
  memberId: number;
  kind: "grant" | "revoke" | "refund";
  amountCents?: number;
  reason?: string | null;
  actor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(members).where(eq(members.id, input.memberId)).limit(1);
  const member = rows[0];
  if (!member) throw new Error("Member not found");

  const tier = input.kind === "grant" ? "premium" : "free";
  await db
    .update(members)
    .set({ subscriptionTier: tier })
    .where(eq(members.id, input.memberId));

  await db.insert(subscriptionEvents).values({
    memberId: member.id,
    memberName: member.name,
    kind: input.kind,
    tier,
    amountCents: input.amountCents ?? 0,
    reason: input.reason ?? null,
    actorEmail: input.actor,
  });

  return { memberName: member.name, tier };
}

/* ------------------------------ demo seeding ---------------------------- */

/**
 * Populate the dashboard with a realistic working dataset the first time it
 * boots. Idempotent: it exits early as soon as any members exist.
 */

/**
 * Backfill fourteen days of demo product events.
 *
 * The analytics dashboard no longer reads a synthetic series: it derives its
 * trends from `analytics_events`, exactly as it does in production. Seeding
 * events rather than metrics means the charts are produced by the same rollup
 * that real usage flows through, so the pipeline is exercised end to end.
 */
async function seedDemoEvents(memberIds: number[]) {
  const db = await getDb();
  if (!db || memberIds.length === 0) return;

  const existing = await db.select({ value: count() }).from(analyticsEvents);
  if (Number(existing[0]?.value ?? 0) > 0) return;

  const today = dayKey(new Date());
  const days = dayRange(today, 14);
  const rows: Array<{
    day: string;
    eventType: string;
    memberId: number | null;
    groupId: string | null;
    occurredAt: Date;
  }> = [];

  for (const day of days) {
    const events = demoEventsForDay(day, memberIds);
    for (const event of events) {
      rows.push({
        day,
        eventType: event.eventType,
        memberId: event.memberId ?? null,
        groupId: event.groupId ?? null,
        // Spread each day's events across its hours for a readable feed.
        occurredAt: new Date(`${day}T${String(9 + (rows.length % 12)).padStart(2, "0")}:00:00.000Z`),
      });
    }
  }

  if (rows.length > 0) await db.insert(analyticsEvents).values(rows);
}

/**
 * Move the demo admin to the current address if it is still on a legacy one.
 *
 * Deliberately narrow. It matches only the addresses this repo has itself
 * seeded, so an account that a person enrolled — or an address an attacker
 * created — is never renamed. It also refuses to act when the current address
 * is already taken, which would otherwise be a unique-constraint crash on boot.
 */
async function reconcileDemoAdminEmail(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<void> {
  const legacy = await db
    .select({ id: adminAccounts.id, email: adminAccounts.email })
    .from(adminAccounts)
    .where(inArray(adminAccounts.email, LEGACY_DEMO_ADMIN_EMAILS));

  if (legacy.length === 0) return;

  const alreadyCurrent = await db
    .select({ id: adminAccounts.id })
    .from(adminAccounts)
    .where(eq(adminAccounts.email, DEMO_ADMIN_EMAIL))
    .limit(1);

  if (alreadyCurrent.length > 0) {
    // Two rows claiming the same account is worse than a stale address, so
    // leave it for a human rather than guessing which one to retire.
    console.warn(
      `[admin] both ${DEMO_ADMIN_EMAIL} and a legacy demo address exist; leaving them alone`,
    );
    return;
  }

  for (const row of legacy) {
    await db
      .update(adminAccounts)
      .set({ email: DEMO_ADMIN_EMAIL })
      .where(eq(adminAccounts.id, row.id));
    console.log(`[admin] demo admin moved from ${row.email} to ${DEMO_ADMIN_EMAIL}`);
  }
}

export async function seedAdminDemoData(): Promise<{ seeded: boolean }> {
  const db = await getDb();
  if (!db) return { seeded: false };

  await reconcileDemoAdminEmail(db);

  const existing = await db.select({ value: count() }).from(members);
  if (Number(existing[0]?.value ?? 0) > 0) {
    // A database seeded before the event stream existed still gets a trend
    // series, so the charts are never blank on an upgraded install.
    const seeded = await db.select({ id: members.id }).from(members);
    await seedDemoEvents(seeded.map((row) => row.id));
    return { seeded: false };
  }

  // Create the first dashboard owner alongside the dataset so the internal
  // tool is reachable. Real deployments replace this with the bootstrap flow.
  const existingAdmins = await db.select({ value: count() }).from(adminAccounts);
  if (Number(existingAdmins[0]?.value ?? 0) === 0) {
    await db.insert(adminAccounts).values({
      email: DEMO_ADMIN_EMAIL,
      displayName: "Safety Lead",
      passwordHash: hashPassword(DEMO_ADMIN_PASSWORD, DEMO_ADMIN_SALT),
      totpSecret: DEMO_ADMIN_TOTP_SECRET,
      role: "owner",
    });
  }

  /**
   * Demo members carry real phone numbers so they behave as genuine accounts:
   * a moderation decision applies to them, and they could sign in to the app.
   * Every number is in the reserved +1 555 range.
   */
  const memberRows: InsertMember[] = [
    { handle: "maya", name: "Maya Chen", phoneE164: "+14155550101", email: "maya@example.com", age: 30, dateOfBirth: "1996-04-18", homeArea: "Pacific Heights", verificationTier: "id_selfie", subscriptionTier: "premium", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 12) },
    { handle: "sam", name: "Sam Rivera", phoneE164: "+14155550102", email: "sam@example.com", age: 28, dateOfBirth: "1998-01-09", homeArea: "Mission District", verificationTier: "phone", subscriptionTier: "free", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 90) },
    { handle: "noah", name: "Noah Kim", phoneE164: "+14155550103", email: "noah@example.com", age: 34, dateOfBirth: "1992-07-22", homeArea: "Hayes Valley", verificationTier: "id_selfie", subscriptionTier: "free", available: false, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 5) },
    { handle: "aria", name: "Aria Patel", phoneE164: "+14155550104", email: "aria@example.com", age: 26, dateOfBirth: "2000-03-02", homeArea: "SoMa", verificationTier: "phone", subscriptionTier: "free", available: true, reportCount: 1, lastActiveAt: new Date(Date.now() - 1000 * 60 * 30) },
    { handle: "jules", name: "Jules Morgan", phoneE164: "+14155550105", email: "jules@example.com", age: 31, dateOfBirth: "1995-11-14", homeArea: "Nob Hill", verificationTier: "none", subscriptionTier: "free", available: false, reportCount: 4, accountStatus: "warned", statusReason: "Repeatedly pushing dating-style messages after being asked to stop.", statusChangedBy: "safety@trufrenz.net", statusChangedAt: new Date(Date.now() - 1000 * 60 * 60 * 20), lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 20) },
    { handle: "devon", name: "Devon Blake", phoneE164: "+14155550106", email: "devon@example.com", age: 29, dateOfBirth: "1997-06-30", homeArea: "Richmond", verificationTier: "phone", subscriptionTier: "premium", available: true, reportCount: 7, accountStatus: "suspended", statusReason: "Seven confirmed reports of inappropriate messaging.", statusChangedBy: "safety@trufrenz.net", statusChangedAt: new Date(Date.now() - 1000 * 60 * 60 * 48), lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 48) },
    { handle: "lena", name: "Lena Okafor", phoneE164: "+14155550107", email: "lena@example.com", age: 33, dateOfBirth: "1993-09-05", homeArea: "Sunset", verificationTier: "id_selfie", subscriptionTier: "free", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 8) },
    { handle: "ravi", name: "Ravi Nair", phoneE164: "+14155550108", email: "ravi@example.com", age: 27, dateOfBirth: "1999-02-17", homeArea: "Bernal Heights", verificationTier: "none", subscriptionTier: "free", available: false, reportCount: 2, accountStatus: "banned", statusReason: "Hate speech confirmed by the blocked keyword list and moderator review.", statusChangedBy: "safety@trufrenz.net", statusChangedAt: new Date(Date.now() - 1000 * 60 * 60 * 72), lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    { handle: "tess", name: "Tess Alvarez", phoneE164: "+14155550109", email: "tess@example.com", age: 25, dateOfBirth: "2001-05-21", homeArea: "Castro", verificationTier: "phone", subscriptionTier: "premium", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 3) },
    { handle: "omar", name: "Omar Haddad", phoneE164: "+14155550110", email: "omar@example.com", age: 36, dateOfBirth: "1990-12-01", homeArea: "Marina", verificationTier: "id_selfie", subscriptionTier: "free", available: true, reportCount: 1, lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 11) },
    { handle: "ivy", name: "Ivy Nakamura", phoneE164: "+14155550111", email: "ivy@example.com", age: 32, dateOfBirth: "1994-08-08", homeArea: "North Beach", verificationTier: "phone", subscriptionTier: "free", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 40) },
    { handle: "cruz", name: "Cruz Delgado", phoneE164: "+14155550112", email: "cruz@example.com", age: 41, dateOfBirth: "1985-04-11", homeArea: "Excelsior", verificationTier: "none", subscriptionTier: "free", available: false, reportCount: 5, accountStatus: "suspended", statusReason: "Impersonation confirmed: profile photo is a stock image.", statusChangedBy: "safety@trufrenz.net", statusChangedAt: new Date(Date.now() - 1000 * 60 * 60 * 36), lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 36) },
  ];

  await db.insert(members).values(memberRows);

  const inserted = await db.select({ id: members.id, name: members.name, handle: members.handle }).from(members);
  const idFor = (handle: string) => inserted.find((row) => row.handle === handle)?.id ?? 0;

  // Backfill the event stream the analytics dashboard derives its trends from.
  await seedDemoEvents(inserted.map((row) => row.id));

  // Restricted demo accounts carry the notice a real moderation decision would
  // have delivered, so signing in as one shows the member exactly what happened.
  for (const member of inserted) {
    const row = memberRows.find((candidate) => candidate.handle === member.handle);
    if (!row || !row.accountStatus || row.accountStatus === "active") continue;
    const notice = noticeForStatus(row.accountStatus, row.statusReason ?? null, "seeded demo account");
    if (!notice) continue;
    await sendMemberNotice({
      memberId: member.id,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      actorEmail: row.statusChangedBy ?? DEMO_ADMIN_EMAIL,
    });
  }

  await db.insert(verificationSubmissions).values([
    { memberId: idFor("aria"), memberName: "Aria Patel", submittedName: "Aria Patel", submittedDob: "2000-03-02", selfieRef: "seed/aria-selfie.jpg", idDocumentRef: "seed/aria-id.jpg", riskScore: 8, status: "pending", submittedAt: new Date(Date.now() - 1000 * 60 * 55) },
    { memberId: idFor("omar"), memberName: "Omar Haddad", submittedName: "Omar Haddad", submittedDob: "1990-12-01", selfieRef: "seed/omar-selfie.jpg", idDocumentRef: "seed/omar-id.jpg", riskScore: 21, status: "pending", submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 3) },
    { memberId: idFor("tess"), memberName: "Tess Alvarez", submittedName: "Tess Alvarez", submittedDob: "2001-05-21", selfieRef: "seed/tess-selfie.jpg", idDocumentRef: "seed/tess-id.jpg", riskScore: 74, status: "pending", submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 26) },
    { memberId: idFor("sam"), memberName: "Sam Rivera", submittedName: "Sam Rivera", submittedDob: "1998-01-09", selfieRef: "seed/sam-selfie.jpg", idDocumentRef: "seed/sam-id.jpg", riskScore: 12, status: "approved", reviewedBy: "safety@trufrenz.net", reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 50) },
    { memberId: idFor("ravi"), memberName: "Ravi Nair", submittedName: "Ravi Kumar", submittedDob: "1999-02-17", selfieRef: "seed/ravi-selfie.jpg", idDocumentRef: "seed/ravi-id.jpg", riskScore: 88, status: "rejected", rejectionReason: "The name on the ID does not match the profile name.", reviewedBy: "safety@trufrenz.net", reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 30) },
  ]);

  await db.insert(reports).values([
    { subjectType: "profile", subjectId: idFor("devon"), subjectLabel: "Devon Blake", reporterName: "Maya Chen", reason: "Sending inappropriate messages", contentExcerpt: "hey, are you free tonight? my place", severity: "critical", reportCount: 7, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 20) },
    { subjectType: "message", subjectId: idFor("devon"), subjectLabel: "Message from Devon Blake", reporterName: "Ivy Nakamura", reason: "Harassment", contentExcerpt: "you owe me a reply, answer me", severity: "high", reportCount: 7, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 45) },
    { subjectType: "profile", subjectId: idFor("cruz"), subjectLabel: "Cruz Delgado", reporterName: "Noah Kim", reason: "Impersonation", contentExcerpt: "Profile photo appears to be a stock image", severity: "high", reportCount: 5, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6) },
    { subjectType: "group", subjectId: idFor("jules"), subjectLabel: "Rooftop Socials", reporterName: "Lena Okafor", reason: "Spam invites", contentExcerpt: "Join my paid events channel", severity: "medium", reportCount: 4, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 14) },
    { subjectType: "profile", subjectId: idFor("jules"), subjectLabel: "Jules Morgan", reporterName: "Tess Alvarez", reason: "Not interested in friendship", contentExcerpt: "Repeatedly pushing dating-style messages", severity: "medium", reportCount: 4, autoFlagged: false, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18) },
    { subjectType: "message", subjectId: idFor("ravi"), subjectLabel: "Message from Ravi Nair", reporterName: "Omar Haddad", reason: "Hate speech", contentExcerpt: "Flagged automatically by the blocked keyword list", severity: "critical", reportCount: 2, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 60) },
    { subjectType: "profile", subjectId: idFor("aria"), subjectLabel: "Aria Patel", reporterName: "Ivy Nakamura", reason: "Fake photos", contentExcerpt: "Photos look like someone else", severity: "low", reportCount: 1, autoFlagged: false, status: "dismissed", resolutionNote: "Photos verified against the ID on file.", resolvedBy: "safety@trufrenz.net", resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 8), createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20) },
    { subjectType: "profile", subjectId: idFor("ravi"), subjectLabel: "Ravi Nair", reporterName: "Lena Okafor", reason: "Harassment", contentExcerpt: "Abusive language in a group chat", severity: "high", reportCount: 2, autoFlagged: false, status: "banned", resolutionNote: "Third confirmed harassment case.", resolvedBy: "safety@trufrenz.net", resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 40), createdAt: new Date(Date.now() - 1000 * 60 * 60 * 70) },
  ]);

  await db.insert(featureFlags).values([
    { flagKey: "calling", label: "Voice & video calling", description: "Premium calling in 1:1 and group chats.", enabled: true },
    { flagKey: "live_map", label: "Live map", description: "Premium live-location map and distance features.", enabled: true },
    { flagKey: "discovery", label: "Friend discovery", description: "The non-swipe nearby friends feed.", enabled: true },
    { flagKey: "meetups", label: "Meetups", description: "Public-venue meetup invites and RSVPs.", enabled: true },
    { flagKey: "verification", label: "ID & selfie verification", description: "Accept new verification submissions.", enabled: true },
    { flagKey: "maintenance_mode", label: "Maintenance mode", description: "Show a maintenance notice instead of the app.", enabled: false },
  ]);

  await db.insert(blockedKeywords).values([
    { keyword: "wire me money", severity: "high", hits: 12, addedBy: "safety@trufrenz.net" },
    { keyword: "crypto investment", severity: "high", hits: 8, addedBy: "safety@trufrenz.net" },
    { keyword: "send nudes", severity: "high", hits: 21, addedBy: "safety@trufrenz.net" },
    { keyword: "whatsapp me", severity: "medium", hits: 34, addedBy: "safety@trufrenz.net" },
    { keyword: "pay for my ticket", severity: "medium", hits: 6, addedBy: "safety@trufrenz.net" },
    { keyword: "my sugar", severity: "low", hits: 3, addedBy: "safety@trufrenz.net" },
  ]);

  await db.insert(broadcasts).values([
    { title: "Meet in public places", body: "A gentle reminder: choose a public venue for first meetups and tell a friend where you are going.", segment: "all", recipientCount: memberRows.length, sentBy: "safety@trufrenz.net", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    { title: "Get verified this week", body: "Verified members get 2x more accepted friend requests. Verification takes about a minute.", segment: "unverified", recipientCount: 6, sentBy: "safety@trufrenz.net", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30) },
  ]);

  await db.insert(subscriptionEvents).values([
    { memberId: idFor("maya"), memberName: "Maya Chen", kind: "grant", tier: "premium", amountCents: 0, reason: "Support goodwill credit after the duplicate charge.", actorEmail: "billing@trufrenz.net", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12) },
    { memberId: idFor("devon"), memberName: "Devon Blake", kind: "revoke", tier: "free", amountCents: 0, reason: "Account suspended pending review.", actorEmail: "safety@trufrenz.net", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 40) },
    { memberId: idFor("ivy"), memberName: "Ivy Nakamura", kind: "refund", tier: "free", amountCents: 1299, reason: "Cancelled within the cooling-off window.", actorEmail: "billing@trufrenz.net", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 60) },
  ]);


  await logAdminAction({
    actorEmail: "system@trufrenz.net",
    actorRole: "owner",
    module: "system",
    action: "seed",
    targetType: "workspace",
    targetId: "initial",
    targetLabel: "Initial dashboard dataset",
    note: "Seeded members, verification queue, reports, flags, keywords, broadcasts, subscription events, and 14 days of metrics.",
  });

  return { seeded: true };
}
