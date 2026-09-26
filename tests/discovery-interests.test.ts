import { describe, expect, it } from "vitest";
import { findCommonInterests } from "../lib/discovery-interests";

describe("discovery common interests", () => {
  it("recognizes shared coffee and book interests across related labels", () => {
    expect(findCommonInterests(["Coffee walks", "Bookshops"], ["Café", "Reading", "Ceramics"])).toEqual(["Café", "Reading"]);
  });

  it("does not invent shared interests when there is no overlap", () => {
    expect(findCommonInterests(["Coffee"], ["Gardening", "Bouldering"])).toEqual([]);
  });
});
