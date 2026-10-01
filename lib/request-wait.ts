/**
 * How long an outgoing friend request has been waiting.
 *
 * "Requests you sent" used to be a list of names and nothing else, so a request
 * sent ten minutes ago and one sent a fortnight ago read identically, and the
 * member had no way to tell which — if any — needed chasing. The panel answers
 * that with a distance rather than a date, because "sent 6 days ago" is the
 * question actually being asked; the exact timestamp is not useful and a raw
 * date makes the member do the subtraction.
 *
 * Pure, so the wording is pinned by tests rather than drifting with locale.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type WaitDescription = {
  /** The line under the person's name. */
  text: string;
  /**
   * How long the wait has been, banded. Letting a member see that a request has
   * gone unanswered for a fortnight is information, not nagging — but colouring
   * or alarming it would turn a quiet invitation into pressure, which is the
   * opposite of what this app is for. The band is for callers that need to sort
   * or filter, not for anything louder.
   */
  band: "fresh" | "settling" | "quiet" | "long-unanswered" | "unknown";
};

/**
 * Describe a wait.
 *
 * `sentAt` is a millisecond timestamp. A missing or nonsensical one is reported
 * as unknown rather than guessed at, because inventing "sent just now" for a
 * request the app has no record of would be a small lie about the member's own
 * account.
 */
export function describeRequestWait(sentAt: number | undefined | null, now: number = Date.now()): WaitDescription {
  if (typeof sentAt !== "number" || !Number.isFinite(sentAt) || sentAt <= 0) {
    return { text: "Request sent · waiting", band: "unknown" };
  }
  const elapsed = Math.max(0, now - sentAt);

  /*
   * A clock that has moved backwards — a device timezone change, a manual
   * correction — must not produce "sent in 3 hours". Anything in the future is
   * treated as just sent, which is the only reading that cannot be wrong.
   */
  if (elapsed < MINUTE) return { text: "Request sent just now · waiting", band: "fresh" };
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return { text: `Request sent ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago · waiting`, band: "fresh" };
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return { text: `Request sent ${hours} ${hours === 1 ? "hour" : "hours"} ago · waiting`, band: "settling" };
  }
  const days = Math.floor(elapsed / DAY);
  if (days < 7) return { text: `Request sent ${days} ${days === 1 ? "day" : "days"} ago · waiting`, band: "quiet" };
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return { text: `Request sent ${weeks} ${weeks === 1 ? "week" : "weeks"} ago · still waiting`, band: "long-unanswered" };
  }
  const months = Math.floor(days / 30);
  return { text: `Request sent ${months} ${months === 1 ? "month" : "months"} ago · still waiting`, band: "long-unanswered" };
}

/**
 * The heading count for the panel, which reads better as words than a badge for
 * the numbers a member will actually see.
 */
export function requestCountLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "No requests waiting";
  if (count === 1) return "1 request waiting";
  return `${count} requests waiting`;
}