import { describe, expect, it } from "vitest";

import { describeRequestWait, requestCountLabel } from "../lib/request-wait";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

/** The line for a wait of `elapsed` milliseconds. */
const wait = (elapsed: number) => describeRequestWait(NOW - elapsed, NOW);

describe("how long a request has been waiting", () => {
  /*
   * The panel used to print "Request sent · waiting quietly" for everybody, so a
   * request sent ten minutes ago and one sent a fortnight ago read identically
   * and the member had no way to tell which needed chasing.
   */
  it("says the distance rather than the same line for every request", () => {
    const lines = [wait(0), wait(20 * MINUTE), wait(5 * HOUR), wait(3 * DAY), wait(20 * DAY)].map(
      (entry) => entry.text,
    );
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("counts in the unit a person would use", () => {
    expect(wait(30 * 1000).text).toContain("just now");
    expect(wait(20 * MINUTE).text).toContain("20 minutes ago");
    expect(wait(HOUR).text).toContain("1 hour ago");
    expect(wait(5 * HOUR).text).toContain("5 hours ago");
    expect(wait(DAY).text).toContain("1 day ago");
    expect(wait(3 * DAY).text).toContain("3 days ago");
    expect(wait(14 * DAY).text).toContain("2 weeks ago");
  });

  it("gets the singular right, which is the line a member reads most often", () => {
    expect(wait(MINUTE).text).toContain("1 minute ago");
    expect(wait(DAY).text).toContain("1 day ago");
    expect(wait(7 * DAY).text).toContain("1 week ago");
    expect(wait(60 * DAY).text).toContain("2 months ago");
  });

  it("keeps saying it is still waiting, without ever sounding like a nudge", () => {
    for (const elapsed of [0, 20 * MINUTE, 5 * HOUR, 3 * DAY, 20 * DAY, 200 * DAY]) {
      const text = wait(elapsed).text;
      expect(text).toContain("waiting");
      // Nothing here may pressure the member or blame the other person.
      expect(text.toLowerCase()).not.toMatch(/chase|ignore|nudge|still nothing|no reply/);
    }
  });

  /*
   * A request the app has no record of gets an honest line. Inventing "sent just
   * now" would be a small lie about the member's own account.
   */
  it("admits when it does not know rather than guessing", () => {
    for (const missing of [undefined, null, 0, -1, Number.NaN]) {
      const described = describeRequestWait(missing, NOW);
      expect(described.text).toBe("Request sent · waiting");
      expect(described.band).toBe("unknown");
    }
  });

  /*
   * A device whose clock is corrected, or moved across timezones, can date a
   * request in the future. "Sent in 3 hours" is nonsense, so it is read as just
   * sent — the only reading that cannot be wrong.
   */
  it("does not report a request as sent in the future", () => {
    const described = describeRequestWait(NOW + 3 * HOUR, NOW);
    expect(described.text).toContain("just now");
    expect(described.text).not.toContain("in 3 hours");
  });

  it("bands the wait so a caller can sort or filter without re-deriving it", () => {
    expect(wait(0).band).toBe("fresh");
    expect(wait(5 * HOUR).band).toBe("settling");
    expect(wait(3 * DAY).band).toBe("quiet");
    expect(wait(60 * DAY).band).toBe("long-unanswered");
  });
});

describe("the heading count", () => {
  it("reads as words for the numbers a member will actually see", () => {
    expect(requestCountLabel(0)).toBe("No requests waiting");
    expect(requestCountLabel(1)).toBe("1 request waiting");
    expect(requestCountLabel(4)).toBe("4 requests waiting");
  });

  it("does not produce a negative or fractional count", () => {
    expect(requestCountLabel(-2)).toBe("No requests waiting");
    expect(requestCountLabel(Number.NaN)).toBe("No requests waiting");
  });
});