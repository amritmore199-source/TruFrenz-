/**
 * Data access for the internal admin dashboard.
 *
 * Every helper degrades gracefully when the database is unreachable so the
 * dashboard renders an explanatory empty state instead of crashing.
 */

import { and, asc, count, desc, eq, gte, like, or, sql } from "drizzle-orm";
import {
  adminAccounts,
  adminActions,
  adminSessions,
  blockedKeywords,
  broadcasts,
  dailyMetrics,
  featureFlags,
  members,
  reports,
  subscriptionEvents,
  verificationSubmissions,
  type InsertMember,
} from "../drizzle/schema";
import { getDb } from "./db";
import { hashPassword } from "./_core/adminAuth";

/**
 * First-run dashboard owner.
 *
 * The password and TOTP secret are fixed so the seeded account can be signed
 * into during development; the dashboard shows these credentials on its login
 * screen and flags them as needing replacement before any real deployment.
 */
export const DEMO_ADMIN_EMAIL = "safety@trufrenz.app";
export const DEMO_ADMIN_PASSWORD = "Trufrenz#Safety2026";
export const DEMO_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
/** Fixed salt keeps the seeded hash stable across restarts. */
const DEMO_ADMIN_SALT = "5a1e7c0d9b2f4a6c8e0d1f3b5a7c9e0d";

/* --------------------------------- audit --------------------------------- */

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

  // Escalating a profile report also moves the member's account status.
  if (report?.subjectType === "profile" && input.action !== "dismissed") {
    await db
      .update(members)
      .set({ accountStatus: input.action })
      .where(eq(members.id, report.subjectId));
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
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(members).set({ accountStatus: status }).where(eq(members.id, id));
}

export async function forceVerifyMember(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(members).set({ verificationTier: "id_selfie" }).where(eq(members.id, id));
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
  return db.select().from(dailyMetrics).orderBy(asc(dailyMetrics.day)).limit(days);
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

  const all = await db.select().from(members);
  const recipientCount = all.filter((member) => {
    switch (input.segment) {
      case "verified":
        return member.verificationTier === "id_selfie";
      case "unverified":
        return member.verificationTier !== "id_selfie";
      case "free":
        return member.subscriptionTier === "free";
      case "premium":
        return member.subscriptionTier === "premium";
      default:
        return true;
    }
  }).length;

  await db.insert(broadcasts).values({
    title: input.title,
    body: input.body,
    segment: input.segment,
    recipientCount,
    sentBy: input.actor,
  });

  return recipientCount;
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

/** Fourteen days of product health for the trend charts. */
function buildDailyMetrics() {
  const today = new Date();
  return Array.from({ length: 14 }, (_, index) => {
    const day = new Date(today.getTime() - (13 - index) * 24 * 60 * 60 * 1000);
    const iso = day.toISOString().slice(0, 10);
    const base = 1180 + index * 46;
    const verified = 640 + index * 27;
    const total = base + 380;
    return {
      day: iso,
      activeUsers: base + ((index * 13) % 40),
      newSignups: 26 + ((index * 7) % 19),
      verifiedUsers: verified,
      unverifiedUsers: total - verified,
      freeUsers: total - (180 + index * 6),
      paidUsers: 180 + index * 6,
      activeGroups: 64 + ((index * 5) % 17),
      callsMade: 210 + ((index * 23) % 120),
      matchesMade: 96 + ((index * 11) % 45),
    };
  });
}

export async function seedAdminDemoData(): Promise<{ seeded: boolean }> {
  const db = await getDb();
  if (!db) return { seeded: false };

  // Backfill the trend series independently of the main dataset, so a seed that
  // was interrupted part-way (or a database that predates the metrics table)
  // heals itself on the next boot instead of leaving empty charts.
  const metricsExisting = await db.select({ value: count() }).from(dailyMetrics);
  if (Number(metricsExisting[0]?.value ?? 0) === 0) {
    await db.insert(dailyMetrics).values(buildDailyMetrics());
  }

  const existing = await db.select({ value: count() }).from(members);
  if (Number(existing[0]?.value ?? 0) > 0) return { seeded: false };

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

  const memberRows: InsertMember[] = [
    { handle: "maya", name: "Maya Chen", age: 30, dateOfBirth: "1996-04-18", homeArea: "Pacific Heights", verificationTier: "id_selfie", subscriptionTier: "premium", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 12) },
    { handle: "sam", name: "Sam Rivera", age: 28, dateOfBirth: "1998-01-09", homeArea: "Mission District", verificationTier: "phone", subscriptionTier: "free", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 90) },
    { handle: "noah", name: "Noah Kim", age: 34, dateOfBirth: "1992-07-22", homeArea: "Hayes Valley", verificationTier: "id_selfie", subscriptionTier: "free", available: false, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 5) },
    { handle: "aria", name: "Aria Patel", age: 26, dateOfBirth: "2000-03-02", homeArea: "SoMa", verificationTier: "phone", subscriptionTier: "free", available: true, reportCount: 1, lastActiveAt: new Date(Date.now() - 1000 * 60 * 30) },
    { handle: "jules", name: "Jules Morgan", age: 31, dateOfBirth: "1995-11-14", homeArea: "Nob Hill", verificationTier: "none", subscriptionTier: "free", available: false, reportCount: 4, accountStatus: "warned", lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 20) },
    { handle: "devon", name: "Devon Blake", age: 29, dateOfBirth: "1997-06-30", homeArea: "Richmond", verificationTier: "phone", subscriptionTier: "premium", available: true, reportCount: 7, accountStatus: "suspended", lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 48) },
    { handle: "lena", name: "Lena Okafor", age: 33, dateOfBirth: "1993-09-05", homeArea: "Sunset", verificationTier: "id_selfie", subscriptionTier: "free", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 8) },
    { handle: "ravi", name: "Ravi Nair", age: 27, dateOfBirth: "1999-02-17", homeArea: "Bernal Heights", verificationTier: "none", subscriptionTier: "free", available: false, reportCount: 2, accountStatus: "banned", lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    { handle: "tess", name: "Tess Alvarez", age: 25, dateOfBirth: "2001-05-21", homeArea: "Castro", verificationTier: "phone", subscriptionTier: "premium", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 3) },
    { handle: "omar", name: "Omar Haddad", age: 36, dateOfBirth: "1990-12-01", homeArea: "Marina", verificationTier: "id_selfie", subscriptionTier: "free", available: true, reportCount: 1, lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 11) },
    { handle: "ivy", name: "Ivy Nakamura", age: 32, dateOfBirth: "1994-08-08", homeArea: "North Beach", verificationTier: "phone", subscriptionTier: "free", available: true, reportCount: 0, lastActiveAt: new Date(Date.now() - 1000 * 60 * 40) },
    { handle: "cruz", name: "Cruz Delgado", age: 41, dateOfBirth: "1985-04-11", homeArea: "Excelsior", verificationTier: "none", subscriptionTier: "free", available: false, reportCount: 5, accountStatus: "suspended", lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 36) },
  ];

  await db.insert(members).values(memberRows);

  const inserted = await db.select({ id: members.id, name: members.name, handle: members.handle }).from(members);
  const idFor = (handle: string) => inserted.find((row) => row.handle === handle)?.id ?? 0;

  await db.insert(verificationSubmissions).values([
    { memberId: idFor("aria"), memberName: "Aria Patel", submittedName: "Aria Patel", submittedDob: "2000-03-02", selfieRef: "seed/aria-selfie.jpg", idDocumentRef: "seed/aria-id.jpg", riskScore: 8, status: "pending", submittedAt: new Date(Date.now() - 1000 * 60 * 55) },
    { memberId: idFor("omar"), memberName: "Omar Haddad", submittedName: "Omar Haddad", submittedDob: "1990-12-01", selfieRef: "seed/omar-selfie.jpg", idDocumentRef: "seed/omar-id.jpg", riskScore: 21, status: "pending", submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 3) },
    { memberId: idFor("tess"), memberName: "Tess Alvarez", submittedName: "Tess Alvarez", submittedDob: "2001-05-21", selfieRef: "seed/tess-selfie.jpg", idDocumentRef: "seed/tess-id.jpg", riskScore: 74, status: "pending", submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 26) },
    { memberId: idFor("sam"), memberName: "Sam Rivera", submittedName: "Sam Rivera", submittedDob: "1998-01-09", selfieRef: "seed/sam-selfie.jpg", idDocumentRef: "seed/sam-id.jpg", riskScore: 12, status: "approved", reviewedBy: "safety@trufrenz.app", reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 50) },
    { memberId: idFor("ravi"), memberName: "Ravi Nair", submittedName: "Ravi Kumar", submittedDob: "1999-02-17", selfieRef: "seed/ravi-selfie.jpg", idDocumentRef: "seed/ravi-id.jpg", riskScore: 88, status: "rejected", rejectionReason: "The name on the ID does not match the profile name.", reviewedBy: "safety@trufrenz.app", reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 30) },
  ]);

  await db.insert(reports).values([
    { subjectType: "profile", subjectId: idFor("devon"), subjectLabel: "Devon Blake", reporterName: "Maya Chen", reason: "Sending inappropriate messages", contentExcerpt: "hey, are you free tonight? my place", severity: "critical", reportCount: 7, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 20) },
    { subjectType: "message", subjectId: idFor("devon"), subjectLabel: "Message from Devon Blake", reporterName: "Ivy Nakamura", reason: "Harassment", contentExcerpt: "you owe me a reply, answer me", severity: "high", reportCount: 7, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 45) },
    { subjectType: "profile", subjectId: idFor("cruz"), subjectLabel: "Cruz Delgado", reporterName: "Noah Kim", reason: "Impersonation", contentExcerpt: "Profile photo appears to be a stock image", severity: "high", reportCount: 5, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6) },
    { subjectType: "group", subjectId: idFor("jules"), subjectLabel: "Rooftop Socials", reporterName: "Lena Okafor", reason: "Spam invites", contentExcerpt: "Join my paid events channel", severity: "medium", reportCount: 4, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 14) },
    { subjectType: "profile", subjectId: idFor("jules"), subjectLabel: "Jules Morgan", reporterName: "Tess Alvarez", reason: "Not interested in friendship", contentExcerpt: "Repeatedly pushing dating-style messages", severity: "medium", reportCount: 4, autoFlagged: false, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18) },
    { subjectType: "message", subjectId: idFor("ravi"), subjectLabel: "Message from Ravi Nair", reporterName: "Omar Haddad", reason: "Hate speech", contentExcerpt: "Flagged automatically by the blocked keyword list", severity: "critical", reportCount: 2, autoFlagged: true, status: "open", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 60) },
    { subjectType: "profile", subjectId: idFor("aria"), subjectLabel: "Aria Patel", reporterName: "Ivy Nakamura", reason: "Fake photos", contentExcerpt: "Photos look like someone else", severity: "low", reportCount: 1, autoFlagged: false, status: "dismissed", resolutionNote: "Photos verified against the ID on file.", resolvedBy: "safety@trufrenz.app", resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 8), createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20) },
    { subjectType: "profile", subjectId: idFor("ravi"), subjectLabel: "Ravi Nair", reporterName: "Lena Okafor", reason: "Harassment", contentExcerpt: "Abusive language in a group chat", severity: "high", reportCount: 2, autoFlagged: false, status: "banned", resolutionNote: "Third confirmed harassment case.", resolvedBy: "safety@trufrenz.app", resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 40), createdAt: new Date(Date.now() - 1000 * 60 * 60 * 70) },
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
    { keyword: "wire me money", severity: "high", hits: 12, addedBy: "safety@trufrenz.app" },
    { keyword: "crypto investment", severity: "high", hits: 8, addedBy: "safety@trufrenz.app" },
    { keyword: "send nudes", severity: "high", hits: 21, addedBy: "safety@trufrenz.app" },
    { keyword: "whatsapp me", severity: "medium", hits: 34, addedBy: "safety@trufrenz.app" },
    { keyword: "pay for my ticket", severity: "medium", hits: 6, addedBy: "safety@trufrenz.app" },
    { keyword: "my sugar", severity: "low", hits: 3, addedBy: "safety@trufrenz.app" },
  ]);

  await db.insert(broadcasts).values([
    { title: "Meet in public places", body: "A gentle reminder: choose a public venue for first meetups and tell a friend where you are going.", segment: "all", recipientCount: memberRows.length, sentBy: "safety@trufrenz.app", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    { title: "Get verified this week", body: "Verified members get 2x more accepted friend requests. Verification takes about a minute.", segment: "unverified", recipientCount: 6, sentBy: "safety@trufrenz.app", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30) },
  ]);

  await db.insert(subscriptionEvents).values([
    { memberId: idFor("maya"), memberName: "Maya Chen", kind: "grant", tier: "premium", amountCents: 0, reason: "Support goodwill credit after the duplicate charge.", actorEmail: "billing@trufrenz.app", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12) },
    { memberId: idFor("devon"), memberName: "Devon Blake", kind: "revoke", tier: "free", amountCents: 0, reason: "Account suspended pending review.", actorEmail: "safety@trufrenz.app", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 40) },
    { memberId: idFor("ivy"), memberName: "Ivy Nakamura", kind: "refund", tier: "free", amountCents: 1299, reason: "Cancelled within the cooling-off window.", actorEmail: "billing@trufrenz.app", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 60) },
  ]);


  await logAdminAction({
    actorEmail: "system@trufrenz.app",
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
