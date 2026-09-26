import { describe, expect, it } from "vitest";
import { mergeMeetupRefresh } from "../lib/meetup-feed";

describe("meetup refresh merge", () => {
  it("puts refreshed rows first, replaces stale versions, and removes duplicate ids", () => {
    const result = mergeMeetupRefresh(
      [{ id: "a", title: "Old title" }, { id: "saved", title: "My saved plan" }],
      [{ id: "a", title: "Fresh title" }, { id: "b", title: "New plan" }, { id: "b", title: "Duplicate" }],
    );
    expect(result).toEqual([
      { id: "a", title: "Fresh title" },
      { id: "b", title: "New plan" },
      { id: "saved", title: "My saved plan" },
    ]);
  });

  it("returns the current list unchanged for an empty feed snapshot", () => {
    const current = [{ id: "a" }];
    expect(mergeMeetupRefresh(current, [])).toEqual(current);
  });
});
