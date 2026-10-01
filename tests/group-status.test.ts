import { describe, expect, it } from "vitest";

import {
  createdGroupId,
  groupAcceptsMessages,
  groupLifecycleFor,
  groupLifecycleLabel,
  groupLifecycleNote,
  groupMemberSummary,
  groupSectionSummary,
  partitionGroups,
  toggleGroupLifecycle,
  type GroupEntry,
} from "../lib/group-status";

const entry = (id: string, lifecycle: "active" | "closed"): GroupEntry => ({
  id,
  name: `Group ${id}`,
  origin: "conversation",
  lifecycle,
  memberCount: 3,
  lastActivity: "See you Sunday",
});

describe("a group's state", () => {
  it("starts active unless the member has closed it", () => {
    expect(groupLifecycleFor({}, "sunday")).toBe("active");
    expect(groupLifecycleFor({ sunday: "closed" }, "sunday")).toBe("closed");
  });

  it("toggles between the two states without disturbing the others", () => {
    const once = toggleGroupLifecycle({ other: "closed" }, "sunday");
    expect(once.sunday).toBe("closed");
    expect(once.other).toBe("closed");
    expect(toggleGroupLifecycle(once, "sunday").sunday).toBe("active");
  });

  it("only lets an active group take a message", () => {
    expect(groupAcceptsMessages("active")).toBe(true);
    expect(groupAcceptsMessages("closed")).toBe(false);
  });

  /*
   * The copy is the feature here. "Closed" on its own leaves a member wondering
   * whether their circle has been deleted, so the note says what survived.
   */
  it("says the messages are kept when a group is closed", () => {
    expect(groupLifecycleLabel("closed")).toBe("Closed");
    expect(groupLifecycleNote("closed")).toMatch(/messages are kept/i);
    expect(groupLifecycleNote("active")).toMatch(/open for messages/i);
  });
});

describe("the Groups section's lists", () => {
  it("partitions without reordering either list", () => {
    const entries = [entry("a", "active"), entry("b", "closed"), entry("c", "active")];
    const { active, closed } = partitionGroups(entries);
    expect(active.map((item) => item.id)).toEqual(["a", "c"]);
    expect(closed.map((item) => item.id)).toEqual(["b"]);
  });

  it("summarises both counts so a closed group is still accounted for", () => {
    expect(groupSectionSummary([])).toBe("No groups yet.");
    expect(groupSectionSummary([entry("a", "active")])).toBe("1 active group.");
    expect(groupSectionSummary([entry("a", "active"), entry("b", "closed")])).toBe("1 active · 1 closed");
  });

  it("describes a circle that has no members yet as needing invitations", () => {
    expect(groupMemberSummary(0)).toBe("Invite friends to begin");
    expect(groupMemberSummary(1)).toBe("1 member");
    expect(groupMemberSummary(4)).toBe("4 members");
    expect(groupMemberSummary(null)).toBe("Private circle");
  });
});

describe("naming a circle the member created", () => {
  /*
   * This id is the only thing joining the row in the list, the create flow that
   * opens Group Info, and the check for whether a circle is chattable yet. It
   * was written inline in two of those three, and a mismatch is not a cosmetic
   * bug: the row simply cannot be opened.
   */
  it("is stable for the same name and position", () => {
    expect(createdGroupId("Sunday walk", 0)).toBe(createdGroupId("Sunday walk", 0));
  });

  it("separates two circles that share a name", () => {
    expect(createdGroupId("Sunday walk", 0)).not.toBe(createdGroupId("Sunday walk", 1));
  });

  it("produces an id safe to use as a key from any name", () => {
    const id = createdGroupId("  Priya's Study & Chai!  ", 2);
    expect(id).toMatch(/^created-group-2-[a-z0-9-]+$/);
    expect(id).not.toMatch(/--$|^-/);
  });

  it("still produces a usable id when the name has nothing to slug", () => {
    expect(createdGroupId("!!!", 0)).toBe("created-group-0-circle");
  });

  it("does not trust a negative or fractional position", () => {
    expect(createdGroupId("Walk", -3)).toBe("created-group-0-walk");
    expect(createdGroupId("Walk", 2.7)).toBe("created-group-2-walk");
  });
});
