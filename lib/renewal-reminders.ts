/**
 * Renewal reminders.
 *
 * A subscription that quietly runs out is the worst possible experience: the
 * member loses calling, the live map, and unlimited proposals without ever
 * being told it was about to happen. This module decides *when* a member should
 * be told and *what* they should read — and nothing else. It is pure on
 * purpose, so every boundary (exactly seven days out, one millisecond past
 * midnight, already lapsed) is testable without a database or a store.
 *
 * The scanning side lives in `server/subscription-reminders.ts`; it asks this
 * module which window a receipt currently falls into and then records that it
 * sent the matching notice exactly once.
 */
/** Which reminder a receipt is currently due for. */
export type ReminderKind = "7d" | "3d" | "1d" | "expired";
/**
 * Every kind, in the order a member experiences them. `expired` is last: it is
 * the single notice sent once the paid period has actually ended.
 */
export const REMINDER_KINDS: readonly ReminderKind[] = ["7d", "3d", "1d", "expired"];
/**
 * The reminder windows, checked closest-first.
 *
 * Order matters. A receipt is always evaluated against the *nearest* window it
 * has passed, so a receipt with two days left reports `3d` and not `7d`. That
 * keeps a missed job tick from dumping three back-to-back notices: a scan that
 * first runs with two days left sends one `3d` notice, and the `7d` window is
 * simply never used because it was already behind us.
 */
export const REMINDER_WINDOWS: readonly { kind: ReminderKind; days: number }[] = [
  { kind: "1d", days: 1 },
  { kind: "3d", days: 3 },
  { kind: "7d", days: 7 },
];
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How far ahead a receipt must be for it to be worth scanning at all.
 *
 * A scan reads every active receipt inside this horizon; anything further out
 * has no window yet and is skipped without a query per receipt.
 */
export const REMINDER_HORIZON_DAYS = 7;
export const REMINDER_HORIZON_MS = REMINDER_HORIZON_DAYS * DAY_MS;
/**
 * Which reminder, if any, this receipt is due for right now.
 *
 * Returns `null` when the period is further out than seven days, when the
 * expiry is unreadable, and when the receipt already lapsed — the last case
 * belongs to `expired`, which is handled here too so the member hears about a
 * lapse exactly once instead of being dropped silently to the free tier.
 *
 * @param expiresAt When the paid period ends, from the store's own response.
 * @param now The moment to evaluate against. Injected so tests are exact.
 */
export function reminderKindFor(expiresAt: Date, now: Date): ReminderKind | null {
  const remaining = expiresAt.getTime() - now.getTime();
  if (!Number.isFinite(remaining)) return null;
  // Lapsed, or lapsing this instant: the closing notice.
  if (remaining <= 0) return "expired";
  for (const window of REMINDER_WINDOWS) {
    if (remaining <= window.days * DAY_MS) return window.kind;
  }
  return null;
}
/**
 * A human label for a window, used in notice titles.
 *
 * `1d` reads as "tomorrow" rather than "in 1 day", because that is how a person
 * would say it and it makes the title scannable.
 */
export function windowLabel(kind: ReminderKind): string {
  switch (kind) {
    case "7d":
      return "in 7 days";
    case "3d":
      return "in 3 days";
    case "1d":
      return "tomorrow";
    case "expired":
      return "today";
  }
}
/**
 * The period end as the member should read it, in India Standard Time.
 *
 * The launch market is India and the plans are priced in rupees, so date copy
 * is anchored to IST rather than to whatever timezone the server happens to run
 * in. Two members who bought the same plan therefore read the same date.
 */
export function renewalDate(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(expiresAt);
}
export type ReminderCopy = { title: string; body: string };
/**
 * The words the member reads.
 *
 * The two renewal cases are deliberately different. An auto-renewing plan is a
 * courtesy heads-up — nothing for them to do. A cancelled one is a warning:
 * their access really is about to stop, and the body tells them how to undo it.
 */
export function renewalReminderCopy(input: {
  kind: ReminderKind;
  /** e.g. "Quarterly". */
  planLabel: string;
  /** When the current paid period ends. */
  renewsOn: Date;
  /** False when the member cancelled and the period will just run out. */
  autoRenewing: boolean;
  /** What the store charges for the next period, in INR. */
  chargeInr: number;
  /**
   * True when this is a time-boxed grant rather than a purchase.
   *
   * A comp must never be described in store language. There is no auto-renew to
   * turn back on, no charge, and nothing in a store account to manage — telling a
   * member to "turn auto-renew back on" when they never bought anything, and
   * cannot, would send them looking for a purchase that does not exist.
   */
  isComp?: boolean;
}): ReminderCopy {
  const date = renewalDate(input.renewsOn);
  const plan = `${input.planLabel} plan`;

  if (input.isComp) {
    if (input.kind === "expired") {
      return {
        title: "Your complimentary Premium has ended",
        body:
          `The Trufrenz Premium we granted your account ended on ${date}. You are back on the free ` +
          `plan — your chats, friends, groups, and meetups are all still here. If you would like ` +
          `calling, the live map, and unlimited proposals back, you can subscribe from Manage ` +
          `Subscription.`,
      };
    }
    return {
      title: `Complimentary Premium ends ${windowLabel(input.kind)}`,
      body:
        `The Trufrenz Premium granted to your account ends on ${date}. This was a gift from our ` +
        `support team, so nothing is charged and there is nothing to cancel. After ${date} you ` +
        `return to the free plan; subscribing any time after that brings everything back.`,
    };
  }

  if (input.kind === "expired") {
    return {
      title: "Your Premium has ended",
      body:
        `Your ${plan} ended on ${date}. You are back on the free plan — your chats, friends, ` +
        `groups, and meetups are all still here. Subscribe again any time to bring back calling, ` +
        `the live map, and unlimited proposals.`,
    };
  }

  const label = windowLabel(input.kind);

  if (!input.autoRenewing) {
    return {
      title: `Premium ends ${label}`,
      body:
        `Your ${plan} runs out on ${date} and it will not renew, so Premium stops then. ` +
        `Nothing is deleted — you keep every chat and friend. To keep calling, the live map, and ` +
        `unlimited proposals, turn auto-renew back on in your store account, or subscribe again ` +
        `from Manage Subscription.`,
    };
  }

  return {
    title: `Premium renews ${label}`,
    body:
      `Your ${plan} renews on ${date} for ₹${input.chargeInr}. There is nothing you need to do — ` +
      `Premium stays on. You can change or cancel any time from Manage Subscription.`,
  };
}