import { describe, expect, it } from "vitest";

import {
  EMPTY_CONNECTION_SYNC,
  acknowledge,
  clearConnection,
  connectionStateFor,
  graphFromRows,
  overlayPending,
  parseConnectionSync,
  pendingRows,
  queueChange,
  queueRemoval,
  reconcileOnLaunch,
  serializeConnectionSync,
  setConnectionState,
  type ConnectionSync,
} from "../lib/connection-sync";
import {
  CHAT_PREFERENCES_STORAGE_KEY,
  compactChatPreferences,
  parseChatPreferences,
  preferencesAreEmpty,
  serializeChatPreferences,
} from "../lib/chat-preferences";
import { DEFAULT_CHAT_ROW_STATE } from "../lib/chat-extras";
import type { FriendshipGraph } from "../lib/friendship-store";

const emptyGraph = (): FriendshipGraph => ({ accepted: [], requested: [], incoming: [], declined: [] });

describe("connection sync", () => {
  it("stores nothing for a member who has never pushed", () => {
    expect(EMPTY_CONNECTION_SYNC).toMatchObject({ pending: {}, removed: [], pushed: false });
  });

  it("survives a corrupt record without losing the shape", () => {
    const parsed = parseConnectionSync("{not json");
    expect(parsed).toEqual({ pending: {}, removed: [], pushed: false });
    expect(parseConnectionSync(null).pushed).toBe(false);
  });

  it("round-trips queued changes and removals", () => {
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueChange(sync, "maya", "accepted");
    sync = queueRemoval(sync, "sam");
    const restored = parseConnectionSync(serializeConnectionSync(sync));
    expect(restored.pending).toEqual({ maya: "accepted" });
    expect(restored.removed).toEqual(["sam"]);
  });

  it("keeps only the latest state for a person", () => {
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueChange(sync, "maya", "requested");
    sync = queueChange(sync, "maya", "accepted");
    expect(sync.pending).toEqual({ maya: "accepted" });
  });

  it("lets a later reconnection cancel a queued removal", () => {
    /*
     * The member blocks someone and then reconnects before the batch leaves. The
     * row must end up as a friend rather than being deleted by the stale removal.
     */
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueRemoval(sync, "maya");
    sync = queueChange(sync, "maya", "accepted");
    expect(sync.removed).toEqual([]);
    expect(sync.pending).toEqual({ maya: "accepted" });
  });

  it("drops a queued state when the person is removed instead", () => {
    /*
     * Sending "accepted" and "removed" for one person in the same batch would
     * leave the outcome down to which write landed last.
     */
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueChange(sync, "maya", "accepted");
    sync = queueRemoval(sync, "maya");
    expect(sync.pending).toEqual({});
    expect(sync.removed).toEqual(["maya"]);
  });

  it("sends only what has changed", () => {
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueChange(sync, "maya", "accepted");
    sync = queueChange(sync, "sam", "requested");
    expect(pendingRows(sync)).toEqual([
      { peerId: "maya", state: "accepted" },
      { peerId: "sam", state: "requested" },
    ]);
  });

  it("clears the rows a successful write covered, and keeps newer ones", () => {
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueChange(sync, "maya", "accepted");
    sync = queueChange(sync, "sam", "requested");
    const sent = pendingRows(sync);
    // The member taps something else while the request is in flight.
    sync = queueChange(sync, "sam", "declined");
    const after = acknowledge(sync, sent);
    expect(after.pending).toEqual({ sam: "declined" });
    expect(after.pushed).toBe(true);
  });

  it("clears the removals a successful write covered", () => {
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueRemoval(sync, "maya");
    sync = queueRemoval(sync, "sam");
    const sentRemovals = ["maya", "sam"];
    const after = acknowledge(sync, [], sentRemovals);
    expect(after.removed).toEqual([]);
  });

  it("keeps a removal that was queued while the request was in flight", () => {
    /*
     * The member blocks someone else after the batch has already left. That
     * removal was never sent, so dropping it would lose the block entirely.
     */
    let sync: ConnectionSync = EMPTY_CONNECTION_SYNC;
    sync = queueRemoval(sync, "maya");
    const sentRemovals = ["maya"];
    sync = queueRemoval(sync, "sam");
    const after = acknowledge(sync, [], sentRemovals);
    expect(after.removed).toEqual(["sam"]);
  });

  it("puts a person into exactly one state", () => {
    let graph = emptyGraph();
    graph = setConnectionState(graph, "maya", "requested");
    graph = setConnectionState(graph, "maya", "accepted");
    expect(graph.requested).toEqual([]);
    expect(graph.accepted).toEqual(["maya"]);
    expect(connectionStateFor(graph, "maya")).toBe("accepted");
  });

  it("forgets a person entirely when the connection is cleared", () => {
    let graph = emptyGraph();
    graph = setConnectionState(graph, "maya", "accepted");
    graph = clearConnection(graph, "maya");
    expect(connectionStateFor(graph, "maya")).toBeNull();
  });

  it("overlays unsent changes on the server's version", () => {
    const server = graphFromRows([{ peerId: "maya", state: "accepted" }]);
    const merged = overlayPending(server, { sam: "requested" });
    expect(merged.accepted).toEqual(["maya"]);
    expect(merged.requested).toEqual(["sam"]);
  });

  it("treats an empty server as authoritative only once this device has pushed", () => {
    /*
     * The rule that stops an existing install losing its circle: an empty server
     * on the very first sync is a brand-new account, not a deletion.
     */
    const local = graphFromRows([{ peerId: "maya", state: "accepted" }]);
    const empty = emptyGraph();
    expect(reconcileOnLaunch({ local, server: empty, pending: {}, hasPushed: false }).accepted).toEqual(["maya"]);
    expect(reconcileOnLaunch({ local, server: empty, pending: {}, hasPushed: true }).accepted).toEqual([]);
  });

  it("still applies a queued change over an empty server", () => {
    const outcome = reconcileOnLaunch({
      local: emptyGraph(),
      server: emptyGraph(),
      pending: { maya: "accepted" },
      hasPushed: true,
    });
    expect(outcome.accepted).toEqual(["maya"]);
  });
});

describe("chat preferences", () => {
  it("uses defaults for a chat with no stored entry", () => {
    expect(parseChatPreferences(null)["anything"]).toBeUndefined();
  });

  it("round-trips mute and archive", () => {
    const stored = parseChatPreferences(serializeChatPreferences({
      maya: { muted: true, archived: false, readOnly: false },
      group: { muted: false, archived: true, readOnly: true },
    }));
    expect(stored.maya).toEqual({ muted: true, archived: false, readOnly: false });
    expect(stored.group).toEqual({ muted: false, archived: true, readOnly: true });
  });

  it("survives corrupt stored data", () => {
    expect(parseChatPreferences("{{")).toEqual({});
    expect(parseChatPreferences("[1,2,3]")).toEqual({});
  });

  it("drops entries that are back at their defaults", () => {
    /*
     * Un-muting should not leave a permanent record behind, or the stored file
     * would grow with every toggle the member ever made.
     */
    const compacted = compactChatPreferences({
      maya: { ...DEFAULT_CHAT_ROW_STATE },
      sam: { muted: true, archived: false, readOnly: false },
    });
    expect(Object.keys(compacted)).toEqual(["sam"]);
    expect(preferencesAreEmpty({ maya: { ...DEFAULT_CHAT_ROW_STATE } })).toBe(true);
  });

  it("ignores non-boolean stored flags rather than trusting them", () => {
    const stored = parseChatPreferences(JSON.stringify({ maya: { muted: "yes", archived: 1, readOnly: null } }));
    expect(stored.maya).toBeUndefined();
  });

  it("drops a chat with only default flags on read", () => {
    const stored = parseChatPreferences(JSON.stringify({ maya: { muted: false, archived: false, readOnly: false } }));
    expect(stored.maya).toBeUndefined();
  });

  it("names its storage key", () => {
    expect(CHAT_PREFERENCES_STORAGE_KEY).toBe("trufrenz.chat-preferences.v1");
  });
});