import { describe, expect, it } from "vitest";

import {
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