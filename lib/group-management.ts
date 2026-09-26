/**
 * Group rules for private friend circles. Groups are invite-only: a member can
 * only add people who are already accepted friends, never strangers.
 */

export type GroupRole = "admin" | "member";

export type GroupMember = {
  id: string;
  name: string;
  role: GroupRole;
  /** Group calls need premium on every participant, checked per member. */
  paidTier?: boolean;
};

export type GroupSettings = {
  name: string;
  /** Photo uri, or null for the default glass monogram. */
  photoUri: string | null;
  muted: boolean;
};

export type Group = {
  id: string;
  settings: GroupSettings;
  members: GroupMember[];
};

export const MAX_GROUP_MEMBERS = 12;

/** Every group keeps exactly one admin; the creator starts as admin. */
export function createGroup(input: { id: string; name: string; creator: GroupMember; members?: GroupMember[] }): Group {
  return {
    id: input.id,
    settings: { name: input.name.trim() || "New group", photoUri: null, muted: false },
    members: [{ ...input.creator, role: "admin" }, ...(input.members ?? []).map((member) => ({ ...member, role: "member" as GroupRole }))],
  };
}

export function isAdmin(group: Group, memberId: string): boolean {
  return group.members.some((member) => member.id === memberId && member.role === "admin");
}

export function adminCount(group: Group): number {
  return group.members.filter((member) => member.role === "admin").length;
}

/**
 * Only accepted friends who are not already in the group can be invited.
 * Strangers are never offered, which keeps groups closed by design.
 */
export function invitableFriends(group: Group, acceptedFriendIds: readonly string[]): string[] {
  return acceptedFriendIds.filter((id) => !group.members.some((member) => member.id === id));
}

export type AddMemberResult = { group: Group; ok: boolean; message: string };

export function addMember(group: Group, member: GroupMember, acceptedFriendIds: readonly string[]): AddMemberResult {
  if (group.members.some((existing) => existing.id === member.id)) {
    return { group, ok: false, message: `${member.name.split(" ")[0]} is already in this group.` };
  }
  if (!acceptedFriendIds.includes(member.id)) {
    return { group, ok: false, message: "Only accepted friends can be added. Send a friend request first." };
  }
  if (group.members.length >= MAX_GROUP_MEMBERS) {
    return { group, ok: false, message: `Groups hold up to ${MAX_GROUP_MEMBERS} friends. Start another circle for the rest.` };
  }
  return { group: { ...group, members: [...group.members, { ...member, role: "member" }] }, ok: true, message: `${member.name.split(" ")[0]} was added to ${group.settings.name}.` };
}

/** Removing a member is admin-only and never allowed on the last admin. */
export function removeMember(group: Group, memberId: string, actorId: string): AddMemberResult {
  if (!isAdmin(group, actorId)) return { group, ok: false, message: "Only group admins can remove members." };
  const target = group.members.find((member) => member.id === memberId);
  if (!target) return { group, ok: false, message: "That member has already left." };
  if (target.role === "admin" && adminCount(group) === 1) {
    return { group, ok: false, message: "Transfer the admin role before removing the last admin." };
  }
  return { group: { ...group, members: group.members.filter((member) => member.id !== memberId) }, ok: true, message: `${target.name.split(" ")[0]} was removed from the group.` };
}

/** Handing over the admin role keeps exactly one admin in the group. */
export function transferAdmin(group: Group, memberId: string, actorId: string): AddMemberResult {
  if (!isAdmin(group, actorId)) return { group, ok: false, message: "Only group admins can hand over the role." };
  const target = group.members.find((member) => member.id === memberId);
  if (!target) return { group, ok: false, message: "That member is not in this group." };
  if (target.role === "admin") return { group, ok: false, message: `${target.name.split(" ")[0]} is already an admin.` };
  return {
    group: {
      ...group,
      members: group.members.map((member) => {
        if (member.id === memberId) return { ...member, role: "admin" as GroupRole };
        if (member.id === actorId) return { ...member, role: "member" as GroupRole };
        return member;
      }),
    },
    ok: true,
    message: `${target.name.split(" ")[0]} is now the group admin.`,
  };
}

/** Leaving is blocked for the last admin so a group is never orphaned. */
export function leaveGroup(group: Group, memberId: string): AddMemberResult {
  const member = group.members.find((item) => item.id === memberId);
  if (!member) return { group, ok: false, message: "You are not in this group." };
  if (member.role === "admin" && adminCount(group) === 1 && group.members.length > 1) {
    return { group, ok: false, message: "Hand the admin role to a friend before leaving, so the group keeps an owner." };
  }
  return { group: { ...group, members: group.members.filter((item) => item.id !== memberId) }, ok: true, message: "You left the group. Your copy of the history stays on your device." };
}

/** Group settings are admin-only; muting is personal and always allowed. */
export function renameGroup(group: Group, name: string, actorId: string): AddMemberResult {
  if (!isAdmin(group, actorId)) return { group, ok: false, message: "Only group admins can rename the group." };
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return { group, ok: false, message: "A group needs a name." };
  return { group: { ...group, settings: { ...group.settings, name: trimmed } }, ok: true, message: `Group renamed to ${trimmed}.` };
}

export function setGroupPhoto(group: Group, photoUri: string | null, actorId: string): AddMemberResult {
  if (!isAdmin(group, actorId)) return { group, ok: false, message: "Only group admins can change the group photo." };
  return { group: { ...group, settings: { ...group.settings, photoUri } }, ok: true, message: photoUri ? "Group photo updated." : "Group photo removed." };
}

/** Muting is per member, so it never needs admin rights. */
export function toggleGroupMute(group: Group): Group {
  return { ...group, settings: { ...group.settings, muted: !group.settings.muted } };
}

export function memberCountLabel(group: Group): string {
  const count = group.members.length;
  return `${count} ${count === 1 ? "member" : "members"}`;
}

export function roleLabel(role: GroupRole): string {
  return role === "admin" ? "Admin" : "Member";
}

/** Group calls need premium on every participant; the gate lists who is missing it. */
export function groupCallGate(group: Group): { allowed: boolean; message: string; missing: string[] } {
  const missing = group.members.filter((member) => !member.paidTier).map((member) => member.name.split(" ")[0]);
  if (missing.length === 0) return { allowed: true, message: "Starting the group call…", missing: [] };
  return {
    allowed: false,
    message: `Group calls are part of Trufrenz Premium. ${missing.join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} on Premium yet — invite them to upgrade, or start a 1:1 call instead.`,
    missing,
  };
}

/** Polls inside a group can only be voted on by that group's members. */
export function groupVoterIds(group: Group): string[] {
  return group.members.map((member) => member.id);
}

/** A follow-up link back to a plan from the Meetups tab. */
export function planFollowUpHref(kind: "hangout" | "meetup", id: string): string {
  return `trufrenz://${kind}/${id}`;
}

/** Chat notifications respect the per-chat mute setting. */
export function shouldNotifyForChat(options: { muted: boolean; archived: boolean; kind: "message" | "plan-status" | "plan-reminder" }): { notify: boolean; reason: string } {
  if (options.archived) return { notify: false, reason: "This chat is archived." };
  if (options.kind === "plan-reminder") return { notify: true, reason: "Day-of plan reminders always arrive." };
  if (options.muted) return { notify: false, reason: "Muted chats stay quiet." };
  return { notify: true, reason: "Notifications are on for this chat." };
}

/** Friend-request declines are always silent, with no leakage either way. */
export function friendRequestNotification(event: "received" | "accepted" | "declined"): { notify: boolean; message: string } {
  if (event === "declined") return { notify: false, message: "Declines are silent. The sender is never told." };
  if (event === "accepted") return { notify: true, message: "Your request was accepted. You can start chatting." };
  return { notify: true, message: "Someone nearby would like to be friends." };
}

export type CallDirection = "incoming" | "outgoing";
export type CallState = "ringing" | "connected" | "declined" | "missed" | "ended";

export type CallSession = {
  id: string;
  peerName: string;
  peerVerified: boolean;
  video: boolean;
  direction: CallDirection;
  state: CallState;
  /** Calls keep ringing in the background via push, so this drives the native UI. */
  backgroundCapable: boolean;
};

export function createCallSession(input: { id: string; peerName: string; peerVerified: boolean; video: boolean; direction: CallDirection }): CallSession {
  return { ...input, state: "ringing", backgroundCapable: true };
}

/** The call UI shows a verified badge so an impostor is easier to spot. */
export function callHeaderLabel(session: CallSession): string {
  const first = session.peerName.split(" ")[0] || session.peerName;
  const kind = session.video ? "Video call" : "Call";
  if (session.direction === "incoming") return `Incoming ${kind.toLowerCase()} · ${first}`;
  return `${kind} · ${first}`;
}

export function callStateCopy(session: CallSession): string {
  switch (session.state) {
    case "ringing": return session.direction === "incoming" ? "is calling you" : "Ringing…";
    case "connected": return "Connected · end-to-end encrypted";
    case "declined": return "Declined. They were not notified in a pushy way.";
    case "missed": return "Missed call";
    case "ended": return "Call ended";
  }
}

export function answerCall(session: CallSession): CallSession {
  return { ...session, state: "connected" };
}

export function declineCall(session: CallSession): CallSession {
  return { ...session, state: "declined" };
}

export function endCall(session: CallSession): CallSession {
  return { ...session, state: "ended" };
}

export function markMissed(session: CallSession): CallSession {
  if (session.state !== "ringing") return session;
  return { ...session, state: "missed" };
}
