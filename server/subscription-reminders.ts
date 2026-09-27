/**
 * The renewal reminder scan.
 *
 * Entitlements lapse silently unless something tells the member it is about to
 * happen. This runs alongside the revalidation pass, finds receipts whose paid
 * period is close to ending (or has just ended), and sends one notice per
 * member per window.
 *
 * Being run every six hours, the scan is written to be safe to repeat: the
 * `subscription_reminders` table has a unique key on (receipt, window), and the
 * row is inserted *before* the notice is sent. The caller that wins the insert
 * owns the notice; every later pass loses the insert and moves on. That makes
 * delivery exactly-once without a lock, and it survives a restart mid-pass —
 * the worst case is a reminder that was recorded but never sent, which the
 * dashboard surfaces rather than the member hearing the same thing eight times.
 */
import { and, eq, gt, lte } from "drizzle-orm";
import { getDb } from "./db";
import { memberNotices, members, subscriptionReceipts, subscriptionReminders } from "../drizzle/schema";
import { planIdForProductId } from "../lib/subscription-store";
import { planById } from "../lib/subscription";
import { reminderKindFor, renewalReminderCopy, type ReminderKind } from "../lib/renewal-reminders";
import { nextChargeInr } from "./storeReadiness";
/** A receipt the scan decided is due for a reminder. */
export type ReminderCandidate = {
  receiptId: number;
  memberId: number;
  kind: ReminderKind;
  expiresAt: Date;
  autoRenewing: boolean;
  planId: string;
};
/**
 * Decide what to send, without sending anything.
 *
 * Split out from delivery so the decision — which is where the off-by-one bugs
 * live — can be tested against exact timestamps.
 */
export function chooseReminder(input: {
  receiptId: number;
  memberId: number;
  expiresAt: Date;
  autoRenewing: boolean;
  planId: string;
  now: Date;
}): ReminderCandidate | null {
  const kind = reminderKindFor(input.expiresAt, input.now);
  if (!kind) return null;
  return {
    receiptId: input.receiptId,
    memberId: input.memberId,
    kind,
    expiresAt: input.expiresAt,
    autoRenewing: input.autoRenewing,
    planId: input.planId,
  };
}
export type ReminderScanResult = {
  /** Active receipts inside the reminder horizon that were examined. */
  scanned: number;
  /** Reminders actually delivered this pass. */
  sent: number;
  /** Windows already filled by an earlier pass. */
  skipped: number;
};
/**
 * One pass.
 *
 * The query is deliberately narrow: only active receipts whose expiry is in the
 * future *or* recently past, within a window wide enough to include the 7-day
 * horizon and any expiry the six-hour schedule might have stepped over. A
 * receipt far in the future has no window yet, so it never reaches the database.
 */
export async function runReminderScan(limit = 100, now: Date = new Date()): Promise<ReminderScanResult> {
  const db = await getDb();
  if (!db) return { scanned: 0, sent: 0, skipped: 0 };

  // Two bounds: everything expiring within the next eight days, plus anything
  // that lapsed in the last eight days (so a missed run still produces the
  // closing notice rather than losing it forever).
  const eightDays = 8 * 24 * 60 * 60 * 1000;
  const upper = new Date(now.getTime() + eightDays);
  const lower = new Date(now.getTime() - eightDays);

  const rows = await db
    .select({
      id: subscriptionReceipts.id,
      memberId: subscriptionReceipts.memberId,
      planId: subscriptionReceipts.planId,
      productId: subscriptionReceipts.productId,
      expiresAt: subscriptionReceipts.expiresAt,
      autoRenewing: subscriptionReceipts.autoRenewing,
    })
    .from(subscriptionReceipts)
    .where(
      and(
        eq(subscriptionReceipts.status, "active"),
        gt(subscriptionReceipts.expiresAt, lower),
        lte(subscriptionReceipts.expiresAt, upper),
      ),
    )
    .orderBy(subscriptionReceipts.expiresAt)
    .limit(limit);

  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const expiresAt = new Date(row.expiresAt);
    const candidate = chooseReminder({
      receiptId: row.id,
      memberId: row.memberId,
      expiresAt,
      autoRenewing: Boolean(row.autoRenewing),
      planId: row.planId ?? planIdForProductId(row.productId) ?? "quarterly",
      now,
    });
    if (!candidate) {
      skipped += 1;
      continue;
    }

    // Claim the window first. A duplicate-key error here means another pass
    // already told the member; that is a normal outcome, not a failure.
    let claimed = false;
    try {
      await db.insert(subscriptionReminders).values({
        memberId: candidate.memberId,
        receiptId: candidate.receiptId,
        reminderKind: candidate.kind,
        periodEndsAt: candidate.expiresAt,
      });
      claimed = true;
    } catch {
      claimed = false;
    }
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const plan = planById(candidate.planId);
    const copy = renewalReminderCopy({
      kind: candidate.kind,
      planLabel: plan.label,
      renewsOn: candidate.expiresAt,
      autoRenewing: candidate.autoRenewing,
      chargeInr: nextChargeInr(plan.id),
    });

    const noticeId = await insertNotice({
      memberId: candidate.memberId,
      kind: candidate.kind === "expired" ? "subscription_expired" : "subscription_renewal",
      title: copy.title,
      body: copy.body,
    });
    sent += 1;

    if (noticeId > 0) {
      await db
        .update(subscriptionReminders)
        .set({ noticeId })
        .where(
          and(
            eq(subscriptionReminders.receiptId, candidate.receiptId),
            eq(subscriptionReminders.reminderKind, candidate.kind),
          ),
        );
    }
  }

  return { scanned: rows.length, sent, skipped };
}
/**
 * Write the notice directly.
 *
 * `sendMemberNotice` in the account service would also work, but reaching for it
 * would pull `accountService` into this module's import graph — including its
 * session and moderation logic — for a single insert. The shape written here is
 * identical, so the app's notice list renders these exactly like every other
 * notice.
 */
async function insertNotice(input: {
  memberId: number;
  kind: "subscription_renewal" | "subscription_expired";
  title: string;
  body: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(memberNotices).values({
    memberId: input.memberId,
    kind: input.kind,
    title: input.title.slice(0, 160),
    body: input.body,
    actorEmail: "billing",
  });
  // See `insertIdOf`: the id sits at `[0].insertId` with the mysql2 driver.
  return insertIdOf(result);
}
/** A compact summary for the admin Subscriptions module. */
export async function reminderHistory(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: subscriptionReminders.id,
      memberId: subscriptionReminders.memberId,
      memberName: members.name,
      reminderKind: subscriptionReminders.reminderKind,
      periodEndsAt: subscriptionReminders.periodEndsAt,
      deliveredAt: subscriptionReminders.deliveredAt,
      noticeId: subscriptionReminders.noticeId,
    })
    .from(subscriptionReminders)
    .leftJoin(members, eq(members.id, subscriptionReminders.memberId))
    .orderBy(subscriptionReminders.deliveredAt)
    .limit(limit);
  return rows;
}
import { insertIdOf } from "./db";
