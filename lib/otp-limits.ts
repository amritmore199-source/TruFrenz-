/**
 * Code-sending limits.
 *
 * The "send my code" button had no brakes. Nothing counted how many codes went
 * out, so one script could trigger thousands of paid messages. Two things
 * happen when that is possible, and neither is theoretical:
 *
 *   1. **It costs money.** Every SMS is a paid message. Attackers point the
 *      endpoint at numbers they control and collect a share of the carrier
 *      fees. This is SMS pumping, and the bill lands on the app owner.
 *   2. **It gets the sender blocked.** Point the endpoint at a stranger's
 *      number and the app becomes the harasser. The carrier blocks the sender
 *      ID and the whole channel goes dark.
 *
 * The rules live here, pure and separate from storage, so the limits are
 * testable without a database and the route cannot quietly drift from the tests.
 */

/** Codes allowed per destination in the short window. */
export const DESTINATION_SHORT_LIMIT = 3;
/** Length of that short window. */
export const DESTINATION_SHORT_WINDOW_MS = 60 * 60 * 1000;
/** Codes allowed per destination in the long window. */
export const DESTINATION_LONG_LIMIT = 6;
/** Length of that long window. */
export const DESTINATION_LONG_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Codes allowed per caller (roughly, per device) in the short window.
 *
 * Higher than the per-destination cap on purpose. A household or a shared
 * office can legitimately sign in from one network, and a limit that tight
 * would lock out the second person to try.
 */
export const CALLER_SHORT_LIMIT = 10;
export const CALLER_SHORT_WINDOW_MS = 60 * 60 * 1000;
/** A day's worth from one device, which is far beyond honest use. */
export const CALLER_LONG_LIMIT = 30;
export const CALLER_LONG_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The gap between two sends to the same destination.
 *
 * Without this, the per-hour cap is spent in two seconds by an impatient tap
 * and the member then waits an hour for their next code. A short cooldown
 * spreads the same allowance over the hour and matches what members expect.
 */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * How long a "wrong code" lock lasts.
 *
 * Guessing is already capped at five attempts per challenge, so this is a
 * second layer aimed at someone cycling new codes to get fresh guesses.
 */
export const VERIFY_LOCK_MS = 15 * 60 * 1000;
/** Wrong codes from one caller before the lock applies. */
export const CALLER_FAILED_LIMIT = 10;
export const CALLER_FAILED_WINDOW_MS = 15 * 60 * 1000;

/** A send we have already recorded. */
export type SendRecord = {
  destination: string;
  callerKey: string;
  createdAt: number;
};

/** A failed verification we have already recorded. */
export type FailureRecord = {
  callerKey: string;
  createdAt: number;
};

/** Counts derived from the log, so the rules read as a single decision. */
export type SendCounts = {
  destinationInShortWindow: number;
  destinationInLongWindow: number;
  callerInShortWindow: number;
  callerInLongWindow: number;
  /** Milliseconds since the most recent send to this destination, if any. */
  msSinceLastDestinationSend: number | null;
};

export type SendDecision =
  | { allowed: true }
  | {
      allowed: false;
      /** Which rule refused, so the message can be specific. */
      rule: "cooldown" | "destination-short" | "destination-long" | "caller-short" | "caller-long";
      /** Seconds the member should wait, for a countdown in the UI. */
      retryAfterSeconds: number;
      /** A message written for a member, not for a log. */
      message: string;
    };

/** Count what happened inside one window. */
function countWithin(records: number[], now: number, windowMs: number): number {
  const floor = now - windowMs;
  return records.filter((at) => at > floor).length;
}

/**
 * Reduce a log of sends to the five numbers the rules need.
 *
 * Kept separate from the decision so the query is one pass and the rules stay
 * readable.
 */
export function summariseSends(
  sends: SendRecord[],
  destination: string,
  callerKey: string,
  now: number,
): SendCounts {
  const mine = sends.filter((s) => s.destination === destination).map((s) => s.createdAt);
  const fromCaller = sends.filter((s) => s.callerKey === callerKey).map((s) => s.createdAt);
  const mostRecent = mine.length ? Math.max(...mine) : null;

  return {
    destinationInShortWindow: countWithin(mine, now, DESTINATION_SHORT_WINDOW_MS),
    destinationInLongWindow: countWithin(mine, now, DESTINATION_LONG_WINDOW_MS),
    callerInShortWindow: countWithin(fromCaller, now, CALLER_SHORT_WINDOW_MS),
    callerInLongWindow: countWithin(fromCaller, now, CALLER_LONG_WINDOW_MS),
    msSinceLastDestinationSend: mostRecent === null ? null : now - mostRecent,
  };
}

/** Round a wait up to whole seconds, so "wait 0 seconds" is never shown. */
function retryAfter(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** How long to wait, in words a member would use. */
export function describeWait(seconds: number): string {
  /**
   * Floored at one second here as well as in `retryAfter`.
   *
   * "Wait 0 seconds" reads as a broken app rather than a limit, and this
   * function is exported, so the guard belongs where the sentence is built
   * rather than only at the one call site that happens to round up first.
   */
  const safe = Math.max(1, Math.ceil(seconds));
  if (safe < 60) return `${safe} second${safe === 1 ? "" : "s"}`;
  const minutes = Math.ceil(safe / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Whether another code may be sent.
 *
 * Order matters. The cooldown is checked first because it is the rule a member
 * actually meets — "you just asked, give it a minute" is a different situation
 * from "you have used up your codes for today", and the messages differ.
 */
export function decideSend(counts: SendCounts): SendDecision {
  const since = counts.msSinceLastDestinationSend;
  if (since !== null && since < RESEND_COOLDOWN_MS) {
    const wait = retryAfter(RESEND_COOLDOWN_MS - since);
    return {
      allowed: false,
      rule: "cooldown",
      retryAfterSeconds: wait,
      message: `We just sent a code. Please wait ${describeWait(wait)} before asking for another.`,
    };
  }

  if (counts.destinationInShortWindow >= DESTINATION_SHORT_LIMIT) {
    return {
      allowed: false,
      rule: "destination-short",
      retryAfterSeconds: retryAfter(DESTINATION_SHORT_WINDOW_MS),
      message:
        "That number has asked for several codes in the last hour. Please wait a while, or use email instead.",
    };
  }

  if (counts.destinationInLongWindow >= DESTINATION_LONG_LIMIT) {
    return {
      allowed: false,
      rule: "destination-long",
      retryAfterSeconds: retryAfter(DESTINATION_LONG_WINDOW_MS),
      message:
        "That number has reached today's limit for codes. Please try again tomorrow, or use email instead.",
    };
  }

  if (counts.callerInShortWindow >= CALLER_SHORT_LIMIT) {
    return {
      allowed: false,
      rule: "caller-short",
      retryAfterSeconds: retryAfter(CALLER_SHORT_WINDOW_MS),
      message: "Too many codes have been requested from this device. Please try again later.",
    };
  }

  if (counts.callerInLongWindow >= CALLER_LONG_LIMIT) {
    return {
      allowed: false,
      rule: "caller-long",
      retryAfterSeconds: retryAfter(CALLER_LONG_WINDOW_MS),
      message: "This device has reached its limit for the day. Please try again tomorrow.",
    };
  }

  return { allowed: true };
}

/**
 * Whether this caller is locked out after too many wrong codes.
 *
 * Separate from `decideSend` because it answers a different question at a
 * different moment: sending is limited at the start of the flow, this is
 * checked when a code is submitted.
 */
export function decideVerify(failures: FailureRecord[], callerKey: string, now: number): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const floor = now - CALLER_FAILED_WINDOW_MS;
  const recent = failures.filter((f) => f.callerKey === callerKey && f.createdAt > floor);
  if (recent.length < CALLER_FAILED_LIMIT) return { allowed: true, retryAfterSeconds: 0 };

  const oldest = Math.min(...recent.map((f) => f.createdAt));
  const unlockAt = oldest + CALLER_FAILED_WINDOW_MS;
  return { allowed: false, retryAfterSeconds: retryAfter(unlockAt - now) };
}
