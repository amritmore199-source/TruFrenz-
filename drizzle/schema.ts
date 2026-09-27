import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
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
  /**
   * Phone number in E.164 form. This is the real sign-in identity for the
   * consumer app: a member row without one is dashboard-only seed data.
   */
  phoneE164: varchar("phoneE164", { length: 20 }).unique(),
  /** Contact email captured during onboarding for account recovery. */
  email: varchar("email", { length: 320 }),
  /**
   * When the member proved they control `email`.
   *
   * Without this the address was only a contact hint, which meant a member who
   * lost their phone number had no way back into their account at all. A
   * verified address is a real recovery identity.
   */
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  /** Set when the provider reports the address is undeliverable. */
  emailBouncedAt: timestamp("emailBouncedAt"),
  /** Whether this member wants renewal and safety notices by email too. */
  emailNotices: boolean("emailNotices").default(true).notNull(),
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
  /** Why the account is warned, suspended, or banned. Set by the moderation queue. */
  statusReason: text("statusReason"),
  statusChangedBy: varchar("statusChangedBy", { length: 320 }),
  statusChangedAt: timestamp("statusChangedAt"),
  /** One-time password-reset token hash issued from the dashboard. */
  resetTokenHash: varchar("resetTokenHash", { length: 64 }),
  resetRequestedAt: timestamp("resetRequestedAt"),
  subscriptionTier: mysqlEnum("subscriptionTier", ["free", "premium"]).default("free").notNull(),
  available: boolean("available").default(true).notNull(),
  reportCount: int("reportCount").default(0).notNull(),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type Member = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

/**
 * Consumer app sessions. Issued by the account service after phone + OTP
 * sign-in, and revoked the moment an account is suspended or banned.
 */
export const memberSessions = mysqlTable("member_sessions", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  /** SHA-256 of the session token — the raw token only ever lives on the device. */
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemberSession = typeof memberSessions.$inferSelect;

/**
 * Member-facing notices: warnings, suspensions, verification outcomes, and
 * broadcast announcements. This is how a moderation decision actually reaches
 * the person it applies to.
 */
export const memberNotices = mysqlTable("member_notices", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  kind: mysqlEnum("noticeKind", [
    "warning",
    "suspension",
    "ban",
    "reinstatement",
    "verification_approved",
    "verification_rejected",
    "announcement",
    "refund",
    "subscription_renewal",
    "subscription_expired",
  ]).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  actorEmail: varchar("actorEmail", { length: 320 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemberNotice = typeof memberNotices.$inferSelect;

/**
 * The member's circle, one row per person they have a relationship with.
 *
 * Why this exists: the connection graph was device-local, so accepting a
 * request on one device left the same request waiting on the next one. A circle
 * that lives in one browser's storage is not a circle, it is a cache.
 *
 * One row per (member, peer) pair rather than a friendship row with two columns,
 * because three of the four states are one-directional: a request this member
 * sent is not the same fact as a request they received, and a decline is a
 * decision the member made about someone else's request. Storing the direction
 * per row keeps each of those facts where it belongs.
 */
export const memberConnections = mysqlTable(
  "member_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    /** The member whose circle this row belongs to. */
    memberId: int("memberId").notNull(),
    /**
     * The person on the other side. These are directory ids rather than member
     * ids, because the people a member can connect with are the seeded
     * directory entries the app already renders.
     */
    peerId: varchar("peerId", { length: 64 }).notNull(),
    state: mysqlEnum("connectionState", ["accepted", "requested", "incoming", "declined"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("member_connections_pair_idx").on(table.memberId, table.peerId)],
);

export type MemberConnection = typeof memberConnections.$inferSelect;

/*
 * Append-only product event stream. The analytics dashboard derives its daily
 * metrics from these rows, so the trends reflect real usage rather than a
 * seeded series.
 */
export const analyticsEvents = mysqlTable("analytics_events", {
  id: int("id").autoincrement().primaryKey(),
  /** ISO date of occurrence, denormalised so daily rollups are a single scan. */
  day: varchar("day", { length: 10 }).notNull(),
  eventType: varchar("eventType", { length: 48 }).notNull(),
  /** Null for events that happen before an account exists (e.g. a signup). */
  memberId: int("memberId"),
  /** Group or thread the event relates to, used for the active-groups metric. */
  groupId: varchar("groupId", { length: 64 }),
  /** Free-form JSON for event-specific detail (venue, duration, reason). */
  metadata: text("metadata"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;

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
/**
 * Verified store purchases.
 *
 * One row per receipt the store has confirmed. This is the only thing that
 * grants Premium: the member's tier is derived from the unexpired rows here, so
 * a client that simply claims to be premium changes nothing.
 */
export const subscriptionReceipts = mysqlTable("subscription_receipts", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  /** Which store took the payment. */
  /**
   * Where the entitlement came from.
   *
   * `comp` is a time-boxed grant an administrator made for a support case. It
   * travels through the same receipt table deliberately: entitlement is derived
   * from unexpired receipts, so a comp gets the same expiry, reminder, and
   * downgrade behaviour as a paid plan — and cannot be revalidated against a
   * store, which never sold it.
   */
  channel: mysqlEnum("channel", ["play", "app-store", "comp"]).notNull(),
  /** The store product id, e.g. trufrenz.premium.annual. */
  productId: varchar("productId", { length: 120 }).notNull(),
  /** The plan the product maps to. */
  planId: varchar("planId", { length: 32 }).notNull(),
  /** The store's own transaction id. Unique, so a receipt cannot be reused. */
  transactionId: varchar("transactionId", { length: 200 }).notNull().unique(),
  /** SHA-256 of the purchase token. The token itself is never stored. */
  purchaseTokenHash: varchar("purchaseTokenHash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "active", "expired", "revoked"])
    .default("active")
    .notNull(),
  /** When the store says the paid period ends. */
  expiresAt: timestamp("expiresAt").notNull(),
  autoRenewing: boolean("autoRenewing").default(true).notNull(),
  /** Set when the store reports a cancellation that runs to period end. */
  cancelledAt: timestamp("cancelledAt"),
  /** Last time the store confirmed this receipt. */
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  /** "store" for a real verification, "sandbox" while no credentials exist. */
  verifiedBy: varchar("verifiedBy", { length: 16 }).default("sandbox").notNull(),
  /** Who granted this, when it is a comp. Null for anything a store sold. */
  grantedBy: varchar("grantedBy", { length: 320 }),
  /** Why the comp was granted. Required for a comp, shown in the dashboard. */
  grantedReason: varchar("grantedReason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SubscriptionReceipt = typeof subscriptionReceipts.$inferSelect;
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
/**
 * One row per renewal reminder already delivered.
 *
 * The revalidation job runs every six hours, so a naive "expires in 3 days"
 * scan would send the same notice eight times before the period ended. The
 * unique key is the receipt plus the reminder window, which makes delivery
 * idempotent: the insert is attempted first, and only the caller that wins the
 * insert sends the notice. A later renewal writes a new receipt with a new
 * expiry, so the next period's reminders are not suppressed by this one's.
 */
export const subscriptionReminders = mysqlTable(
  "subscription_reminders",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("memberId").notNull(),
    receiptId: int("receiptId").notNull(),
    /** Which window this reminder filled: "7d", "3d", "1d" or "expired". */
    reminderKind: varchar("reminderKind", { length: 16 }).notNull(),
    /** The receipt expiry the reminder was computed against. */
    periodEndsAt: timestamp("periodEndsAt").notNull(),
    /** When the member was actually notified. */
    deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
    /** The notice row this reminder produced, for support traceability. */
    noticeId: int("noticeId"),
  },
  (table) => [
    uniqueIndex("subscription_reminders_receipt_kind").on(table.receiptId, table.reminderKind),
  ],
);
export type SubscriptionReminder = typeof subscriptionReminders.$inferSelect;

/**
 * A pending one-time-code challenge.
 *
 * These used to live in an in-memory Map, which was wrong in three ways: every
 * server restart dropped every in-flight sign-in, a second instance could not
 * see a challenge the first one issued, and a sign-up that spans several
 * screens had no way to survive the wait. Storing them here fixes all three.
 *
 * The code itself is never stored: only a keyed hash of it, so a database leak
 * does not hand an attacker working codes.
 */
export const signinChallenges = mysqlTable(
  "signin_challenges",
  {
    id: int("id").autoincrement().primaryKey(),
    /** The opaque value handed to the client in an httpOnly cookie. */
    challengeId: varchar("challengeId", { length: 64 }).notNull(),
    /** Which channel the code travelled over. */
    channel: mysqlEnum("channel", ["phone", "email"]).notNull(),
    /** The E.164 number or the normalised address the code was sent to. */
    destination: varchar("destination", { length: 320 }).notNull(),
    /** SHA-256 of the code, so the plaintext never touches the database. */
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    /** Why the member is signing in, which decides what the code unlocks. */
    purpose: mysqlEnum("purpose", ["signup", "login"]).notNull(),
    /** Failed attempts so far, counted against MAX_OTP_ATTEMPTS. */
    attempts: int("attempts").default(0).notNull(),
    /**
     * Set once the code has been accepted.
     *
     * This is what lets a sign-up span several screens: a member proves the
     * code, then fills in a profile, then joins. The challenge stays valid but
     * can only be spent once, on the final account-creating call.
     */
    verifiedAt: timestamp("verifiedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
    /** When the account-creating call finally consumed it. */
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("signin_challenges_challenge_id").on(table.challengeId),
    uniqueIndex("signin_challenges_channel_destination").on(table.channel, table.destination),
  ],
);
export type SigninChallenge = typeof signinChallenges.$inferSelect;

/**
 * Every code we have sent, so sending can be rate limited.
 *
 * The challenge table cannot answer "how many codes went out to this number in
 * the last hour", because issuing a new code replaces the previous row. That
 * made the send side unlimited: a script could point the endpoint at one number
 * and trigger thousands of paid messages, which is the SMS-pumping attack, or
 * aim it at a stranger and get the sender ID blocked for harassment.
 *
 * Rows are a log, not state: nothing reads them except the counters below, and
 * they are pruned once they fall outside the longest window.
 */
export const otpSendAttempts = mysqlTable(
  "otp_send_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    /**
     * What happened. Sends and failed verifications share this table because
     * they share a shape and are always pruned together; one column keeps them
     * apart without a second table and a second cleanup job.
     */
    kind: mysqlEnum("kind", ["send", "failure"]).default("send").notNull(),
    /** Which channel the code travelled over. */
    channel: mysqlEnum("channel", ["phone", "email"]).notNull(),
    /** The E.164 number or normalised address the code was sent to. */
    destination: varchar("destination", { length: 320 }).notNull(),
    /**
     * A coarse fingerprint of the caller, so one device cannot work through
     * many destinations. Deliberately a hash of address and user agent rather
     * than the raw values: the point is counting, not identifying anyone.
     */
    callerKey: varchar("callerKey", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("otp_send_attempts_destination_time").on(table.destination, table.createdAt),
    index("otp_send_attempts_caller_time").on(table.callerKey, table.createdAt),
  ],
);
export type OtpSendAttempt = typeof otpSendAttempts.$inferSelect;
