import { describe, expect, it } from "vitest";

import {
  EMPTY_MESSAGE_SYNC,
  acknowledgeMessages,
  hasQueuedMessages,
  mergeThreads,
  messageFromRow,
  parseMessageSync,
  queueMessage,
  readSyncableMessage,
  rowFromMessage,
  serializeMessageSync,
} from "../lib/message-sync";
import type { Message } from "../lib/thread-messages";

const ownText: Message = {
  id: "device-1700000000000-a",
  from: "me",
  text: "A café sounds lovely.",
  time: "10:15 AM",
  kind: "text",
};

const ownPhoto: Message = {
  id: "device-1700000000000-b",
  from: "me",
  text: "The garden café",
  time: "10:16 AM",
  kind: "photo",
  mediaUri: "file://photo.jpg",
};

describe("message sync", () => {
  it("turns an outgoing text into a server-safe row", () => {
    const row = rowFromMessage("maya", ownText);
    expect(row).toEqual({
      clientId: ownText.id,
      chatId: "maya",
      text: "A café sounds lovely.",
      time: "10:15 AM",
      kind: "text",
    });
  });

  it("does not upload an incoming message", () => {
    // This is essential: the endpoint stores only what the member wrote. A device
    // must not be able to copy another person's message into its own server log.
    expect(rowFromMessage("maya", { ...ownText, from: "them" })).toBeNull();
  });

  it("does not sync a message without a usable chat id", () => {
    expect(rowFromMessage("", ownText)).toBeNull();
    expect(rowFromMessage("   ", ownText)).toBeNull();
  });

  it("queues each client id once, so a retry cannot duplicate a bubble", () => {
    const row = rowFromMessage("maya", ownText)!;
    const once = queueMessage(EMPTY_MESSAGE_SYNC, row);
    const twice = queueMessage(once, row);
    expect(once.queued).toEqual([row]);
    expect(twice.queued).toEqual([row]);
  });

  it("acknowledges only what the server confirmed", () => {
    const a = rowFromMessage("maya", ownText)!;
    const b = rowFromMessage("sam", { ...ownText, id: "device-b" })!;
    const queued = queueMessage(queueMessage(EMPTY_MESSAGE_SYNC, a), b);
    const after = acknowledgeMessages(queued, [a.clientId], 1_700_000_001_000);
    expect(after.queued).toEqual([b]);
    expect(after.lastPushedAt).toBe(1_700_000_001_000);
    expect(hasQueuedMessages(after)).toBe(true);
  });

  it("round-trips the queue through local persistence", () => {
    const row = rowFromMessage("maya", ownText)!;
    const sync = queueMessage(EMPTY_MESSAGE_SYNC, row);
    expect(parseMessageSync(serializeMessageSync(sync))).toEqual(sync);
  });

  it("falls back safely for corrupted local storage", () => {
    expect(parseMessageSync("not json")).toEqual(EMPTY_MESSAGE_SYNC);
    expect(parseMessageSync('{"queued":"not an array"}')).toEqual(EMPTY_MESSAGE_SYNC);
  });

  it("refuses malformed network rows before they reach a thread", () => {
    expect(readSyncableMessage({ clientId: "", chatId: "maya", text: "hi", time: "now", kind: "text" })).toBeNull();
    expect(readSyncableMessage({ clientId: "ok", chatId: "maya", text: "hi", time: "now", kind: "video" })).toBeNull();
  });

  it("recreates an app message from a valid server row", () => {
    const row = rowFromMessage("maya", ownPhoto)!;
    expect(messageFromRow(row)).toMatchObject({ id: ownPhoto.id, from: "me", kind: "photo" });
  });

  it("merges server history and an offline queue without duplicates", () => {
    const a = rowFromMessage("maya", ownText)!;
    const b = rowFromMessage("maya", { ...ownText, id: "device-b", text: "Saturday works." })!;
    const merged = mergeThreads({
      seeds: { maya: [{ id: "seed", from: "them", text: "Coffee?", time: "10:00 AM" }] },
      server: [a],
      queued: [a, b],
      knownChatIds: ["maya"],
    });
    expect(merged.maya.map((message) => message.id)).toEqual(["seed", a.clientId, b.clientId]);
  });

  it("does not create a conversation for a server row outside the known circle", () => {
    const row = rowFromMessage("unknown", ownText)!;
    const merged = mergeThreads({ seeds: { maya: [] }, server: [row], queued: [], knownChatIds: ["maya"] });
    expect(merged).toEqual({ maya: [] });
  });

  it("preserves seed messages even if their ids overlap an incoming row", () => {
    const server = { clientId: "seed", chatId: "maya", text: "not duplicated", time: "now", kind: "text" as const };
    const merged = mergeThreads({
      seeds: { maya: [{ id: "seed", from: "them", text: "initial", time: "earlier" }] },
      server: [server],
      queued: [],
    });
    expect(merged.maya).toHaveLength(1);
    expect(merged.maya[0].text).toBe("initial");
  });
});