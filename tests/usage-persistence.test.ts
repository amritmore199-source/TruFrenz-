import { describe, expect, it } from "vitest";

import { EMPTY_USAGE, parseUsage, proposalNudge, groupCapacityNudge } from "../lib/subscription-store";
import { FREE_HANGOUT_PROPOSALS } from "../lib/subscription";

/**
 * The usage counters are what make the upgrade hints honest: they have to survive
 * a reload, and a corrupted or tampered value must never read as "used nothing"
 * in a way that hides a limit — or as "used everything" in a way that blocks a
 * free member who has barely started.
 */
describe("persisted usage counters", () => {
  it("round-trips through JSON the way AsyncStorage stores it", () => {
    const usage = { proposalsSent: 4, largestGroupSize: 3 };
    const restored = parseUsage(JSON.parse(JSON.stringify(usage)));
    expect(restored).toEqual(usage);
  });

  it("starts fresh when nothing has been saved", () => {
    expect(parseUsage(undefined)).toEqual(EMPTY_USAGE);
    expect(parseUsage(null)).toEqual(EMPTY_USAGE);
  });

  it("treats unreadable counters as fresh rather than trusting them", () => {
    expect(parseUsage("not an object")).toEqual(EMPTY_USAGE);
    expect(parseUsage(42)).toEqual(EMPTY_USAGE);
    expect(parseUsage([])).toEqual(EMPTY_USAGE);
    expect(parseUsage({})).toEqual(EMPTY_USAGE);
  });

  it("ignores negative, fractional and non-numeric values", () => {
    expect(parseUsage({ proposalsSent: -5, largestGroupSize: -1 })).toEqual(EMPTY_USAGE);
    expect(parseUsage({ proposalsSent: 2.7, largestGroupSize: "3.9" })).toEqual({
      proposalsSent: 2,
      largestGroupSize: 3,
    });
    expect(parseUsage({ proposalsSent: "many", largestGroupSize: Number.NaN })).toEqual(EMPTY_USAGE);
  });

  it("keeps one counter when the other is missing", () => {
    expect(parseUsage({ proposalsSent: 6 })).toEqual({ proposalsSent: 6, largestGroupSize: 0 });
    expect(parseUsage({ largestGroupSize: 4 })).toEqual({ proposalsSent: 0, largestGroupSize: 4 });
  });

  it("shows no hint early on and one near the limit", () => {
    expect(proposalNudge("free", 0).level).toBe("hidden");
    expect(proposalNudge("free", 1).level).toBe("hidden");

    const near = proposalNudge("free", FREE_HANGOUT_PROPOSALS - 1);
    expect(near.level).toBe("near");
    expect(near.cta).toBeTruthy();

    const atLimit = proposalNudge("free", FREE_HANGOUT_PROPOSALS);
    expect(atLimit.level).toBe("at-limit");
    expect(atLimit.title).toMatch(new RegExp(String(FREE_HANGOUT_PROPOSALS)));
  });

  it("still reports the limit once the member is past it", () => {
    expect(proposalNudge("free", FREE_HANGOUT_PROPOSALS + 25).level).toBe("at-limit");
  });

  it("never nudges a member who is already paying", () => {
    expect(proposalNudge("premium", 0).level).toBe("hidden");
    expect(proposalNudge("premium", FREE_HANGOUT_PROPOSALS * 3).level).toBe("hidden");
  });

  it("survives a reload without losing the count that triggered the hint", () => {
    const saved = JSON.stringify({ proposalsSent: FREE_HANGOUT_PROPOSALS, largestGroupSize: 2 });
    const restored = parseUsage(JSON.parse(saved));
    expect(restored.proposalsSent).toBe(FREE_HANGOUT_PROPOSALS);
    // The reloaded value still produces the limit hint, which is the whole point
    // of persisting it.
    expect(proposalNudge("free", restored.proposalsSent).level).toBe("at-limit");
  });

  it("drives the group hint from the persisted group size", () => {
    const restored = parseUsage(JSON.parse(JSON.stringify({ proposalsSent: 0, largestGroupSize: 5 })));
    const nudge = groupCapacityNudge("free", restored.largestGroupSize);
    expect(nudge.level).not.toBe("hidden");
    expect(groupCapacityNudge("premium", restored.largestGroupSize).level).toBe("hidden");
  });
});
