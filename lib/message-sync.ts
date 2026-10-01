/**
 * Keeping conversations on the server.
 *
 * Why this exists: the circle moved to the server but the words did not. A member
 * who sent a message on their phone opened the app on a tablet and the message was
 * simply not there, because it had only ever existed in that one browser's
 * storage. Worse, the unread marker was computed from a thread the other device
 * could not see, so the same conversation could read as caught-up on one device
 * and unread on another.
 *
 * The rule here is deliberately different from the connection graph, and the
 * difference is the point. The circle is a small set of facts where the newest
 * answer wins, so the server's version replaces the local one. A conversation is
 * an append-only log, so nothing is ever replaced — the server's rows and anything
 * this device still owes are merged together, because dropping either side would
 * silently delete something a person actually said.
 *
 * That is also why there is no "first push" flag here. Nothing local is uploaded
 * on the member's behalf: only messages they sent are ever sent up, and they are
 * sent once, as they are typed. So an empty server genuinely means an empty
 * history, and the seeded demo thread underneath it is never at risk.
 *
 * Everything here is pure so the merge can be reasoned about and tested without a
 * server, a device, or a network.
 */

import type { Message } from "./thread-messages";

export const MESSAGE_SYNC_STORAGE_KEY = "trufrenz.message-sync.v1";

/**
 * One message as it travels.
 *
 * `clientId` is the id the app already gave the message, and it is what makes the
 * upload idempotent: a send that succeeded but whose reply was lost is retried
 * with the same id and lands as a no-op instead of a duplicate. The database
 * enforces that uniqueness per member, so even two devices racing on the same id
 * cannot both win.
 */
export type SyncableMessage = {
  clientId: string;
  chatId: string;
  text: string;
  time: string;
  kind: string;
};

/** What this device still owes the server, in send order. */
export type MessageSync = {
  queued: SyncableMessage[];
  /**
   * The last time a push succeeded, used only to keep the interval sensible.
   *
   * Not a cursor: the server is asked for the whole history rather than a delta,
   * because a conversation is small and a wrong cursor silently loses messages.
   */
  lastPushedAt: number | null;
};

export const EMPTY_MESSAGE_SYNC: MessageSync = { queued: [], lastPushedAt: null };

const KINDS: readonly string[] = ["text", "photo", "voice", "location", "plan", "offer"];

function isKind(value: unknown): value is string {
  return typeof value === "string" && KINDS.includes(value);
}

/** Reads one travelled row out of untrusted data, or null when it is unusable. */
export function readSyncableMessage(value: unknown): SyncableMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const clientId = typeof row.clientId === "string" ? row.clientId.trim() : "";
  const chatId = typeof row.chatId === "string" ? row.chatId.trim() : "";
  const text = typeof row.text === "string" ? row.text : "";
  if (!clientId || clientId.length > 96) return null;
  if (!chatId || chatId.length > 64) return null;
  if (!text) return null;
  /*
   * An absent kind is text, which is the common case and the sensible default. A
   * kind that is present but unknown is refused instead of coerced: silently
   * turning a voice note into a plain text bubble would show the member a message
   * they never sent, and nothing on screen would explain the difference.
   */
  const kind = row.kind === undefined || row.kind === null ? "text" : isKind(row.kind) ? row.kind : null;
  if (!kind) return null;
  return {
    clientId,
    chatId,
    text,
    time: typeof row.time === "string" && row.time ? row.time.slice(0, 32) : "now",
    /*
     * An absent kind is text, which is the common case and the sensible default.
     * A kind that is present but unknown is refused rather than coerced: silently
     * turning a voice note into a text bubble would show the member a message they
     * never sent, and nothing on screen would explain the difference.
     */
    kind,
  };
}

/**
 * Parses stored sync state.
 *
 * Tolerant, like every other stored record here: a corrupt entry costs the member
 * one re-send of a message they already typed, never a crash and never a lost
 * conversation — the conversation itself is rendered from the thread, not from this
 * queue.
 */
export function parseMessageSync(serialized: string | null | undefined): MessageSync {
  if (!serialized) return { ...EMPTY_MESSAGE_SYNC };
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...EMPTY_MESSAGE_SYNC };
    const raw = Array.isArray(parsed.queued) ? parsed.queued : [];
    const queued: SyncableMessage[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      const row = readSyncableMessage(entry);
      // A duplicate id in the queue would upload the same message twice on a
      // retry, which the server would collapse anyway — but the queue should not
      // carry the same debt twice.
      if (!row || seen.has(row.clientId)) continue;
      seen.add(row.clientId);
      queued.push(row);
    }
    const lastPushedAt = typeof parsed.lastPushedAt === "number" && Number.isFinite(parsed.lastPushedAt)
      ? parsed.lastPushedAt
      : null;
    return { queued, lastPushedAt };
  } catch {
    return { ...EMPTY_MESSAGE_SYNC };
  }
}

export function serializeMessageSync(sync: MessageSync): string {
  return JSON.stringify({ queued: sync.queued, lastPushedAt: sync.lastPushedAt });
}

/**
 * Queues a message this device sent.
 *
 * The same id is never queued twice: a double tap, or a retry after a slow reply,
 * must not become two messages in the member's own history.
 */
export function queueMessage(sync: MessageSync, message: SyncableMessage): MessageSync {
  if (sync.queued.some((row) => row.clientId === message.clientId)) return sync;
  return { ...sync, queued: [...sync.queued, message] };
}

/**
 * Drops what a successful push covered.
 *
 * Only the ids that were actually sent are cleared, so anything typed while the
 * request was in flight stays queued and goes out on the next attempt.
 */
export function acknowledgeMessages(sync: MessageSync, sentIds: readonly string[], at: number): MessageSync {
  const sent = new Set(sentIds);
  return { queued: sync.queued.filter((row) => !sent.has(row.clientId)), lastPushedAt: at };
}

/** Whether anything is waiting to be sent. */
export function hasQueuedMessages(sync: MessageSync): boolean {
  return sync.queued.length > 0;
}

/** Turns a rendered thread message into the row that travels. */
export function rowFromMessage(chatId: string, message: Message): SyncableMessage | null {
  /*
   * The chat id is trimmed before it is trusted. A whitespace-only id is truthy,
   * so it would pass a plain emptiness check and be stored under a key that matches
   * no conversation — the message would then be missing from the member's own
   * history on their other device with nothing to explain why.
   */
  const trimmedChatId = typeof chatId === "string" ? chatId.trim() : "";
  if (!trimmedChatId || !message || typeof message.id !== "string" || !message.id) return null;
  /*
   * Only the member's own words travel.
   *
   * The endpoint stores what this member wrote, so uploading an incoming message
   * would copy somebody else's words into their history as if they had said them.
   * The check lives here, at the one place a thread message becomes a row, so no
   * caller can forget it.
   */
  if (message.from !== "me") return null;
  // Attachments travel as a description rather than as bytes: the file itself is
  // a local uri that means nothing on another device, so sending the uri would
  // put a broken image in the member's own history.
  const kind = message.kind ?? "text";
  const text = message.text ?? "";
  if (!text) return null;
  return { clientId: message.id, chatId: trimmedChatId, text, time: message.time || "now", kind };
}

/** Turns a travelled row back into the message the thread renders. */
export function messageFromRow(row: SyncableMessage): Message {
  return {
    id: row.clientId,
    from: "me",
    text: row.text,
    time: row.time,
    kind: (isKind(row.kind) ? row.kind : "text") as Message["kind"],
  };
}

/**
 * The conversation to display, after the server has answered.
 *
 * Three sources, in this order: the seeded thread the app ships with, then
 * everything the server holds, then anything still queued here. Nothing is
 * replaced, and rows are deduplicated by id so a message that has been accepted by
 * the server does not appear a second time from the queue.
 *
 * A row whose chat no longer exists on this device is dropped rather than
 * invented: the member has removed that conversation, and resurrecting an empty
 * thread for it would look like a bug.
 */
export function mergeThreads(options: {
  seeds: Record<string, Message[]>;
  server: readonly SyncableMessage[];
  queued: readonly SyncableMessage[];
  knownChatIds?: readonly string[];
}): Record<string, Message[]> {
  const { seeds, server, queued, knownChatIds } = options;
  const known = knownChatIds && knownChatIds.length > 0 ? new Set(knownChatIds) : null;
  const out: Record<string, Message[]> = {};
  for (const [chatId, messages] of Object.entries(seeds)) {
    out[chatId] = [...messages];
  }
  const seen = new Set<string>();
  for (const messages of Object.values(out)) {
    for (const message of messages) seen.add(message.id);
  }
  const append = (rows: readonly SyncableMessage[]) => {
    for (const row of rows) {
      if (!row || seen.has(row.clientId)) continue;
      if (known && !known.has(row.chatId)) continue;
      seen.add(row.clientId);
      const thread = out[row.chatId] ?? [];
      out[row.chatId] = [...thread, messageFromRow(row)];
    }
  };
  append(server);
  append(queued);
  return out;
}

/**
 * The messages from other people, which the member does not send.
 *
 * Kept separate so the upload never includes words the member did not write. The
 * app only ever posts what the member typed, so this is what the merge should
 * treat as somebody else's — and it is not uploaded.
 */
export function isOwnMessage(message: Message): boolean {
  return message.from === "me";
}
