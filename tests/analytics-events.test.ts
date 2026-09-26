import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENT_TYPES,
  dayKey,
  dayKeyOffset,
  dayRange,
  demoEventsForDay,
  hashString,
  isAnalyticsEventType,
  rollupDay,
  rollupRange,
  summarizeEvents,
  type AccountSnapshot,
  type RawAnalyticsEvent,
} from "../lib/analytics-events";

const snapshot: AccountSnapshot = { verified: 4, unverified: 8, free: 9, premium: 3 };

function event(
  eventType: string,
  day: string,
  memberId?: number,
  groupId?: string,
): RawAnalyticsEvent {
  return { eventType, day, memberId, groupId };
}

describe("event catalogue", () => {
  it("recognises every declared type", () => {
    for (const type of ANALYTICS_EVENT_TYPES) {
      expect(isAnalyticsEventType(type)).toBe(true);
    }
  });

  it("rejects unknown and malformed types", () => {
    expect(isAnalyticsEventType("page_view")).toBe(false);
    expect(isAnalyticsEventType("")).toBe(false);
    expect(isAnalyticsEventType(null)).toBe(false);
    expect(isAnalyticsEventType(7)).toBe(false);
  });
});

describe("day helpers", () => {
  it("derives the UTC day key", () => {
    expect(dayKey(new Date("2026-09-26T23:59:59.000Z"))).toBe("2026-09-26");
    expect(dayKey(new Date("2026-09-26T00:00:00.000Z"))).toBe("2026-09-26");
  });

  it("counts back from a reference day", () => {
    const from = new Date("2026-09-26T12:00:00.000Z");
    expect(dayKeyOffset(from, 0)).toBe("2026-09-26");
    expect(dayKeyOffset(from, 1)).toBe("2026-09-25");
    expect(dayKeyOffset(from, 13)).toBe("2026-09-13");
  });

  it("builds an inclusive ascending range", () => {
    const range = dayRange("2026-09-26", 3);
    expect(range).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
  });

  it("handles a single-day range and clamps nonsense counts", () => {
    expect(dayRange("2026-09-26", 1)).toEqual(["2026-09-26"]);
    expect(dayRange("2026-09-26", 0)).toEqual(["2026-09-26"]);
    expect(dayRange("2026-09-26", -5)).toEqual(["2026-09-26"]);
  });

  it("crosses a month boundary correctly", () => {
    expect(dayRange("2026-10-01", 2)).toEqual(["2026-09-30", "2026-10-01"]);
  });
});

describe("daily rollup", () => {
  it("counts signups for the day", () => {
    const row = rollupDay(
      "2026-09-26",
      [event("signup", "2026-09-26", 1), event("signup", "2026-09-26", 2)],
      snapshot,
    );
    expect(row.newSignups).toBe(2);
    expect(row.day).toBe("2026-09-26");
  });

  it("deduplicates distinct members for the active figure", () => {
    const row = rollupDay(
      "2026-09-26",
      [
        event("session_start", "2026-09-26", 1),
        event("message_sent", "2026-09-26", 1),
        event("message_sent", "2026-09-26", 1),
        event("message_sent", "2026-09-26", 2),
      ],
      snapshot,
    );
    expect(row.activeUsers).toBe(2);
  });

  it("counts a signup as activity even without a session event", () => {
    const row = rollupDay("2026-09-26", [event("signup", "2026-09-26", 9)], snapshot);
    expect(row.activeUsers).toBe(1);
  });

  it("deduplicates groups and counts calls and matches", () => {
    const row = rollupDay(
      "2026-09-26",
      [
        event("group_active", "2026-09-26", 1, "group-a"),
        event("group_active", "2026-09-26", 2, "group-a"),
        event("group_active", "2026-09-26", 3, "group-b"),
        event("call_started", "2026-09-26", 1),
        event("call_started", "2026-09-26", 2),
        event("friendship_accepted", "2026-09-26", 1),
      ],
      snapshot,
    );
    expect(row.activeGroups).toBe(2);
    expect(row.callsMade).toBe(2);
    expect(row.matchesMade).toBe(1);
  });

  it("takes verified and tier splits from the account snapshot", () => {
    const row = rollupDay("2026-09-26", [], snapshot);
    expect(row.verifiedUsers).toBe(4);
    expect(row.unverifiedUsers).toBe(8);
    expect(row.freeUsers).toBe(9);
    expect(row.paidUsers).toBe(3);
  });

  it("ignores events from other days", () => {
    const row = rollupDay(
      "2026-09-26",
      [event("signup", "2026-09-25", 1), event("signup", "2026-09-26", 2)],
      snapshot,
    );
    expect(row.newSignups).toBe(1);
  });

  it("reports zeroes for a day with no events", () => {
    const row = rollupDay("2026-09-26", [], snapshot);
    expect(row.activeUsers).toBe(0);
    expect(row.newSignups).toBe(0);
    expect(row.activeGroups).toBe(0);
    expect(row.callsMade).toBe(0);
    expect(row.matchesMade).toBe(0);
  });

  it("does not count anonymous events toward distinct members", () => {
    const row = rollupDay(
      "2026-09-26",
      [event("group_active", "2026-09-26", undefined, "group-a"), event("signup", "2026-09-26", 5)],
      snapshot,
    );
    expect(row.activeUsers).toBe(1);
    expect(row.activeGroups).toBe(1);
  });

  it("rolls a range oldest first and applies the snapshot to every day", () => {
    const days = ["2026-09-24", "2026-09-25", "2026-09-26"];
    const rows = rollupRange(
      days,
      [event("signup", "2026-09-25", 1), event("signup", "2026-09-26", 2)],
      snapshot,
    );
    expect(rows.map((row) => row.day)).toEqual(days);
    expect(rows.map((row) => row.newSignups)).toEqual([0, 1, 1]);
    for (const row of rows) expect(row.verifiedUsers).toBe(4);
  });
});

describe("event summary", () => {
  it("counts by type and tracks distinct members and groups", () => {
    const summary = summarizeEvents([
      event("session_start", "2026-09-26", 1),
      event("message_sent", "2026-09-26", 1),
      event("message_sent", "2026-09-26", 2, "group-a"),
      event("group_active", "2026-09-26", 2, "group-a"),
    ]);
    expect(summary.counts.message_sent).toBe(2);
    expect(summary.counts.session_start).toBe(1);
    expect(summary.distinctMembers).toBe(2);
    expect(summary.distinctGroups).toBe(1);
    expect(summary.total).toBe(4);
  });

  it("returns an empty summary for no events", () => {
    const summary = summarizeEvents([]);
    expect(summary.total).toBe(0);
    expect(summary.distinctMembers).toBe(0);
    expect(summary.counts).toEqual({});
  });
});

describe("demo backfill stream", () => {
  const memberIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("is deterministic for a given day", () => {
    expect(demoEventsForDay("2026-09-20", memberIds)).toEqual(
      demoEventsForDay("2026-09-20", memberIds),
    );
  });

  it("produces different streams for different days", () => {
    const a = JSON.stringify(demoEventsForDay("2026-09-20", memberIds));
    const b = JSON.stringify(demoEventsForDay("2026-09-21", memberIds));
    expect(a).not.toBe(b);
  });

  it("only emits known event types and the requested day", () => {
    for (const evt of demoEventsForDay("2026-09-20", memberIds)) {
      expect(isAnalyticsEventType(evt.eventType)).toBe(true);
      expect(evt.day).toBe("2026-09-20");
    }
  });

  it("returns nothing when there are no members to attribute to", () => {
    expect(demoEventsForDay("2026-09-20", [])).toEqual([]);
  });

  it("always includes at least one session so the day is not blank", () => {
    const events = demoEventsForDay("2026-09-20", memberIds);
    expect(events.some((evt) => evt.eventType === "session_start")).toBe(true);
  });

  it("hashes strings deterministically and within range", () => {
    expect(hashString("2026-09-20")).toBe(hashString("2026-09-20"));
    expect(hashString("2026-09-20")).not.toBe(hashString("2026-09-21"));
    for (const day of ["2026-09-13", "2026-09-20", "2026-09-26"]) {
      const value = hashString(day);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(100000);
    }
  });
});
