import { describe, expect, it } from "vitest";

import {
  MAX_GROUP_MEMBERS,
  addMember,
  answerCall,
  callHeaderLabel,
  callStateCopy,
  createCallSession,
  createGroup,
  declineCall,
  endCall,
  friendRequestNotification,
  groupCallGate,
  groupVoterIds,
  invitableFriends,
  isAdmin,
  leaveGroup,
  markMissed,
  memberCountLabel,
  planFollowUpHref,
  removeMember,
  renameGroup,
  roleLabel,
  setGroupPhoto,
  shouldNotifyForChat,
  toggleGroupMute,
  transferAdmin,
  type GroupMember,
} from "../lib/group-management";

const me: GroupMember = { id: "me", name: "Alex Rivera", role: "admin", paidTier: true };
const maya: GroupMember = { id: "maya", name: "Maya Chen", role: "member", paidTier: true };
const sam: GroupMember = { id: "sam", name: "Sam Rivera", role: "member", paidTier: false };

function buildGroup() {
  return createGroup({ id: "g1", name: "Sunday Walk Club", creator: me, members: [maya] });
}

describe("group creation", () => {
  it("makes the creator the admin and everyone else a member", () => {
    const group = buildGroup();
    expect(isAdmin(group, "me")).toBe(true);
    expect(isAdmin(group, "maya")).toBe(false);
    expect(group.members).toHaveLength(2);
    expect(memberCountLabel(group)).toBe("2 members");
    expect(roleLabel("admin")).toBe("Admin");
  });
  it("falls back to a name when one is not supplied", () => {
    expect(createGroup({ id: "g2", name: "   ", creator: me }).settings.name).toBe("New group");
  });
});

describe("invite-only membership", () => {
  it("offers only accepted friends who are not already members", () => {
    const group = buildGroup();
    expect(invitableFriends(group, ["maya", "sam", "noah"])).toEqual(["sam", "noah"]);
  });
  it("refuses strangers so groups are never open", () => {
    const result = addMember(buildGroup(), { id: "zoe", name: "Zoe Park", role: "member" }, ["maya", "sam"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Only accepted friends");
  });
  it("refuses duplicate members", () => {
    const result = addMember(buildGroup(), maya, ["maya"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already in this group");
  });
  it("adds an accepted friend and caps the group size", () => {
    const added = addMember(buildGroup(), { id: "sam", name: "Sam Rivera", role: "member" }, ["sam"]);
    expect(added.ok).toBe(true);
    expect(added.group.members).toHaveLength(3);
    expect(added.message).toContain("Sam was added");

    let full = buildGroup();
    for (let index = 0; index < MAX_GROUP_MEMBERS + 2; index += 1) {
      full = addMember(full, { id: `friend-${index}`, name: `Friend ${index}`, role: "member" }, Array.from({ length: MAX_GROUP_MEMBERS + 2 }, (_, i) => `friend-${i}`)).group;
    }
    expect(full.members).toHaveLength(MAX_GROUP_MEMBERS);
    expect(addMember(full, { id: "late", name: "Late Friend", role: "member" }, ["late"]).message).toContain("Start another circle");
  });
});

describe("admin controls", () => {
  it("hides remove and transfer from non-admins", () => {
    const group = buildGroup();
    expect(removeMember(group, "maya", "maya").message).toContain("Only group admins");
    expect(transferAdmin(group, "me", "maya").message).toContain("Only group admins");
    expect(renameGroup(group, "New name", "maya").message).toContain("Only group admins");
    expect(setGroupPhoto(group, "uri", "maya").message).toContain("Only group admins");
  });
  it("removes a member as an admin", () => {
    const result = removeMember(buildGroup(), "maya", "me");
    expect(result.ok).toBe(true);
    expect(result.group.members.map((member) => member.id)).toEqual(["me"]);
    expect(result.message).toContain("Maya was removed");
  });
  it("never removes the last admin", () => {
    const result = removeMember(buildGroup(), "me", "me");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Transfer the admin role");
  });
  it("transfers the admin role so exactly one admin remains", () => {
    const result = transferAdmin(buildGroup(), "maya", "me");
    expect(result.ok).toBe(true);
    const roles = result.group.members.reduce<Record<string, string>>((map, member) => ({ ...map, [member.id]: member.role }), {});
    expect(roles).toEqual({ me: "member", maya: "admin" });
    expect(result.message).toContain("Maya is now the group admin");
    expect(transferAdmin(result.group, "maya", "maya").message).toContain("already an admin");
  });
  it("blocks leaving when you are the only admin of a populated group", () => {
    expect(leaveGroup(buildGroup(), "me").ok).toBe(false);
    expect(leaveGroup(buildGroup(), "me").message).toContain("Hand the admin role");
    expect(leaveGroup(buildGroup(), "maya").ok).toBe(true);
  });
  it("renames and re-photographs a group as admin", () => {
    expect(renameGroup(buildGroup(), "  Tuesday Walkers  ", "me").group.settings.name).toBe("Tuesday Walkers");
    expect(renameGroup(buildGroup(), "   ", "me").ok).toBe(false);
    expect(setGroupPhoto(buildGroup(), "local-uri", "me").group.settings.photoUri).toBe("local-uri");
    expect(setGroupPhoto(buildGroup(), null, "me").group.settings.photoUri).toBeNull();
  });
  it("lets anyone mute their own copy of the group", () => {
    const muted = toggleGroupMute(buildGroup());
    expect(muted.settings.muted).toBe(true);
    expect(toggleGroupMute(muted).settings.muted).toBe(false);
  });
  it("builds poll voter lists from group members only", () => {
    expect(groupVoterIds(buildGroup())).toEqual(["me", "maya"]);
  });
});

describe("group calls", () => {
  it("blocks the call and names who is missing premium", () => {
    const group = createGroup({ id: "g3", name: "Pottery", creator: me, members: [maya, sam] });
    const gate = groupCallGate(group);
    expect(gate.allowed).toBe(false);
    expect(gate.missing).toEqual(["Sam"]);
    expect(gate.message).toContain("Premium");
  });
  it("allows the call when every participant has premium", () => {
    const gate = groupCallGate(createGroup({ id: "g4", name: "Studio", creator: me, members: [maya] }));
    expect(gate.allowed).toBe(true);
  });
});

describe("call sessions", () => {
  it("starts ringing and can be answered, declined, or missed", () => {
    const incoming = createCallSession({ id: "c1", peerName: "Maya Chen", peerVerified: true, video: false, direction: "incoming" });
    expect(incoming.state).toBe("ringing");
    expect(incoming.backgroundCapable).toBe(true);
    expect(callHeaderLabel(incoming)).toBe("Incoming call · Maya");
    expect(callStateCopy(incoming)).toContain("is calling you");
    expect(answerCall(incoming).state).toBe("connected");
    expect(declineCall(incoming).state).toBe("declined");
    expect(markMissed(incoming).state).toBe("missed");
    expect(markMissed(answerCall(incoming)).state).toBe("connected");
    expect(endCall(answerCall(incoming)).state).toBe("ended");
  });
  it("labels outgoing video calls and connected state", () => {
    const outgoing = createCallSession({ id: "c2", peerName: "Sam Rivera", peerVerified: false, video: true, direction: "outgoing" });
    expect(callHeaderLabel(outgoing)).toBe("Video call · Sam");
    expect(callStateCopy(outgoing)).toBe("Ringing…");
    expect(callStateCopy(answerCall(outgoing))).toContain("end-to-end encrypted");
  });
});

describe("chat notifications", () => {
  it("stays quiet for muted chats but always sends day-of reminders", () => {
    expect(shouldNotifyForChat({ muted: true, archived: false, kind: "message" }).notify).toBe(false);
    expect(shouldNotifyForChat({ muted: true, archived: false, kind: "plan-reminder" }).notify).toBe(true);
    expect(shouldNotifyForChat({ muted: false, archived: false, kind: "plan-status" }).notify).toBe(true);
    expect(shouldNotifyForChat({ muted: false, archived: true, kind: "message" }).notify).toBe(false);
  });
  it("keeps declined friend requests completely silent", () => {
    expect(friendRequestNotification("declined").notify).toBe(false);
    expect(friendRequestNotification("declined").message).toContain("never told");
    expect(friendRequestNotification("accepted").notify).toBe(true);
    expect(friendRequestNotification("received").message).toContain("would like to be friends");
  });
  it("exposes a stable follow-up link for plans", () => {
    expect(planFollowUpHref("meetup", "plan-9")).toBe("trufrenz://meetup/plan-9");
  });
});
