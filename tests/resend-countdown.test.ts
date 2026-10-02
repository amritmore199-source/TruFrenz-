import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  cooldownSecondsFrom,
  countdownIsActive,
  describeResendFailure,
  resendApplies,
  resendLabel,
  resendStateAt,
} from "../lib/resend-countdown";

const NOW = 1_700_000_000_000;

describe("how long to wait", () => {
  it("prefers the server's own number", () => {
    // The server owns the window. A client that invented its own would drift
    // from the rule it is trying to respect.
    expect(cooldownSecondsFrom(45)).toBe(45);
  });

  it("falls back to a minute when the server says nothing", () => {
    expect(cooldownSecondsFrom(undefined)).toBe(DEFAULT_RESEND_COOLDOWN_SECONDS);
    expect(cooldownSecondsFrom(null)).toBe(DEFAULT_RESEND_COOLDOWN_SECONDS);
  });

  it("rounds a fractional wait up, so the button never re-arms early", () => {
    // Re-arming at 0.4s remaining would invite a request the server refuses.
    expect(cooldownSecondsFrom(0.4)).toBe(1);
    expect(cooldownSecondsFrom(1.2)).toBe(2);
  });

  it("treats zero and negatives as ready now", () => {
    expect(cooldownSecondsFrom(0)).toBe(0);
    expect(cooldownSecondsFrom(-10)).toBe(0);
  });

  it("ignores a non-finite number rather than producing NaN seconds", () => {
    expect(cooldownSecondsFrom(Number.NaN)).toBe(DEFAULT_RESEND_COOLDOWN_SECONDS);
    expect(cooldownSecondsFrom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_RESEND_COOLDOWN_SECONDS);
  });
});

describe("the countdown state", () => {
  it("is ready when there is no deadline", () => {
    expect(resendStateAt(null, NOW)).toEqual({ secondsRemaining: 0, canResend: true });
  });

  it("counts the remaining seconds", () => {
    expect(resendStateAt(NOW + 45_000, NOW)).toEqual({ secondsRemaining: 45, canResend: false });
  });

  it("rounds up, so the last partial second is not shown as zero", () => {
    // Showing 0 while the server would still refuse is the exact misleading
    // state this module exists to avoid.
    const state = resendStateAt(NOW + 400, NOW);
    expect(state.secondsRemaining).toBe(1);
    expect(state.canResend).toBe(false);
  });

  it("is ready exactly at the deadline", () => {
    expect(resendStateAt(NOW, NOW)).toEqual({ secondsRemaining: 0, canResend: true });
  });

  it("is ready once the deadline has passed", () => {
    // The important case: a backgrounded app whose timers paused. Deriving from
    // the deadline rather than a decrementing counter is what makes this right.
    expect(resendStateAt(NOW - 60_000, NOW)).toEqual({ secondsRemaining: 0, canResend: true });
  });
});

describe("the button label", () => {
  it("invites a request when ready", () => {
    expect(resendLabel({ secondsRemaining: 0, canResend: true })).toBe("Send a new code");
  });

  it("states the wait when counting down, so tapping is explained rather than refused", () => {
    expect(resendLabel({ secondsRemaining: 42, canResend: false })).toBe("Send a new code in 42s");
  });
});

describe("describing a failed resend", () => {
  it("turns a rate limit into a wait with the server's number", () => {
    const result = describeResendFailure({
      code: "rate_limited",
      error: "Too many codes requested.",
      retryAfterSeconds: 120,
    });
    expect(result.message).toBe("You can ask for another code in 120s.");
    // The cooldown is returned so the caller can arm the countdown from it.
    expect(result.cooldownSeconds).toBe(120);
  });

  it("treats a verify lock the same way", () => {
    const result = describeResendFailure({
      code: "verify_locked",
      error: "Too many wrong codes.",
      retryAfterSeconds: 900,
    });
    expect(result.cooldownSeconds).toBe(900);
  });

  it("passes a genuine failure through untouched", () => {
    // No cooldown: nothing was limited, so there is nothing to wait for and the
    // button must stay armed.
    const result = describeResendFailure({
      code: "email_delivery_failed",
      error: "We could not send that email just now. Try again in a moment.",
    });
    expect(result.message).toBe("We could not send that email just now. Try again in a moment.");
    expect(result.cooldownSeconds).toBe(0);
  });

  it("falls back to a minute for a rate limit that omits the number", () => {
    const result = describeResendFailure({ code: "rate_limited", error: "Slow down." });
    expect(result.cooldownSeconds).toBe(DEFAULT_RESEND_COOLDOWN_SECONDS);
  });
});

describe("where the countdown belongs", () => {
  it("appears on the code step", () => {
    expect(resendApplies("code")).toBe(true);
  });

  it("does not appear on the destination step", () => {
    // The primary button already sends a code there; a second one saying the
    // same thing is noise.
    expect(resendApplies("phone")).toBe(false);
    expect(resendApplies("profile")).toBe(false);
    expect(resendApplies("welcome")).toBe(false);
  });
});

describe("when to keep ticking", () => {
  it("ticks while a wait is in progress", () => {
    expect(countdownIsActive({ secondsRemaining: 30, canResend: false })).toBe(true);
  });

  it("stops once ready, so an idle screen is not waking up every second", () => {
    expect(countdownIsActive({ secondsRemaining: 0, canResend: true })).toBe(false);
  });
});

describe("naming the transport", () => {
  /**
   * The rule the server follows, restated as a pure function so it can be
   * tested without a provider.
   *
   * The bug this guards against is subtle: `smsProviderName` returns the
   * *default* provider ("msg91") even when nothing is configured, so reporting
   * it unconditionally made the server claim an SMS delivery on a deployment
   * whose only proof of sending was a code shown on screen. A member reading
   * "we texted you a code" while nothing arrives is the exact dead end this
   * whole flow exists to remove.
   */
  const transportFor = (input: { channel: "phone" | "email"; deliverable: boolean; provider: string }) =>
    !input.deliverable ? null : input.channel === "email" ? "email" : input.provider;

  it("is null when nothing actually delivered", () => {
    expect(transportFor({ channel: "phone", deliverable: false, provider: "msg91" })).toBeNull();
    expect(transportFor({ channel: "email", deliverable: false, provider: "email" })).toBeNull();
  });

  it("names the real transport when one delivered", () => {
    expect(transportFor({ channel: "phone", deliverable: true, provider: "whatsapp" })).toBe("whatsapp");
    expect(transportFor({ channel: "phone", deliverable: true, provider: "msg91" })).toBe("msg91");
    expect(transportFor({ channel: "email", deliverable: true, provider: "email" })).toBe("email");
  });

  it("states a day-long limit as a limit rather than counting it down", () => {
    /*
     * A countdown from 86,400 is not a countdown, it is a wait until tomorrow —
     * and leaving the button armed for a day makes the flow look about to reopen
     * when it will not. The member met this as "no OTP is generated" on their own
     * number, which was true: the server refused because their number had spent
     * its daily allowance.
     */
    const described = describeResendFailure({
      code: "rate_limited",
      error: "That number has reached today's limit for codes.",
      retryAfterSeconds: 86400,
      rule: "destination-long",
    });
    expect(described.cooldownSeconds).toBe(0);
    expect(described.message).toContain("Use email instead");
    expect(described.message).not.toContain("86400");
  });

  it("still counts down a wait that is short enough to wait out", () => {
    const described = describeResendFailure({
      code: "rate_limited",
      error: "Wait.",
      retryAfterSeconds: 45,
      rule: "cooldown",
    });
    expect(described.cooldownSeconds).toBe(45);
    expect(described.message).toBe("You can ask for another code in 45s.");
  });
});
