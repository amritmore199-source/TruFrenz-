import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHAT_ROW_STATE,
  DEFAULT_CHAT_PRIVACY,
  MAX_VOICE_SECONDS,
  applyReaction,
  archiveOnUnfriend,
  availabilityView,
  callGate,
  canSendTo,
  clampVoiceSeconds,
  deleteThreadConfirmation,
  displayUnread,
  emptyChatsCopy,
  messagePreview,
  outgoingReceipt,
  rowStateFor,
  shouldShowReceipt,
  splitByArchive,
  summariseReactions,
  toggleArchived,
  toggleMuted,
  unfriendConfirmation,
  unreadTotal,
} from "../lib/chat-extras";

describe("availability indicators", () => {
  it("shows a pulsing green dot only for members who are available", () => {
    expect(availabilityView("available")).toEqual({ tone: "available", pulses: true, label: "Available now" });
    expect(availabilityView("away").pulses).toBe(false);
    expect(availabilityView(undefined).tone).toBe("unavailable");
    expect(availabilityView("unavailable").label).toBe("Not available");
  });
});

describe("chat row state", () => {
  it("defaults to a normal, unmuted, unsendable-blocked row", () => {
    expect(rowStateFor({}, "maya")).toEqual(DEFAULT_CHAT_ROW_STATE);
    expect(canSendTo(DEFAULT_CHAT_ROW_STATE)).toBe(true);
  });
  it("toggles mute and archive independently", () => {
    let states = toggleMuted({}, "maya");
    expect(rowStateFor(states, "maya").muted).toBe(true);
    states = toggleArchived(states, "maya");
    expect(rowStateFor(states, "maya")).toMatchObject({ muted: true, archived: true, readOnly: false });
    states = toggleMuted(states, "maya");
    expect(rowStateFor(states, "maya").muted).toBe(false);
  });
  it("archives and freezes a thread when someone unfriends", () => {
    const states = archiveOnUnfriend({}, "maya");
    const state = rowStateFor(states, "maya");
    expect(state).toMatchObject({ archived: true, readOnly: true });
    expect(canSendTo(state)).toBe(false);
  });
  it("splits archived threads out of the main inbox", () => {
    const chats = [{ id: "maya" }, { id: "sam" }, { id: "noah" }];
    const states = archiveOnUnfriend({}, "sam");
    expect(splitByArchive(chats, states)).toEqual({ active: ["maya", "noah"], archived: ["sam"] });
  });
  it("writes a clear unfriend confirmation that promises messages are kept", () => {
    const copy = unfriendConfirmation("Maya Chen");
    expect(copy.title).toBe("Unfriend Maya?");
    expect(copy.body).toContain("read-only");
    expect(copy.body).toContain("stay on your device");
    expect(deleteThreadConfirmation("Maya Chen").body).toContain("cannot be undone");
  });
  it("suppresses unread badges on muted chats and ignores archived ones in totals", () => {
    expect(displayUnread(4, { muted: true, archived: false, readOnly: false })).toBe(0);
    expect(displayUnread(4, DEFAULT_CHAT_ROW_STATE)).toBe(4);
    const chats = [{ id: "maya", unread: 2 }, { id: "sam", unread: 3 }];
    expect(unreadTotal(chats, {})).toBe(5);
    expect(unreadTotal(chats, toggleMuted({}, "sam"))).toBe(2);
    expect(unreadTotal(chats, archiveOnUnfriend({}, "sam"))).toBe(2);
  });
});

describe("read receipt privacy", () => {
  it("keeps read receipts off by default", () => {
    expect(DEFAULT_CHAT_PRIVACY.shareReadReceipts).toBe(false);
  });
  it("downgrades a read receipt to delivered when the member opts out", () => {
    expect(outgoingReceipt("read", false)).toBe("delivered");
    expect(outgoingReceipt("read", true)).toBe("read");
    expect(outgoingReceipt("sent", false)).toBe("sent");
    expect(outgoingReceipt(undefined, true)).toBeNull();
  });
  it("never shows receipts on incoming messages", () => {
    expect(shouldShowReceipt({ from: "them", receipt: "read" }, true)).toBe(false);
    expect(shouldShowReceipt({ from: "me", receipt: "read" }, true)).toBe(true);
    expect(shouldShowReceipt({ from: "me", receipt: "read" }, false)).toBe(false);
    expect(shouldShowReceipt({ from: "me", receipt: "sent" }, false)).toBe(true);
  });
});

describe("message kinds", () => {
  it("summarises photos, voice notes, locations, and plan cards", () => {
    expect(messagePreview("photo")).toBe("📷 Photo");
    expect(messagePreview("voice", { durationSeconds: 12 })).toBe("🎤 Voice note · 12s");
    expect(messagePreview("location", { place: "Alta Plaza Park" })).toBe("📍 Alta Plaza Park");
    expect(messagePreview("plan", { planTitle: "A gentle hangout" })).toBe("🗓️ A gentle hangout");
    expect(messagePreview("text", { text: "hello" })).toBe("hello");
  });
  it("keeps voice notes within a sensible cap", () => {
    expect(clampVoiceSeconds(0)).toBe(1);
    expect(clampVoiceSeconds(999)).toBe(MAX_VOICE_SECONDS);
    expect(clampVoiceSeconds(Number.NaN)).toBe(1);
    expect(clampVoiceSeconds(18.4)).toBe(18);
  });
});

describe("reactions", () => {
  it("adds a reaction and marks it as the member's own", () => {
    expect(applyReaction([], "❤️")).toEqual([{ emoji: "❤️", count: 1, mine: true }]);
  });
  it("removes the reaction when the same emoji is tapped twice", () => {
    expect(applyReaction([{ emoji: "❤️", count: 1, mine: true }], "❤️")).toEqual([]);
  });
  it("moves a single member reaction to a different emoji", () => {
    const start = [{ emoji: "❤️", count: 2, mine: true }, { emoji: "👍", count: 1, mine: false }];
    expect(applyReaction(start, "👍")).toEqual([
      { emoji: "❤️", count: 1, mine: false },
      { emoji: "👍", count: 2, mine: true },
    ]);
  });
  it("keeps other people's reactions when the member removes theirs", () => {
    const start = [{ emoji: "🌿", count: 3, mine: true }];
    expect(applyReaction(start, "🌿")).toEqual([{ emoji: "🌿", count: 2, mine: false }]);
  });
  it("summarises the busiest reactions first", () => {
    const reactions = [
      { emoji: "👍", count: 1, mine: false },
      { emoji: "❤️", count: 5, mine: true },
      { emoji: "🌿", count: 2, mine: false },
      { emoji: "☕", count: 4, mine: false },
    ];
    expect(summariseReactions(reactions).map((item) => item.emoji)).toEqual(["❤️", "☕", "🌿"]);
  });
});

describe("empty states", () => {
  it("prompts for a mutual accept when there are no friends yet", () => {
    const copy = emptyChatsCopy({ hasAcceptedFriends: false, filter: "All", search: "", archivedCount: 0 });
    expect(copy.title).toBe("Accept a friend request to start chatting");
    expect(copy.body).toContain("both say yes");
  });
  it("explains unread, group, and search empties differently", () => {
    expect(emptyChatsCopy({ hasAcceptedFriends: true, filter: "Unread", search: "", archivedCount: 0 }).title).toBe("All caught up");
    expect(emptyChatsCopy({ hasAcceptedFriends: true, filter: "Groups", search: "", archivedCount: 0 }).title).toBe("No groups yet");
    expect(emptyChatsCopy({ hasAcceptedFriends: true, filter: "All", search: "zoe", archivedCount: 0 }).title).toBe("No matches");
    expect(emptyChatsCopy({ hasAcceptedFriends: true, filter: "All", search: "", archivedCount: 0 }).title).toBe("Nothing here just yet");
  });
});

describe("call gating", () => {
  it("allows a call only when both sides have premium", () => {
    expect(callGate({ viewerPaid: true, recipientPaid: true }).allowed).toBe(true);
    expect(callGate({ viewerPaid: false, recipientPaid: true }).allowed).toBe(false);
    expect(callGate({ viewerPaid: false, recipientPaid: true }).message).toContain("Upgrade");
    expect(callGate({ viewerPaid: true, recipientPaid: false }).message).toContain("both sides");
  });
});
