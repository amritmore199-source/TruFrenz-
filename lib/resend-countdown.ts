/**
 * The "send me another code" countdown.
 *
 * Why this exists: the server refuses a second code inside a 60-second
 * cooldown, and it correctly returns the exact wait in `retryAfterSeconds`. The
 * app was showing that refusal as a toast — the member tapped, was told off,
 * and had no idea the answer was "wait 45 seconds". That is the single most
 * common place a real sign-in gets abandoned, and it is entirely avoidable: the
 * server already tells us the number.
 *
 * So instead of a refusal, the button counts down and then re-arms itself. The
 * member can see exactly when it will work, which turns a dead end into a wait.
 *
 * Everything here is pure so the timing can be tested without a clock or a
 * rendered component.
 */

/** A countdown, as the button needs it. */
export type ResendState = {
  /** Seconds still to wait. Zero means the button is ready. */
  secondsRemaining: number;
  /** Whether tapping would be accepted right now. */
  canResend: boolean;
};

/** Shown as the countdown after a successful send, when the server says nothing. */
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

/**
 * How long to disable the button after a code is issued.
 *
 * Prefers the server's own number, because only the server knows the real
 * window — a client that invents its own would drift from the rule it is
 * trying to respect, and would either block a request the server would accept
 * or invite one it would refuse.
 */
export function cooldownSecondsFrom(retryAfterSeconds?: number | null): number {
  if (typeof retryAfterSeconds !== "number" || !Number.isFinite(retryAfterSeconds)) {
    return DEFAULT_RESEND_COOLDOWN_SECONDS;
  }
  // A server asking for zero or a negative wait means "ready now".
  return Math.max(0, Math.ceil(retryAfterSeconds));
}

/**
 * Build the countdown state from an absolute deadline.
 *
 * A deadline rather than a decrementing counter, because a countdown that
 * subtracts one per tick drifts: a backgrounded app pauses its timers, and the
 * member returns to a button that claims 30 seconds remain when the real wait
 * is long over. Comparing against a wall-clock deadline means the display is
 * always correct, however the timer behaved.
 */
export function resendStateAt(deadlineMs: number | null, nowMs: number): ResendState {
  if (deadlineMs === null) return { secondsRemaining: 0, canResend: true };
  const remainingMs = deadlineMs - nowMs;
  if (remainingMs <= 0) return { secondsRemaining: 0, canResend: true };
  return { secondsRemaining: Math.ceil(remainingMs / 1000), canResend: false };
}

/** The button's label for a given state. */
export function resendLabel(state: ResendState): string {
  if (state.canResend) return "Send a new code";
  return `Send a new code in ${state.secondsRemaining}s`;
}

/**
 * How a failed resend should be described.
 *
 * A rate limit is not an error, it is a wait, and wording it as one is the
 * whole point of this module. Anything else is a genuine failure and is passed
 * through untouched.
 */
export function describeResendFailure(input: {
  code?: string;
  error: string;
  retryAfterSeconds?: number | null;
}): { message: string; cooldownSeconds: number } {
  if (input.code === "rate_limited" || input.code === "verify_locked") {
    const seconds = cooldownSecondsFrom(input.retryAfterSeconds);
    return {
      message: `You can ask for another code in ${seconds}s.`,
      cooldownSeconds: seconds,
    };
  }
  return { message: input.error, cooldownSeconds: 0 };
}

/**
 * Whether asking again is worth offering at all.
 *
 * Only while the member is actually on the code step. Offering "send a new
 * code" on the destination step would be a second button doing what the first
 * one already does.
 */
export function resendApplies(step: string): boolean {
  return step === "code";
}

/**
 * Whether to keep ticking the clock.
 *
 * There is no point running a one-second interval once the countdown has
 * finished; the component stops its timer on this and starts a new one the next
 * time a code is issued.
 */
export function countdownIsActive(state: ResendState): boolean {
  return !state.canResend;
}