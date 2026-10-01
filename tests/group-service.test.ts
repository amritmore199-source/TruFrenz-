import { describe, expect, it } from "vitest";

import {
  MAX_GROUP_MEMBERS,
  enforceInvariants,
  normalizeGroup,
  normalizeGroups,
  type GroupMemberRow,
} from "../server/groupService";

const member = (overrides: Partial<GroupMemberRow> = {}): GroupMemberRow => ({
  memberRef: "me",
  name: "You",
  role: "admin",
  ...overrides,
});

describe("cleaning a circle a client sent", () => {
  it("keeps a well-formed circle, without its optional premium flags", () => {
    const clean = normalizeGroup({
      groupId: "created-group-0-walk",
      name: "Sunday walk",
      lifecycle: "active",
      members: [{ memberRef: "me", name: "You", role: "admin", paidTier: true }],
    });
    expect(clean).toEqual({
      groupId: "created-group-0-walk",
      name: "Sunday walk",
      lifecycle: "active",
      closedReason: null,
      members: [{ memberRef: "me", name: "You", role: "admin", paidTier: true }],
    });
  });

  it("refuses a circle with no id or no name", () => {
    expect(normalizeGroup({ name: "No id" })).toBeNull();
    expect(normalizeGroup({ groupId: "a" })).toBeNull();
    expect(normalizeGroup({ groupId: "a", name: "   " })).toBeNull();
    expect(normalizeGroup(null)).toBeNull();
    expect(normalizeGroup("nope")).toBeNull();
  });

  it("falls back to an active state for a lifecycle it does not recognise", () => {
    expect(normalizeGroup({ groupId: "a", name: "n", lifecycle: "exploded" })?.lifecycle).toBe("active");
  });

  /*
   * A reason describes a closed circle. Keeping one on an active circle would
   * show "Closed · finished the course" on a circle that is plainly open.
   */
  it("keeps a reason only while the circle is closed", () => {
    const open = normalizeGroup({ groupId: "a", name: "n", lifecycle: "active", closedReason: "finished" });
    const closed = normalizeGroup({ groupId: "a", name: "n", lifecycle: "closed", closedReason: "finished" });
    expect(open?.closedReason).toBeNull();
    expect(closed?.closedReason).toBe("finished");
  });

  it("drops an unusable member and a duplicate of somebody already in", () => {
    const clean = normalizeGroup({
      groupId: "a",
      name: "n",
      members: [
        member(),
        { memberRef: "", name: "ghost", role: "member" },
        { memberRef: "sam", name: "", role: "member" },
        { memberRef: "sam", name: "Sam", role: "member" },
      ],
    });
    expect(clean?.members.map((item) => item.memberRef)).toEqual(["me", "sam"]);
  });

  it("stops at the member cap rather than storing an unbounded circle", () => {
    const many = Array.from({ length: MAX_GROUP_MEMBERS + 20 }, (_, index) => ({
      memberRef: `person-${index}`,
      name: `Person ${index}`,
      role: "member",
    }));
    const clean = normalizeGroup({ groupId: "a", name: "n", members: [{ ...member() }, ...many] });
    expect(clean?.members).toHaveLength(MAX_GROUP_MEMBERS);
  });
});

describe("keeping a circle usable", () => {
  /*
   * Every management action in the app is gated on being an admin, so a circle
   * with no admin could never be renamed, added to, or handed over again.
   */
  it("promotes somebody when nobody is an admin", () => {
    const result = enforceInvariants([member({ role: "member" }), member({ memberRef: "sam", name: "Sam", role: "member" })]);
    expect(result[0].role).toBe("admin");
    expect(result[1].role).toBe("member");
  });

  it("demotes the extras when two people claim the admin role", () => {
    const result = enforceInvariants([member(), member({ memberRef: "sam", name: "Sam", role: "admin" })]);
    expect(result.filter((item) => item.role === "admin")).toHaveLength(1);
    expect(result[0].role).toBe("admin");
  });

  it("leaves a correct circle alone", () => {
    const input = [member(), member({ memberRef: "sam", name: "Sam", role: "member" })];
    expect(enforceInvariants(input)).toEqual(input);
  });

  it("handles a circle with nobody in it", () => {
    expect(enforceInvariants([])).toEqual([]);
  });
});

describe("cleaning a batch of circles", () => {
  it("keeps the last circle for a repeated id", () => {
    const clean = normalizeGroups([
      { groupId: "a", name: "First" },
      { groupId: "a", name: "Second" },
    ]);
    expect(clean).toHaveLength(1);
    expect(clean[0].name).toBe("Second");
  });

  it("drops the unusable entries and keeps the rest", () => {
    const clean = normalizeGroups([null, { name: "no id" }, { groupId: "a", name: "ok" }]);
    expect(clean.map((item) => item.groupId)).toEqual(["a"]);
  });

  it("returns nothing for input that is not a list", () => {
    expect(normalizeGroups("nope")).toEqual([]);
    expect(normalizeGroups(null)).toEqual([]);
  });
});