/**
 * Group lifecycle: active and closed.
 *
 * A group is not deleted when a plan finishes with it — the history is worth
 * keeping and the members are still friends — so closing is a state rather than
 * a removal. Two things change while a group is closed: it leaves the active
 * list, and it stops accepting new messages until somebody reopens it.
 *
 * Closed groups are deliberately still listed. A section that silently drops
 * them would leave a member believing a circle they made had disappeared, and
 * the whole point of the section is that every group a member belongs to is
 * visible in one place.
 */

export type GroupLifecycle = "active" | "closed";

/** Where a group came from, so a freshly created circle reads differently. */
export type GroupOrigin = "conversation" | "created";

export type GroupEntry = {
  id: string;
  name: string;
  origin: GroupOrigin;
  lifecycle: GroupLifecycle;
  /** How many people are in it, when that is known. */
  memberCount: number | null;
  /** The last thing that happened, for the row's second line. */
  lastActivity: string;
};

export const DEFAULT_GROUP_LIFECYCLE: GroupLifecycle = "active";

export function groupLifecycleFor(
  states: Record<string, GroupLifecycle>,
  groupId: string,
): GroupLifecycle {
  return states[groupId] ?? DEFAULT_GROUP_LIFECYCLE;
}

export function toggleGroupLifecycle(
  states: Record<string, GroupLifecycle>,
  groupId: string,
): Record<string, GroupLifecycle> {
  const current = groupLifecycleFor(states, groupId);
  return { ...states, [groupId]: current === "active" ? "closed" : "active" };
}

/** How the row describes the group's state. */
export function groupLifecycleLabel(lifecycle: GroupLifecycle): string {
  return lifecycle === "active" ? "Active" : "Closed";
}

/**
 * The consequence of the state, said plainly.
 *
 * The copy names what happens rather than what the state is called, because
 * "closed" on its own invites the question of whether the group still exists.
 */
export function groupLifecycleNote(lifecycle: GroupLifecycle): string {
  return lifecycle === "active"
    ? "Open for messages and new plans."
    : "Paused. Messages are kept, and anyone in the group can reopen it.";
}

/** Whether the group's conversation may take a new message. */
export function groupAcceptsMessages(lifecycle: GroupLifecycle): boolean {
  return lifecycle === "active";
}

export type GroupPartition = {
  active: GroupEntry[];
  closed: GroupEntry[];
};

/**
 * Split the directory in two, preserving the order it was given so the caller
 * keeps control of sorting.
 */
export function partitionGroups(entries: readonly GroupEntry[]): GroupPartition {
  return {
    active: entries.filter((entry) => entry.lifecycle === "active"),
    closed: entries.filter((entry) => entry.lifecycle === "closed"),
  };
}

/** The summary line above the active list. */
export function groupSectionSummary(entries: readonly GroupEntry[]): string {
  const { active, closed } = partitionGroups(entries);
  if (entries.length === 0) return "No groups yet.";
  const activeLabel = `${active.length} active`;
  if (closed.length === 0) return `${activeLabel} ${active.length === 1 ? "group" : "groups"}.`;
  return `${activeLabel} · ${closed.length} closed`;
}

/**
 * What a member's own group row says about membership.
 *
 * A created circle has no members until friends are invited, and saying so is
 * more useful than a zero.
 */
export function groupMemberSummary(memberCount: number | null): string {
  if (memberCount === null) return "Private circle";
  if (memberCount === 0) return "Invite friends to begin";
  return `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
}