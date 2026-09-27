import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUIET_HOURS,
  describeQuietHours,
  hourLabel,
  isQuietAt,
  minutesUntilQuietEnds,
  parseQuietHours,
  serializeQuietHours,
  shiftHour,
  shouldHoldNotification,
  type QuietHours,
} from "../lib/quiet-hours";

/*
 * Quiet hours are the one setting that can swallow a message, so the window maths
 * carries most of the risk here. The default window crosses midnight, which is the
 * case a naive `start <= hour < end` gets wrong — it would make the most common
 * setting of all silently do nothing, and the member would have no way to tell a
 * working setting from a broken one.
 */

/** A local clock time, so the hour comparisons match the member's own clock. */
const at = (hour: number, minute = 0) => new Date(2026, 8, 27, hour, minute, 0, 0);

const night: QuietHours = { enabled: true, startHour: 22, endHour: 7 };

describe("the quiet window", () => {
  it("is silent after the start and before the end", () => {
    expect(isQuietAt(night, at(23, 30))).toBe(true);
    expect(isQuietAt(night, at(3, 15))).toBe(true);
  });

  it("is awake in the middle of the day", () => {
    expect(isQuietAt(night, at(14, 0))).toBe(false);
  });

  it("crosses midnight rather than becoming an empty window", () => {
    // The bug this guards: start 22, end 7, and 23:30 is after the start, so a
    // single-range comparison that ignores midnight reports "not quiet" here.
    expect(isQuietAt(night, at(23, 0))).toBe(true);
    expect(isQuietAt(night, at(0, 30))).toBe(true);
  });

  it("treats the start as the first quiet moment and the end as the first awake one", () => {
    expect(isQuietAt(night, at(22, 0))).toBe(true);
    expect(isQuietAt(night, at(6, 59))).toBe(true);
    expect(isQuietAt(night, at(7, 0))).toBe(false);
    expect(isQuietAt(night, at(21, 59))).toBe(false);
  });

  it("handles a daytime window without crossing midnight", () => {
    const nap: QuietHours = { enabled: true, startHour: 13, endHour: 15 };
    expect(isQuietAt(nap, at(13, 0))).toBe(true);
    expect(isQuietAt(nap, at(14, 30))).toBe(true);
    expect(isQuietAt(nap, at(15, 0))).toBe(false);
    expect(isQuietAt(nap, at(23, 0))).toBe(false);
  });

  it("is never quiet while the switch is off", () => {
    const off: QuietHours = { ...night, enabled: false };
    expect(isQuietAt(off, at(3, 0))).toBe(false);
    expect(isQuietAt(off, at(23, 0))).toBe(false);
  });

  it("does not silence everything when both hours land on the same value", () => {
    // Nudging both hours to the same value produces a zero-length window. Reading
    // that as "quiet forever" would be a trap the member could not escape.
    const degenerate: QuietHours = { enabled: true, startHour: 9, endHour: 9 };
    for (let hour = 0; hour < 24; hour += 1) expect(isQuietAt(degenerate, at(hour))).toBe(false);
  });
});

describe("holding a notification", () => {
  it("holds it when the conversation is muted", () => {
    expect(shouldHoldNotification({ quiet: { ...night, enabled: false }, at: at(14), chatMuted: true })).toBe(true);
  });

  it("holds it inside the window even when the conversation is not muted", () => {
    expect(shouldHoldNotification({ quiet: night, at: at(2), chatMuted: false })).toBe(true);
  });

  it("lets it through outside the window when nothing is muted", () => {
    expect(shouldHoldNotification({ quiet: night, at: at(14), chatMuted: false })).toBe(false);
  });
});

describe("what the settings row says", () => {
  it("names the hours the way a member would say them", () => {
    expect(hourLabel(22)).toBe("10 PM");
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(7)).toBe("7 AM");
    expect(hourLabel(12)).toBe("12 PM");
  });

  it("steps the hour around the clock instead of running off the end", () => {
    expect(shiftHour(23, 1)).toBe(0);
    expect(shiftHour(0, -1)).toBe(23);
    expect(shiftHour(13, 1)).toBe(14);
  });

  it("says when the window opens rather than only that it is on", () => {
    // A caption that just said "On" would leave the member unable to tell a window
    // they set from the default.
    const copy = describeQuietHours(night);
    expect(copy).toContain("10 PM");
    expect(copy).toContain("7 AM");
  });

  it("says the notifications are allowed through when the switch is off", () => {
    expect(describeQuietHours(DEFAULT_QUIET_HOURS)).toMatch(/off/i);
  });

  it("counts the minutes left so the member knows it ends by itself", () => {
    // 3:30am in a 22→7 window leaves three and a half hours.
    expect(minutesUntilQuietEnds(night, at(3, 30))).toBe(210);
    expect(minutesUntilQuietEnds(night, at(14, 0))).toBe(0);
  });
});

describe("stored quiet hours", () => {
  it("round-trips through storage", () => {
    expect(parseQuietHours(serializeQuietHours(night))).toEqual(night);
  });

  it("stays off by default, because a notification setting must not opt itself in", () => {
    expect(DEFAULT_QUIET_HOURS.enabled).toBe(false);
    expect(parseQuietHours(null).enabled).toBe(false);
    expect(parseQuietHours("not json").enabled).toBe(false);
  });

  it("falls back rather than crashing on a malformed record", () => {
    expect(parseQuietHours("[1,2,3]")).toEqual(DEFAULT_QUIET_HOURS);
    expect(parseQuietHours('"a string"')).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("refuses an hour outside the clock", () => {
    // A stored 26 would otherwise make a window that can never match.
    const parsed = parseQuietHours('{"enabled":true,"startHour":26,"endHour":7}');
    expect(parsed.startHour).toBe(DEFAULT_QUIET_HOURS.startHour);
  });

  it("keeps the enabled flag and the valid hour when only one value is wrong", () => {
    const parsed = parseQuietHours('{"enabled":true,"startHour":21,"endHour":99}');
    expect(parsed.enabled).toBe(true);
    expect(parsed.startHour).toBe(21);
    expect(parsed.endHour).toBe(DEFAULT_QUIET_HOURS.endHour);
  });
});
/*
 * The preview exemption, held in place.
 *
 * The settings screen has to be able to show a banner during the window, or the
 * member cannot tell whether the setting does what it says. That exemption is the
 * one place the guard can be bypassed, so it is worth pinning: an exemption kept
 * in a ref that the notification call clears is fragile, because an early return
 * between the two leaves it set and the next genuine message sails through.
 */
describe("showing a banner during the window", () => {
  const screen = readFileSync(join(__dirname, "..", "app/(tabs)/index.tsx"), "utf8");

  it("asks the window before showing a genuine notification", () => {
    expect(screen).toContain("shouldHoldNotification({ quiet: quietHours, at: new Date(), chatMuted: false })");
  });

  it("declares the preview at the call site rather than through a shared ref", () => {
    expect(screen).toContain("{ preview: true }");
    expect(screen).not.toContain("quietHoursPreviewBypass");
  });

  it("still lets the member's mute win over a preview", () => {
    // The mute check must come before the exemption, or previewing a muted chat
    // would show a banner the member asked never to see.
    const muteAt = screen.indexOf("rowStateFor(chatRowStates, source).muted");
    const exemptionAt = screen.indexOf("!options.preview &&");
    expect(muteAt).toBeGreaterThan(-1);
    expect(exemptionAt).toBeGreaterThan(-1);
    expect(muteAt).toBeLessThan(exemptionAt);
  });
});
