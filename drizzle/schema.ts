import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* -------------------------------------------------------------------------- */
/*  Trufrenz internal admin dashboard                                         */
/*                                                                            */
/*  These tables back the team-facing dashboard. It has its own auth flow      */
/*  (email + password + TOTP) that is deliberately separate from the           */
/*  consumer app's phone OTP sign-in.                                         */
/* -------------------------------------------------------------------------- */

/**
 * Admin accounts. Access requires email, password, and a TOTP second factor.
 * Roles decide which modules and destructive actions an account can use.
 */
export const adminAccounts = mysqlTable("admin_accounts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  /** scrypt digest, stored as `scrypt$<saltHex>$<hashHex>` — never the raw password. */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  /** Base32 TOTP shared secret for the authenticator app. */
  totpSecret: varchar("totpSecret", { length: 64 }).notNull(),
  role: mysqlEnum("adminRole", ["owner", "admin", "moderator"]).default("moderator").notNull(),
  disabled: boolean("disabled").default(false).notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminAccount = typeof adminAccounts.$inferSelect;
export type InsertAdminAccount = typeof adminAccounts.$inferInsert;

/** Short-lived dashboard sessions issued after a successful password + TOTP check. */
export const adminSessions = mysqlTable("admin_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** SHA-256 of the session token — the raw token only ever lives in the cookie. */
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  adminId: int("adminId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminSession = typeof adminSessions.$inferSelect;

/** Consumer members as the dashboard sees them. Mirrors the app's member records. */
export const members = mysqlTable("members", {
  id: int("id").autoincrement().primaryKey(),
  handle: varchar("handle", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  age: int("age"),
  dateOfBirth: varchar("dateOfBirth", { length: 10 }),
  homeArea: varchar("homeArea", { length: 120 }),
  /** Verification tier: phone only, or phone plus ID and selfie review. */
  verificationTier: mysqlEnum("verificationTier", ["none", "phone", "id_selfie"])
    .default("none")
    .notNull(),
  accountStatus: mysqlEnum("accountStatus", ["active", "warned", "suspended", "banned"])
    .default("active")
    .notNull(),
  subscriptionTier: mysqlEnum("subscriptionTier", ["free", "premium"]).default("free").notNull(),
  available: boolean("available").default(true).notNull(),
  reportCount: int("reportCount").default(0).notNull(),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type Member = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

/** Verification Queue — pending ID/selfie submissions awaiting human review. */
export const verificationSubmissions = mysqlTable("verification_submissions", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  memberName: varchar("memberName", { length: 120 }).notNull(),
  submittedName: varchar("submittedName", { length: 120 }).notNull(),
  submittedDob: varchar("submittedDob", { length: 10 }).notNull(),
  selfieRef: varchar("selfieRef", { length: 255 }),
  idDocumentRef: varchar("idDocumentRef", { length: 255 }),
  /** Automated risk score 0-100 from the provider, surfaced to reviewers. */
  riskScore: int("riskScore").default(0).notNull(),
  status: mysqlEnum("submissionStatus", ["pending", "approved", "rejected"])
    .default("pending")
    .notNull(),
  /** Required whenever a submission is rejected; sent back to the member. */
  rejectionReason: text("rejectionReason"),
  reviewedBy: varchar("reviewedBy", { length: 320 }),
  reviewedAt: timestamp("reviewedAt"),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
});

export type VerificationSubmission = typeof verificationSubmissions.$inferSelect;

/** Reports & Moderation — one row per report against a profile, message, or group. */
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  subjectType: mysqlEnum("subjectType", ["profile", "message", "group"]).notNull(),
  subjectId: int("subjectId").notNull(),
  subjectLabel: varchar("subjectLabel", { length: 160 }).notNull(),
  reporterName: varchar("reporterName", { length: 120 }).notNull(),
  reason: varchar("reason", { length: 160 }).notNull(),
  /** Quoted content shown to moderators so they can judge it in context. */
  contentExcerpt: text("contentExcerpt"),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("low").notNull(),
  /** Reports sharing the same subject are grouped; this is the group's total. */
  reportCount: int("reportCount").default(1).notNull(),
  autoFlagged: boolean("autoFlagged").default(false).notNull(),
  status: mysqlEnum("reportStatus", ["open", "warned", "suspended", "banned", "dismissed"])
    .default("open")
    .notNull(),
  resolvedBy: varchar("resolvedBy", { length: 320 }),
  resolutionNote: text("resolutionNote"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;

/** Append-only audit trail of every dashboard action. */
export const adminActions = mysqlTable("admin_actions", {
  id: int("id").autoincrement().primaryKey(),
  actorEmail: varchar("actorEmail", { length: 320 }).notNull(),
  actorRole: varchar("actorRole", { length: 32 }).notNull(),
  module: varchar("module", { length: 48 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  targetType: varchar("targetType", { length: 48 }).notNull(),
  targetId: varchar("targetId", { length: 64 }).notNull(),
  targetLabel: varchar("targetLabel", { length: 200 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminAction = typeof adminActions.$inferSelect;

/** Content & Safety Controls — feature flags for incident response. */
export const featureFlags = mysqlTable("feature_flags", {
  id: int("id").autoincrement().primaryKey(),
  flagKey: varchar("flagKey", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  updatedBy: varchar("updatedBy", { length: 320 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;

/** Blocked keyword list used to auto-flag chat and profile content. */
export const blockedKeywords = mysqlTable("blocked_keywords", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 120 }).notNull().unique(),
  severity: mysqlEnum("keywordSeverity", ["low", "medium", "high"]).default("medium").notNull(),
  hits: int("hits").default(0).notNull(),
  addedBy: varchar("addedBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BlockedKeyword = typeof blockedKeywords.$inferSelect;

/** Broadcast notification tool — announcements and safety reminders. */
export const broadcasts = mysqlTable("broadcasts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  /** Audience segment: everyone, verified only, free tier, or paid tier. */
  segment: mysqlEnum("segment", ["all", "verified", "unverified", "free", "premium"])
    .default("all")
    .notNull(),
  recipientCount: int("recipientCount").default(0).notNull(),
  sentBy: varchar("sentBy", { length: 320 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Broadcast = typeof broadcasts.$inferSelect;

/** Subscription Management — manual grants, revokes, and the refund log. */
export const subscriptionEvents = mysqlTable("subscription_events", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  memberName: varchar("memberName", { length: 120 }).notNull(),
  kind: mysqlEnum("eventKind", ["grant", "revoke", "refund"]).notNull(),
  tier: varchar("tier", { length: 32 }).notNull(),
  amountCents: int("amountCents").default(0).notNull(),
  reason: text("reason"),
  actorEmail: varchar("actorEmail", { length: 320 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;

/** One row per day of product health, used by the Analytics Dashboard. */
export const dailyMetrics = mysqlTable("daily_metrics", {
  id: int("id").autoincrement().primaryKey(),
  /** ISO date, e.g. 2026-09-26. */
  day: varchar("day", { length: 10 }).notNull().unique(),
  activeUsers: int("activeUsers").default(0).notNull(),
  newSignups: int("newSignups").default(0).notNull(),
  verifiedUsers: int("verifiedUsers").default(0).notNull(),
  unverifiedUsers: int("unverifiedUsers").default(0).notNull(),
  freeUsers: int("freeUsers").default(0).notNull(),
  paidUsers: int("paidUsers").default(0).notNull(),
  activeGroups: int("activeGroups").default(0).notNull(),
  callsMade: int("callsMade").default(0).notNull(),
  matchesMade: int("matchesMade").default(0).notNull(),
});

export type DailyMetric = typeof dailyMetrics.$inferSelect;
