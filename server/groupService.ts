/**
 * Circles the member created, stored server-side.
 *
 * The app kept these as names on the device that made them: a circle created on
 * a phone did not exist on a tablet, and a reinstall lost the member list with
 * it. Storing them per member makes a circle part of the account, which is what
 * it is — a circle that lives on one device is not a circle, it is a cache.
 *
 * The rules that keep this safe live here rather than in the client:
 *
 * A circle is identified by the app's own id, not a surrogate. The app refers to
 * a circle by that id in the chat list, in messages and in its links, so a
 * second name for the same circle would be a source of drift.
 *
 * A write is a whole circle, replacing the membership of that circle only. A
 * device that has been offline cannot write over circles it never knew about,
 * because it never sends them.
 *
 * The creator is always a member and always exactly one admin. Both invariants
 * are enforced here because a circle with no admin cannot be recovered by the
 * member, and every management action in the app is gated on being one.
 */
import { and, eq, inArray } from "drizzle-orm";

import { memberGroupMembers, memberGroups } from "../drizzle/schema";
import { getDb } from "./db";

export type GroupLifecycle = "active" | "closed";
export type GroupRole = "admin" | "member";

export type GroupMemberRow = {
  memberRef: string;
  name: string;
  role: GroupRole;
  /** Premium, which group calling is gated on per participant. */
  paidTier?: boolean;
};

export type GroupRow = {
  groupId: string;
  name: string;
  lifecycle: GroupLifecycle;
  closedReason: string | null;
  members: GroupMemberRow[];
};

/** How many circles one member may store, so a runaway client cannot fill the table. */
export const MAX_GROUPS_PER_MEMBER = 100;
/** How many people one circle may hold; matches the app's own cap. */
export const MAX_GROUP_MEMBERS = 100;

const LIFECYCLES: readonly GroupLifecycle[] = ["active", "closed"];
const ROLES: readonly GroupRole[] = ["admin", "member"];

function isLifecycle(value: unknown): value is GroupLifecycle {
  return typeof value === "string" && (LIFECYCLES as readonly string[]).includes(value);
}

function isRole(value: unknown): value is GroupRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Trims a string to a maximum length, or returns null when there is nothing left. */
function trimmed(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, max);
  return clean.length ? clean : null;
}

/**
 * Cleans one client-supplied circle.
 *
 * Anything unusable is dropped rather than stored: the ids and the two enums
 * come from the app, so a value outside them means a client that has drifted,
 * not a value worth keeping.
 */
export function normalizeGroup(input: unknown): GroupRow | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const groupId = trimmed(raw.groupId, 96);
  const name = trimmed(raw.name, 60);
  if (!groupId || !name) return null;
  const lifecycle = isLifecycle(raw.lifecycle) ? raw.lifecycle : "active";
  const members: GroupMemberRow[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.members)) {
    for (const entry of raw.members) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Record<string, unknown>;
      const memberRef = trimmed(candidate.memberRef, 64);
      const memberName = trimmed(candidate.name, 80);
      if (!memberRef || !memberName || seen.has(memberRef)) continue;
      if (members.length >= MAX_GROUP_MEMBERS) break;
      seen.add(memberRef);
      members.push({
        memberRef,
        name: memberName,
        role: isRole(candidate.role) ? candidate.role : "member",
        paidTier: candidate.paidTier === true,
      });
    }
  }
  return {
    groupId,
    name,
    lifecycle,
    closedReason: lifecycle === "closed" ? trimmed(raw.closedReason, 120) : null,
    members: enforceInvariants(members),
  };
}

/**
 * Keeps a circle usable: at least one member, exactly one admin.
 *
 * The creator is whoever the client lists first, and the app always sends the
 * member themselves first. If no member is marked an admin the first one is
 * promoted, because a circle nobody administers cannot be renamed, added to or
 * handed over — every one of those actions is admin-only, so the circle would
 * become permanently frozen.
 */
export function enforceInvariants(members: readonly GroupMemberRow[]): GroupMemberRow[] {
  if (members.length === 0) return [];
  const admins = members.filter((member) => member.role === "admin");
  if (admins.length === 1) return [...members];
  /*
   * Exactly one admin. Demote the extras to members and, if there are none,
   * promote the first person so the circle always has an owner.
   */
  const owner = admins[0]?.memberRef ?? members[0].memberRef;
  return members.map((member) => ({
    ...member,
    role: member.memberRef === owner ? "admin" : "member",
  }));
}

/** Normalizes a whole batch, keeping the last circle for any repeated id. */
export function normalizeGroups(input: unknown): GroupRow[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map<string, GroupRow>();
  for (const entry of input) {
    const group = normalizeGroup(entry);
    if (group) byId.set(group.groupId, group);
    if (byId.size >= MAX_GROUPS_PER_MEMBER) break;
  }
  return [...byId.values()];
}

/** Every circle this member has, with its members. */
export async function listGroups(memberId: number): Promise<GroupRow[]> {
  const db = await getDb();
  if (!db) return [];
  const groups = await db
    .select({
      groupId: memberGroups.groupId,
      name: memberGroups.name,
      lifecycle: memberGroups.lifecycle,
      closedReason: memberGroups.closedReason,
    })
    .from(memberGroups)
    .where(eq(memberGroups.memberId, memberId));
  if (groups.length === 0) return [];
  const memberRows = await db
    .select({
      groupId: memberGroupMembers.groupId,
      memberRef: memberGroupMembers.memberRef,
      name: memberGroupMembers.name,
      role: memberGroupMembers.role,
    })
    .from(memberGroupMembers)
    .where(eq(memberGroupMembers.memberId, memberId));
  const byGroup = new Map<string, GroupMemberRow[]>();
  for (const row of memberRows) {
    const list = byGroup.get(row.groupId) ?? [];
    list.push({
      memberRef: row.memberRef,
      name: row.name,
      role: isRole(row.role) ? row.role : "member",
    });
    byGroup.set(row.groupId, list);
  }
  return groups.map((group) => ({
    groupId: group.groupId,
    name: group.name,
    lifecycle: isLifecycle(group.lifecycle) ? group.lifecycle : "active",
    closedReason: group.closedReason ?? null,
    members: enforceInvariants(byGroup.get(group.groupId) ?? []),
  }));
}

/**
 * Applies a batch of circles, replacing each one's state.
 *
 * Membership is rewritten for the circles in the batch rather than merged: the
 * client sends whole circles, so merging would leave a person in a circle the
 * member has removed them from.
 *
 * A replacement is scoped to (member, group), so circles this device has never
 * seen are untouched — a device that has been offline cannot erase them.
 */
export async function applyGroups(memberId: number, groups: readonly GroupRow[]): Promise<GroupRow[]> {
  const db = await getDb();
  if (!db) return listGroups(memberId);
  const clean = normalizeGroups(groups);
  if (clean.length === 0) return listGroups(memberId);

  for (const group of clean) {
    await db
      .insert(memberGroups)
      .values({
        memberId,
        groupId: group.groupId,
        name: group.name,
        lifecycle: group.lifecycle,
        closedReason: group.closedReason,
      })
      .onDuplicateKeyUpdate({
        set: { name: group.name, lifecycle: group.lifecycle, closedReason: group.closedReason },
      });
    await db
      .delete(memberGroupMembers)
      .where(and(eq(memberGroupMembers.memberId, memberId), eq(memberGroupMembers.groupId, group.groupId)));
    if (group.members.length === 0) continue;
    await db.insert(memberGroupMembers).values(
      group.members.map((member) => ({
        memberId,
        groupId: group.groupId,
        memberRef: member.memberRef,
        name: member.name,
        role: member.role,
      })),
    );
  }
  return listGroups(memberId);
}

/** Forgets circles the member deleted, so a removal travels. */
export async function forgetGroups(memberId: number, groupIds: readonly string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const clean = groupIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 96);
  if (clean.length === 0) return;
  await db
    .delete(memberGroupMembers)
    .where(and(eq(memberGroupMembers.memberId, memberId), inArray(memberGroupMembers.groupId, clean)));
  await db
    .delete(memberGroups)
    .where(and(eq(memberGroups.memberId, memberId), inArray(memberGroups.groupId, clean)));
}

/** How many circles this member keeps, for the dashboard. */
export async function groupCountFor(memberId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ groupId: memberGroups.groupId })
    .from(memberGroups)
    .where(eq(memberGroups.memberId, memberId));
  return rows.length;
}