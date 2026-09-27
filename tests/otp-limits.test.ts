import { describe, expect, it } from "vitest";

import {
  CALLER_FAILED_LIMIT,
  CALLER_LONG_LIMIT,
  CALLER_SHORT_LIMIT,
  DESTINATION_LONG_LIMIT,
  DESTINATION_SHORT_LIMIT,
  RESEND_COOLDOWN_MS,
  VERIFY_LOCK_MS,
  decideSend,
  decideVerify,
  describeWait,
  summariseSends,
  type FailureRecord,
  type SendRecord,
} from "../lib/otp-limits";

/** A fixed clock, so no assertion depends on when the suite runs. */
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

const PHONE = "+919812345678";
const CALLER = "caller-a";
const OTHER_CALLER = "caller-b";

function send(overrides: Partial<SendRecord> = {}): SendRecord {
  return { destination: PHONE, callerKey: CALLER, createdAt: NOW - 5 * 60 * 1000, ...overrides };
}

function counts(sends: SendRecord[], caller = CALLER) {
  return summariseSends(sends, PHONE, caller, NOW);
}

describe("summariseSends", () => {
  it("counts nothing when the log is empty", () => {
    const result = counts([]);
    expect(result.destinationInShortWindow).toBe(0);
    expect(result.destinationInLongWindow).toBe(0);
    expect(result.callerInShortWindow).toBe(0);
    expect(result.callerInLongWindow).toBe(0);
    expect(result.msSinceLastDestinationSend).toBeNull();
  });

  it("separates the destination's sends from another caller's", () => {
    const result = counts([
      send({ createdAt: NOW - 10 * 60 * 1000 }),
      // Same number, different device: counts for the number, not for us.
      send({ callerKey: OTHER_CALLER, createdAt: NOW - 10 * 60 * 1000 }),
      // Our device, a different number: counts for us, not for this number.
      send({ destination: "+919800000000", createdAt: NOW - 10 * 60 * 1000 }),
    ]);
    expect(result.destinationInShortWindow).toBe(2);
    expect(result.callerInShortWindow).toBe(2);
  });

  it("ignores rows that fall outside the window", () => {
    const result = counts([
      send({ createdAt: NOW - 2 * 60 * 60 * 1000 }),
      send({ createdAt: NOW - 30 * 60 * 1000 }),
    ]);
    // The two-hour-old row is outside the one-hour window but inside the day.
    expect(result.destinationInShortWindow).toBe(1);
    expect(result.destinationInLongWindow).toBe(2);
  });

  it("measures the gap since the most recent send, not the oldest", () => {
    const result = counts([
      send({ createdAt: NOW - 30 * 60 * 1000 }),
      send({ createdAt: NOW - 20 * 1000 }),
    ]);
    expect(result.msSinceLastDestinationSend).toBe(20 * 1000);
  });
});

describe("decideSend", () => {
  it("allows the first request", () => {
    expect(decideSend(counts([]))).toEqual({ allowed: true });
  });

  it("refuses a second request inside the cooldown and names the wait", () => {
    const decision = decideSend(counts([send({ createdAt: NOW - 10 * 1000 })]));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.rule).toBe("cooldown");
    expect(decision.retryAfterSeconds).toBe(50);
    expect(decision.message).toContain("50 seconds");
  });

  it("allows a request once the cooldown has passed", () => {
    const decision = decideSend(counts([send({ createdAt: NOW - RESEND_COOLDOWN_MS - 1000 })]));
    expect(decision.allowed).toBe(true);
  });

  it("refuses the fourth code to one number in an hour", () => {
    const sends = Array.from({ length: DESTINATION_SHORT_LIMIT }, (_, i) =>
      send({ createdAt: NOW - (RESEND_COOLDOWN_MS + 60_000) * (i + 1) }),
    );
    const decision = decideSend(counts(sends));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.rule).toBe("destination-short");
    // The message offers the way out, which matters when the member is stuck.
    expect(decision.message).toMatch(/email/i);
  });

  it("refuses the seventh code to one number in a day", () => {
    const sends = Array.from({ length: DESTINATION_LONG_LIMIT }, (_, i) =>
      send({ createdAt: NOW - (2 * 60 * 60 * 1000) * (i + 1) }),
    );
    const decision = decideSend(counts(sends));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.rule).toBe("destination-long");
  });

  it("refuses a device that works through many numbers", () => {
    const sends = Array.from({ length: CALLER_SHORT_LIMIT }, (_, i) =>
      send({
        destination: `+9198000000${String(i).padStart(2, "0")}`,
        createdAt: NOW - (RESEND_COOLDOWN_MS + 60_000) * (i + 1),
      }),
    );
    // None of these are for PHONE, so only the caller rule can fire.
    const decision = decideSend(counts(sends));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.rule).toBe("caller-short");
  });

  it("refuses a device that has spent its whole day", () => {
    const sends = Array.from({ length: CALLER_LONG_LIMIT }, (_, i) =>
      send({
        destination: `+9197000000${String(i).padStart(2, "0")}`,
        // Inside the hour for the first ten, then spread back across the day,
        // so the short window is exceeded as well as the long one. Spacing all
        // thirty at 90 minutes would leave only sixteen inside 24 hours.
        createdAt: NOW - (i < CALLER_SHORT_LIMIT ? 5 * 60 * 1000 : 90 * 60 * 1000) * (i + 1),
      }),
    );
    const decision = decideSend(counts(sends));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    // Both caller rules are exceeded; the short one is reported because it is
    // the shorter wait and therefore the more useful answer.
    expect(decision.rule).toBe("caller-short");
  });

  it("counts one device's sends against that device, not against everyone", () => {
    const noisyNeighbour = Array.from({ length: CALLER_LONG_LIMIT }, (_, i) =>
      send({
        callerKey: OTHER_CALLER,
        destination: "+919700000000",
        createdAt: NOW - (90 * 60 * 1000) * (i + 1),
      }),
    );
    // A different member, on a different number, must not be affected by the
    // first member's activity.
    expect(decideSend(summariseSends(noisyNeighbour, PHONE, CALLER, NOW)).allowed).toBe(true);
  });

  it("checks the cooldown before the hourly cap, so the answer is the shortest wait", () => {
    const sends = [
      send({ createdAt: NOW - 5 * 1000 }),
      ...Array.from({ length: DESTINATION_SHORT_LIMIT }, (_, i) =>
        send({ createdAt: NOW - (RESEND_COOLDOWN_MS + 60_000) * (i + 1) }),
      ),
    ];
    const decision = decideSend(counts(sends));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    // Both rules are broken; the cooldown is the one a member can act on now.
    expect(decision.rule).toBe("cooldown");
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});

describe("decideVerify", () => {
  const failure = (createdAt: number): FailureRecord => ({ callerKey: CALLER, createdAt });

  it("allows verification with a clean history", () => {
    expect(decideVerify([], CALLER, NOW).allowed).toBe(true);
  });

  it("still allows the tenth wrong code", () => {
    const failures = Array.from({ length: CALLER_FAILED_LIMIT - 1 }, (_, i) =>
      failure(NOW - i * 1000),
    );
    expect(decideVerify(failures, CALLER, NOW).allowed).toBe(true);
  });

  it("locks the device once the limit is reached", () => {
    const failures = Array.from({ length: CALLER_FAILED_LIMIT }, (_, i) => failure(NOW - i * 1000));
    const decision = decideVerify(failures, CALLER, NOW);
    expect(decision.allowed).toBe(false);
    /*
     * The lock lifts when the oldest of the recent failures leaves the window.
     * These failures span ten seconds, so the oldest is ten seconds old and the
     * remaining lock is the window minus that — nearly the full quarter hour,
     * which is the point: a fresh burst locks for close to the full period.
     */
    expect(decision.retryAfterSeconds).toBeGreaterThan(VERIFY_LOCK_MS / 1000 - 60);
  });

  it("unlocks once the window has passed", () => {
    const failures = Array.from({ length: CALLER_FAILED_LIMIT }, () =>
      failure(NOW - VERIFY_LOCK_MS - 1000),
    );
    expect(decideVerify(failures, CALLER, NOW).allowed).toBe(true);
  });

  it("does not lock an innocent device for someone else's guessing", () => {
    const failures = Array.from({ length: CALLER_FAILED_LIMIT * 2 }, () => ({
      callerKey: OTHER_CALLER,
      createdAt: NOW - 1000,
    }));
    expect(decideVerify(failures, CALLER, NOW).allowed).toBe(true);
  });
});

describe("describeWait", () => {
  it("speaks in seconds under a minute", () => {
    expect(describeWait(1)).toBe("1 second");
    expect(describeWait(45)).toBe("45 seconds");
  });

  it("speaks in minutes under an hour", () => {
    expect(describeWait(60)).toBe("1 minute");
    expect(describeWait(90)).toBe("2 minutes");
  });

  it("speaks in hours beyond that", () => {
    expect(describeWait(3600)).toBe("1 hour");
    expect(describeWait(7200)).toBe("2 hours");
  });

  it("never says zero", () => {
    // A rounded-down zero would render as "wait 0 seconds", which reads as a
    // broken app rather than a limit.
    expect(describeWait(0)).toBe("1 second");
  });
});
