import type { Group, GroupMember } from "./group-management";

/**
 * Keeping the member's circles on the server.
 *
 * A circle the member created existed only as a name in the device's storage. It
 * did not survive a reinstall and never appeared on a second device, so a circle
 * made on a phone was missing on a tablet — the same defect the circle of friends
 * had before it moved to the account.
 *
 * This module owns the part that is easy to get wrong: which side wins when the
 * device and the server disagree. The rule is the same one the friend graph uses,
 * and for the same reason.
 *
 * The server wins, except for a change this device made that the server has not
 * acknowledged yet. That exception is what makes an offline invitation survive:
 * the member added someone on a train, the write failed, and without it the next
 * launch would hand them the server's older copy and quietly drop the addition.
 *
 * Everything here is pure, so the merge can be reasoned about and tested without
 * a server, a device, or a network.
 */

export type GroupLifecycle = "active" | "closed";
export type GroupRole = "admin" | "member";

/** One person in a circle, in the shape the server stores and returns. */
export type GroupMemberRow = {
  memberRef: string;
  name: string;
  role: GroupRole;
  paidTier?: boolean;
};

/** One circle, in the shape the server stores and returns. */
export type GroupSyncRow = {
  groupId: string;
  name: string;
  lifecycle: GroupLifecycle;
  closedReason: string | null;
  members: GroupMemberRow[];
};

export const GROUP_SYNC_STORAGE_KEY = "trufrenz.group-sync.v1";

/**
 * What this device still owes the server.
 *
 * `pending` maps a circle's id to the whole circle, because a circle is sent
 * whole: membership is replaced rather than merged, so there is no useful notion
 * of a partial change to one.
 */
export type GroupSync = {
  pending: Record<string, GroupSyncRow>;
  /** Circles the member deleted, which have to be removed rather than rewritten. */
  removed: string[];
  /**
   * Whether the device has ever pushed.
   *
   * Without this, a first launch after the server existed would treat an empty
   * answer as authoritative and hand back no circles at all, wiping what the
   * member had made before.
   */
  pushed: boolean;
};

export const EMPTY_GROUP_SYNC: GroupSync = { pending: {}, removed: [], pushed: false };

const LIFECYCLES: readonly GroupLifecycle[] = ["active", "closed"];
const ROLES: readonly GroupRole[] = ["admin", "member"];

function isLifecycle(value: unknown): value is GroupLifecycle {
  return typeof value === "string" && (LIFECYCLES as readonly string[]).includes(value);
}

function isRole(value: unknown): value is GroupRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function asRow(value: unknown): GroupSyncRow | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const groupId = typeof raw.groupId === "string" ? raw.groupId : "";
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!groupId || !name) return null;
  const members: GroupMemberRow[] = [];
  if (Array.isArray(raw.members)) {
    for (const entry of raw.members) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.memberRef !== "string" || !candidate.memberRef) continue;
      if (typeof candidate.name !== "string" || !candidate.name) continue;
      members.push({
        memberRef: candidate.memberRef,
        name: candidate.name,
        role: isRole(candidate.role) ? candidate.role : "member",
        paidTier: candidate.paidTier === true,
      });
    }
  }
  return {
    groupId,
    name,
    lifecycle: isLifecycle(raw.lifecycle) ? raw.lifecycle : "active",
    closedReason: typeof raw.closedReason === "string" ? raw.closedReason : null,
    members,
  };
}

/** Parses stored sync state, tolerating anything unusable. */
export function parseGroupSync(serialized: string | null | undefined): GroupSync {
  const empty: GroupSync = { pending: {}, removed: [], pushed: false };
  if (!serialized) return empty;
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return empty;
    const pending: Record<string, GroupSyncRow> = {};
    if (parsed.pending && typeof parsed.pending === "object" && !Array.isArray(parsed.pending)) {
      for (const [groupId, value] of Object.entries(parsed.pending as Record<string, unknown>)) {
        const row = asRow(value);
        if (row && groupId) pending[groupId] = row;
      }
    }
    const removed = Array.isArray(parsed.removed)
      ? parsed.removed.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    return { pending, removed, pushed: parsed.pushed === true };
  } catch {
    return empty;
  }
}

export function serializeGroupSync(sync: GroupSync): string {
  return JSON.stringify({ pending: sync.pending, removed: sync.removed, pushed: sync.pushed });
}

/** The server's rows as the app's own circles, keyed by id. */
export function circlesFromRows(rows: readonly GroupSyncRow[]): Record<string, GroupSyncRow> {
  const out: Record<string, GroupSyncRow> = {};
  for (const row of rows) {
    if (!row || !row.groupId) continue;
    out[row.groupId] = row;
  }
  return out;
}

/**
 * One of the app's circles as a row.
 *
 * The app's own `Group` is the source of truth for a circle it is editing, so
 * this is the only conversion: name, lifecycle and reason are carried alongside
 * the members rather than being derived again here.
 */
export function rowFromGroup(
  group: Group,
  options: { lifecycle?: GroupLifecycle; closedReason?: string | null } = {},
): GroupSyncRow {
  const members: GroupMemberRow[] = group.members.map((member: GroupMember) => ({
    memberRef: member.id,
    name: member.name,
    role: member.role,
    paidTier: member.paidTier,
  }));
  const role = options.lifecycle ?? "active";
  return {
    groupId: group.id,
    name: group.settings.name,
    lifecycle: role,
    closedReason: role === "closed" ? (options.closedReason ?? null) : null,
    members,
  };
}

/**
 * The circles to use once the server has answered.
 *
 * An empty server is only authoritative if this device has pushed before.
 * Otherwise it is a brand-new account, and the device's own circles are the ones
 * that exist — handing back nothing there would look exactly like losing them.
 */
export function reconcileGroupsOnLaunch(options: {
  local: readonly GroupSyncRow[];
  server: readonly GroupSyncRow[];
  pending: Record<string, GroupSyncRow>;
  hasPushed: boolean;
}): GroupSyncRow[] {
  const { local, server, pending, hasPushed } = options;
  const base = server.length === 0 && !hasPushed ? local : server;
  return overlayPendingGroups(base, pending);
}

/**
 * Lays unsent circles over what the server returned.
 *
 * Used after the answer arrives: the server's version is the base and anything
 * this device still owes is written on top, so an offline addition is not thrown
 * away by the next successful fetch.
 */
export function overlayPendingGroups(
  base: readonly GroupSyncRow[],
  pending: Record<string, GroupSyncRow>,
): GroupSyncRow[] {
  const byId = new Map<string, GroupSyncRow>();
  for (const row of base) if (row?.groupId) byId.set(row.groupId, row);
  for (const [groupId, row] of Object.entries(pending)) {
    if (groupId && row) byId.set(groupId, row);
  }
  return [...byId.values()];
}

/** Queues a circle for the server, replacing any earlier unsent copy of it. */
export function queueGroup(sync: GroupSync, row: GroupSyncRow): GroupSync {
  if (!row?.groupId) return sync;
  return {
    ...sync,
    pending: { ...sync.pending, [row.groupId]: row },
    // A circle cannot be both awaiting a write and awaiting deletion.
    removed: sync.removed.filter((id) => id !== row.groupId),
  };
}

/**
 * Queues a deletion.
 *
 * The id leaves the pending map as well: telling the server to store a circle and
 * to delete it in the same batch would leave its fate to whichever landed last.
 */
export function queueGroupRemoval(sync: GroupSync, groupId: string): GroupSync {
  if (!groupId) return sync;
  const pending = { ...sync.pending };
  delete pending[groupId];
  return { ...sync, pending, removed: sync.removed.includes(groupId) ? sync.removed : [...sync.removed, groupId] };
}

/** Everything still owed, in one batch a single request can carry. */
export function pendingGroupRows(sync: GroupSync): GroupSyncRow[] {
  return Object.values(sync.pending).filter((row): row is GroupSyncRow => Boolean(row?.groupId));
}

/**
 * Whether two circles would travel as the same thing.
 *
 * Membership is compared as a set of people and roles, because the server stores
 * membership as rows and returns them in whatever order the database chose. A
 * positional comparison would report a difference every time the order changed,
 * leaving a circle queued forever and re-sent on every launch.
 */
export function sameGroupContents(a: GroupSyncRow, b: GroupSyncRow): boolean {
  if (a.groupId !== b.groupId || a.name !== b.name || a.lifecycle !== b.lifecycle) return false;
  if ((a.closedReason ?? null) !== (b.closedReason ?? null)) return false;
  if (a.members.length !== b.members.length) return false;
  const key = (member: GroupMemberRow) => `${member.memberRef}:${member.role}:${member.paidTier === true ? 1 : 0}`;
  const left = a.members.map(key).sort();
  const right = b.members.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * Drops what a successful write covered.
 *
 * Only entries that still match what was sent are cleared. If the member edited
 * the circle again while the request was in flight, that newer version is still
 * owed and has to stay queued — otherwise the edit would be lost silently, which
 * is the one outcome a sync must never produce.
 */
export function acknowledgeGroups(
  sync: GroupSync,
  sent: readonly GroupSyncRow[],
  sentRemovals: readonly string[] = [],
): GroupSync {
  const pending = { ...sync.pending };
  for (const row of sent) {
    const queued = pending[row.groupId];
    if (queued && sameGroupContents(queued, row)) delete pending[row.groupId];
  }
  const sentSet = new Set(sentRemovals);
  return { pending, removed: sync.removed.filter((id) => !sentSet.has(id)), pushed: true };
}
