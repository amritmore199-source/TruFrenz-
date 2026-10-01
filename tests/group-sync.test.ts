import { describe, expect, it } from "vitest";

import {
  EMPTY_GROUP_SYNC,
  acknowledgeGroups,
  circlesFromRows,
  overlayPendingGroups,
  parseGroupSync,
  pendingGroupRows,
  queueGroup,
  queueGroupRemoval,
  reconcileGroupsOnLaunch,
  sameGroupContents,
  serializeGroupSync,
  type GroupSyncRow,
} from "../lib/group-sync";

const row = (overrides: Partial<GroupSyncRow> = {}): GroupSyncRow => ({
  groupId: "created-group-0-walk",
  name: "Sunday walk",
  lifecycle: "active",
  closedReason: null,
  members: [{ memberRef: "me", name: "You", role: "admin" }],
  ...overrides,
});

describe("reading stored circle sync state", () => {
  it("starts empty rather than throwing on nothing", () => {
    expect(parseGroupSync(null)).toEqual(EMPTY_GROUP_SYNC);
    expect(parseGroupSync("not json")).toEqual(EMPTY_GROUP_SYNC);
    expect(parseGroupSync("[]")).toEqual(EMPTY_GROUP_SYNC);
  });

  it("round-trips a queued circle", () => {
    const sync = queueGroup(EMPTY_GROUP_SYNC, row({ lifecycle: "closed", closedReason: "finished the course" }));
    const restored = parseGroupSync(serializeGroupSync(sync));
    expect(restored.pending["created-group-0-walk"].closedReason).toBe("finished the course");
    expect(restored.pending["created-group-0-walk"].lifecycle).toBe("closed");
  });

  it("drops a queued entry that has no id or no name", () => {
    const stored = JSON.stringify({
      pending: { a: { name: "no id" }, b: { groupId: "b" }, c: { groupId: "c", name: "ok", members: [] } },
      removed: [],
      pushed: false,
    });
    const parsed = parseGroupSync(stored);
    expect(Object.keys(parsed.pending)).toEqual(["c"]);
  });

  it("ignores a pending value that is not an object", () => {
    const stored = JSON.stringify({ pending: [], removed: "nope", pushed: "yes" });
    const parsed = parseGroupSync(stored);
    expect(parsed.pending).toEqual({});
    expect(parsed.removed).toEqual([]);
    expect(parsed.pushed).toBe(false);
  });
});

describe("queuing a circle", () => {
  it("replaces an earlier unsent copy of the same circle", () => {
    let sync = queueGroup(EMPTY_GROUP_SYNC, row());
    sync = queueGroup(sync, row({ name: "Sunday walk club" }));
    expect(pendingGroupRows(sync)).toHaveLength(1);
    expect(sync.pending["created-group-0-walk"].name).toBe("Sunday walk club");
  });

  /*
   * A circle awaiting a write and a deletion at the same time would leave its
   * fate to whichever reached the server last, so one cancels the other.
   */
  it("cancels a pending deletion when the circle is queued again", () => {
    let sync = queueGroupRemoval(EMPTY_GROUP_SYNC, "created-group-0-walk");
    expect(sync.removed).toEqual(["created-group-0-walk"]);
    sync = queueGroup(sync, row());
    expect(sync.removed).toEqual([]);
    expect(pendingGroupRows(sync)).toHaveLength(1);
  });

  it("cancels a pending write when the circle is deleted", () => {
    let sync = queueGroup(EMPTY_GROUP_SYNC, row());
    sync = queueGroupRemoval(sync, "created-group-0-walk");
    expect(pendingGroupRows(sync)).toHaveLength(0);
    expect(sync.removed).toEqual(["created-group-0-walk"]);
  });

  it("does not queue the same deletion twice", () => {
    let sync = queueGroupRemoval(EMPTY_GROUP_SYNC, "g");
    sync = queueGroupRemoval(sync, "g");
    expect(sync.removed).toEqual(["g"]);
  });

  it("ignores an empty id", () => {
    expect(queueGroup(EMPTY_GROUP_SYNC, row({ groupId: "" }))).toEqual(EMPTY_GROUP_SYNC);
    expect(queueGroupRemoval(EMPTY_GROUP_SYNC, "")).toEqual(EMPTY_GROUP_SYNC);
  });
});

describe("comparing two circles", () => {
  /*
   * The server stores membership as rows and returns them in whatever order the
   * database chose, so a positional comparison would call every reply a change
   * and leave a circle queued forever, re-sent on every launch.
   */
  it("ignores the order of members", () => {
    const a = row({ members: [
      { memberRef: "me", name: "You", role: "admin" },
      { memberRef: "sam", name: "Sam", role: "member" },
    ] });
    const b = row({ members: [
      { memberRef: "sam", name: "Sam", role: "member" },
      { memberRef: "me", name: "You", role: "admin" },
    ] });
    expect(sameGroupContents(a, b)).toBe(true);
  });

  it("notices a changed name, state or reason", () => {
    expect(sameGroupContents(row(), row({ name: "Other" }))).toBe(false);
    expect(sameGroupContents(row(), row({ lifecycle: "closed" }))).toBe(false);
    expect(sameGroupContents(
      row({ lifecycle: "closed", closedReason: "a" }),
      row({ lifecycle: "closed", closedReason: "b" }),
    )).toBe(false);
  });

  it("notices a member being added, removed or promoted", () => {
    const base = row({ members: [{ memberRef: "me", name: "You", role: "admin" }] });
    const added = row({ members: [
      { memberRef: "me", name: "You", role: "admin" },
      { memberRef: "sam", name: "Sam", role: "member" },
    ] });
    const promoted = row({ members: [{ memberRef: "me", name: "You", role: "member" }] });
    expect(sameGroupContents(base, added)).toBe(false);
    expect(sameGroupContents(added, base)).toBe(false);
    expect(sameGroupContents(base, promoted)).toBe(false);
  });
});

describe("acknowledging a write", () => {
  it("clears only the circles that were sent", () => {
    let sync = queueGroup(EMPTY_GROUP_SYNC, row({ groupId: "a" }));
    sync = queueGroup(sync, row({ groupId: "b" }));
    sync = acknowledgeGroups(sync, [row({ groupId: "a" })]);
    expect(Object.keys(sync.pending)).toEqual(["b"]);
    expect(sync.pushed).toBe(true);
  });

  /*
   * The failure this guards against is silent data loss: an edit made while the
   * request was in flight is not in the reply, so clearing it would drop it.
   */
  it("keeps a circle edited while the request was in flight", () => {
    let sync = queueGroup(EMPTY_GROUP_SYNC, row({ name: "Sunday walk" }));
    const sent = pendingGroupRows(sync);
    sync = queueGroup(sync, row({ name: "Renamed mid-flight" }));
    sync = acknowledgeGroups(sync, sent);
    expect(sync.pending["created-group-0-walk"].name).toBe("Renamed mid-flight");
  });

  it("clears a deletion once it has been sent", () => {
    const sync = acknowledgeGroups(queueGroupRemoval(EMPTY_GROUP_SYNC, "g"), [], ["g"]);
    expect(sync.removed).toEqual([]);
  });
});

describe("deciding which circles to show at launch", () => {
  it("accepts the server's answer once this device has pushed", () => {
    const result = reconcileGroupsOnLaunch({
      local: [row({ groupId: "local" })],
      server: [row({ groupId: "server" })],
      pending: {},
      hasPushed: true,
    });
    expect(result.map((item) => item.groupId)).toEqual(["server"]);
  });

  /*
   * An empty server means a brand-new account, not a member with no circles.
   * Trusting it there would look exactly like losing everything they made.
   */
  it("keeps the device's circles when the server is empty and nothing was pushed", () => {
    const result = reconcileGroupsOnLaunch({
      local: [row({ groupId: "local" })],
      server: [],
      pending: {},
      hasPushed: false,
    });
    expect(result.map((item) => item.groupId)).toEqual(["local"]);
  });

  it("lets an unsent change win over the server's older copy", () => {
    const result = reconcileGroupsOnLaunch({
      local: [],
      server: [row({ groupId: "a", name: "Server name" })],
      pending: { a: row({ groupId: "a", name: "Offline rename" }) },
      hasPushed: true,
    });
    expect(result[0].name).toBe("Offline rename");
  });

  it("keeps circles the server has and the device does not", () => {
    const result = reconcileGroupsOnLaunch({
      local: [],
      server: [row({ groupId: "a" }), row({ groupId: "b" })],
      pending: {},
      hasPushed: true,
    });
    expect(result).toHaveLength(2);
  });
});

describe("shaping the server's rows", () => {
  it("keys them by circle id, dropping anything without one", () => {
    const keyed = circlesFromRows([row({ groupId: "a" }), row({ groupId: "" })]);
    expect(Object.keys(keyed)).toEqual(["a"]);
  });

  it("lays unsent circles over the server's set without duplicating", () => {
    const merged = overlayPendingGroups(
      [row({ groupId: "a", name: "from server" })],
      { a: row({ groupId: "a", name: "from device" }) },
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("from device");
  });
});