import { describe, expect, it } from "vitest";

import {
  EMPTY_THREAD_STATE,
  clearThreadUnread,
  isMarkedUnread,
  markThreadUnread,
  markedUnreadCount,
  firstUnreadIndex,
  hasSeenSafetyNote,
  markSafetyNoteSeen,
  markThreadRead,
  parseThreadState,
  readMarkerLabel,
  serializeThreadState,
  unreadForRow,
  unreadFromThem,
  type TrackableMessage,
} from "../lib/thread-state";
import {
  CLOSE_DRAG_RATIO,
  MIN_CLOSE_DRAG,
  closeDragOffset,
  closeDragThreshold,
  decideThreadDrag,
} from "../lib/thread-gesture";

const msg = (id: string, from: "me" | "them"): TrackableMessage => ({ id, from });

describe("the read marker", () => {
  const thread = [msg("m1", "them"), msg("m2", "me"), msg("m3", "them"), msg("m4", "them")];

  it("places the divider at the first message the member has not seen", () => {
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "m2");

    expect(firstUnreadIndex(thread, state, "maya")).toBe(2);
  });

  it("counts only what arrived from the other person", () => {
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "m2");

    // m3 and m4 are theirs; m2, the member's own message, is behind the marker.
    expect(unreadFromThem(thread, state, "maya")).toBe(2);
  });

  it("reports nothing new once the member reaches the end", () => {
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "m4");

    expect(firstUnreadIndex(thread, state, "maya")).toBeNull();
    expect(unreadFromThem(thread, state, "maya")).toBe(0);
  });

  it("claims nothing when the marker points at a message that is gone", () => {
    // A thread restored from another device, or one whose messages were deleted,
    // cannot place a divider — and must not invent one.
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "deleted-message");

    expect(firstUnreadIndex(thread, state, "maya")).toBeNull();
  });

  it("marks the whole thread when nothing has been read yet", () => {
    expect(firstUnreadIndex(thread, EMPTY_THREAD_STATE, "maya")).toBe(0);
  });

  it("uses the top boundary for a never-opened thread", () => {
    // Index zero is a real position: the divider belongs immediately before the
    // first message rather than disappearing just because there is no earlier
    // message to sit behind it.
    const start = firstUnreadIndex(thread, EMPTY_THREAD_STATE, "maya");

    expect(start).toBe(0);
    expect(thread.slice(start ?? 0).filter((message) => message.from === "them")).toHaveLength(3);
  });

  it("has nothing to mark in an empty thread", () => {
    expect(firstUnreadIndex([], EMPTY_THREAD_STATE, "maya")).toBeNull();
  });

  it("survives a reload", () => {
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "m3");

    expect(parseThreadState(serializeThreadState(state)).reads.maya).toBe("m3");
  });

  it("is a no-op when the marker has not moved", () => {
    const once = markThreadRead(EMPTY_THREAD_STATE, "maya", "m2");

    // Same reference means no render and no write, which matters because this
    // runs on every message while a thread is open.
    expect(markThreadRead(once, "maya", "m2")).toBe(once);
  });
});

describe("the unread badge on a conversation row", () => {
  const thread = [msg("m1", "them"), msg("m2", "them")];

  it("keeps the seeded count for a thread never opened", () => {
    const badge = unreadForRow({ seedUnread: 3, messages: thread, state: EMPTY_THREAD_STATE, chatId: "maya" });

    expect(badge).toBe(3);
  });

  it("clears once the member has opened the thread", () => {
    // The reported problem: a seeded badge stayed lit forever, so a conversation
    // the member had already read still claimed unread messages.
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "m2");
    const badge = unreadForRow({ seedUnread: 3, messages: thread, state, chatId: "maya" });

    expect(badge).toBe(0);
  });

  it("counts what really arrived after the member left", () => {
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "m1");
    const badge = unreadForRow({ seedUnread: 0, messages: thread, state, chatId: "maya" });

    expect(badge).toBe(1);
  });
});

describe("the safety note", () => {
  it("is shown until it has been seen", () => {
    expect(hasSeenSafetyNote(EMPTY_THREAD_STATE, "maya")).toBe(false);
  });

  it("folds away per conversation once dismissed", () => {
    const state = markSafetyNoteSeen(EMPTY_THREAD_STATE, "maya");

    expect(hasSeenSafetyNote(state, "maya")).toBe(true);
    // Another conversation has not shown it yet, so it still appears there.
    expect(hasSeenSafetyNote(state, "sam")).toBe(false);
  });

  it("is not recorded twice", () => {
    const once = markSafetyNoteSeen(EMPTY_THREAD_STATE, "maya");

    expect(markSafetyNoteSeen(once, "maya")).toBe(once);
  });

  it("survives a reload", () => {
    const state = markSafetyNoteSeen(EMPTY_THREAD_STATE, "maya");

    expect(parseThreadState(serializeThreadState(state)).notesSeen).toEqual(["maya"]);
  });
});

describe("a corrupt stored record", () => {
  it("falls back to nothing seen rather than throwing", () => {
    expect(parseThreadState("{not json")).toEqual(EMPTY_THREAD_STATE);
    expect(parseThreadState(null)).toEqual(EMPTY_THREAD_STATE);
  });

  it("keeps the readable half when the other is damaged", () => {
    const restored = parseThreadState(JSON.stringify({ reads: { maya: "m2", broken: 5 }, notesSeen: "nope" }));

    expect(restored.reads).toEqual({ maya: "m2" });
    expect(restored.notesSeen).toEqual([]);
  });
});

describe("the marker label", () => {
  it("reads naturally at every count", () => {
    expect(readMarkerLabel(0)).toBe("Caught up");
    expect(readMarkerLabel(1)).toBe("1 new message");
    expect(readMarkerLabel(4)).toBe("4 new messages");
  });
});

describe("dragging a conversation down to close it", () => {
  const base = { dx: 0, dy: 0, scrollOffset: 0, viewportHeight: 800, keyboardOpen: false };

  it("scales the threshold with the screen and keeps a floor", () => {
    expect(closeDragThreshold(800)).toBe(Math.round(800 * CLOSE_DRAG_RATIO));
    // A short screen must still be closable by a pull a thumb can make.
    expect(closeDragThreshold(200)).toBe(MIN_CLOSE_DRAG);
  });

  it("closes on a committed pull from the top", () => {
    const decision = decideThreadDrag({ ...base, dy: 200 });

    expect(decision.close).toBe(true);
  });

  it("springs back on a short pull", () => {
    const decision = decideThreadDrag({ ...base, dy: 40 });

    expect(decision.close).toBe(false);
    // It still follows the thumb, so the drag feels alive rather than inert.
    expect(decision.offset).toBeGreaterThan(0);
  });

  it("ignores an upward drag", () => {
    const decision = decideThreadDrag({ ...base, dy: -200 });

    expect(decision.close).toBe(false);
    expect(decision.offset).toBe(0);
  });

  it("never closes while the member is reading back through a thread", () => {
    // Pulling down mid-conversation is how a member scrolls back, not how they
    // leave, so a drag below the top edge is not a dismissal.
    const decision = decideThreadDrag({ ...base, dy: 300, scrollOffset: 120 });

    expect(decision.close).toBe(false);
    expect(decision.offset).toBe(0);
  });

  it("tolerates the few points of drift a list reports at rest", () => {
    expect(decideThreadDrag({ ...base, dy: 300, scrollOffset: 3 }).close).toBe(true);
  });

  it("is not a dismissal while the keyboard is up", () => {
    // The keyboard owns that drag: the member is putting the keys away.
    const decision = decideThreadDrag({ ...base, dy: 300, keyboardOpen: true });

    expect(decision.close).toBe(false);
    expect(decision.offset).toBe(0);
  });

  it("ignores a mostly horizontal drag", () => {
    // A sideways drag belongs to whatever the finger is over, not the screen.
    const decision = decideThreadDrag({ ...base, dx: 200, dy: 120 });

    expect(decision.close).toBe(false);
  });

  it("tracks progress towards the threshold for the fade", () => {
    const threshold = closeDragThreshold(800);

    expect(decideThreadDrag({ ...base, dy: 0 }).progress).toBe(0);
    expect(decideThreadDrag({ ...base, dy: threshold }).progress).toBe(1);
    // Past the threshold it stays capped, so nothing overflows.
    expect(decideThreadDrag({ ...base, dy: threshold * 3 }).progress).toBe(1);
  });

  it("damps the travel so the app is never dragged off the screen", () => {
    expect(closeDragOffset(100)).toBeLessThan(100);
    expect(closeDragOffset(-50)).toBe(0);
  });
});
describe("the marker while the member is in the thread", () => {
  it("is captured before the visit marks the thread read", () => {
    // Marking a thread read happens the moment it opens, so the position has to
    // be captured first or the divider would vanish as the member arrived — and a
    // thread shorter than one screen would never show one at all.
    const thread = [msg("m1", "them"), msg("m2", "them")];
    const opening = firstUnreadIndex(thread, EMPTY_THREAD_STATE, "maya");

    expect(opening).toBe(0);

    // The visit then advances the stored marker...
    const visited = markThreadRead(EMPTY_THREAD_STATE, "maya", "m2");
    expect(firstUnreadIndex(thread, visited, "maya")).toBeNull();
    // ...while the captured position still places the divider for this visit.
    expect(opening).toBe(0);
  });

  it("clears the badge even though the divider stays on screen", () => {
    const thread = [msg("m1", "them"), msg("m2", "them")];
    const visited = markThreadRead(EMPTY_THREAD_STATE, "maya", "m2");

    // These two are deliberately independent: the divider belongs to the visit,
    // the badge belongs to the stored marker.
    expect(unreadForRow({ seedUnread: 2, messages: thread, state: visited, chatId: "maya" })).toBe(0);
  });
});
describe("when the divider is worth drawing", () => {
  it("is drawn for a thread with unread messages from the other person", () => {
    const thread = [msg("m1", "me"), msg("m2", "them")];
    const start = firstUnreadIndex(thread, EMPTY_THREAD_STATE, "maya");

    expect(start).toBe(0);
    expect(unreadFromThem(thread, EMPTY_THREAD_STATE, "maya")).toBeGreaterThan(0);
  });

  it("is not drawn when the only unseen messages are the member's own", () => {
    // Nothing new arrived from the other person, so a marker would be noise.
    const thread = [msg("m1", "them"), msg("m2", "me")];
    const state = markThreadRead(EMPTY_THREAD_STATE, "maya", "m1");

    expect(firstUnreadIndex(thread, state, "maya")).toBe(1);
    expect(unreadFromThem(thread, state, "maya")).toBe(0);
  });
});


describe("the member's own unread reminder", () => {
  it("starts with nothing marked", () => {
    expect(EMPTY_THREAD_STATE.unreadFlags).toEqual([]);
    expect(isMarkedUnread(EMPTY_THREAD_STATE, "maya")).toBe(false);
  });

  it("marks a conversation unread without moving the read marker", () => {
    /*
     * The member did read those messages. Moving the marker back would also hide
     * the divider that says where they stopped, so the reminder is stored beside
     * the history rather than editing it.
     */
    const read = markThreadRead(EMPTY_THREAD_STATE, "maya", "m3");
    const marked = markThreadUnread(read, "maya");
    expect(marked.reads.maya).toBe("m3");
    expect(isMarkedUnread(marked, "maya")).toBe(true);
  });

  it("counts as unread even when nothing new arrived", () => {
    const read = markThreadRead(EMPTY_THREAD_STATE, "maya", "m3");
    const marked = markThreadUnread(read, "maya");
    const count = unreadForRow({
      seedUnread: 0,
      messages: [{ id: "m1", from: "them" }, { id: "m2", from: "them" }, { id: "m3", from: "me" }],
      state: marked,
      chatId: "maya",
    });
    expect(count).toBeGreaterThan(0);
  });

  it("clears when the thread is opened", () => {
    const marked = markThreadUnread(EMPTY_THREAD_STATE, "maya");
    const cleared = clearThreadUnread(marked, "maya");
    expect(isMarkedUnread(cleared, "maya")).toBe(false);
    expect(markedUnreadCount(cleared)).toBe(0);
  });

  it("is idempotent and ignores an empty id", () => {
    const once = markThreadUnread(EMPTY_THREAD_STATE, "maya");
    expect(markThreadUnread(once, "maya").unreadFlags).toEqual(["maya"]);
    expect(markThreadUnread(EMPTY_THREAD_STATE, "").unreadFlags).toEqual([]);
  });

  it("survives a round trip through storage", () => {
    const marked = markThreadUnread(EMPTY_THREAD_STATE, "maya");
    const restored = parseThreadState(serializeThreadState(marked));
    expect(isMarkedUnread(restored, "maya")).toBe(true);
  });

  it("reads old stored records that predate the reminder", () => {
    const restored = parseThreadState(JSON.stringify({ reads: { maya: "m1" }, notesSeen: ["maya"] }));
    expect(restored.unreadFlags).toEqual([]);
    expect(restored.reads.maya).toBe("m1");
  });

  it("drops unusable entries from a stored reminder list", () => {
    const restored = parseThreadState(JSON.stringify({ unreadFlags: ["maya", 7, null, ""] }));
    expect(restored.unreadFlags).toEqual(["maya"]);
  });
});
