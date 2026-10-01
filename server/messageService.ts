/**
 * The member's own messages, stored server-side.
 *
 * The app kept its conversations on the device, so a message sent on a phone did
 * not exist on a tablet. This service is the other half of `lib/message-sync.ts`:
 * it stores what the member wrote and hands the whole history back.
 *
 * Three rules make this safe, and all three are here rather than in the client:
 *
 * Only the member's own words are accepted. There is no endpoint for writing
 * somebody else's message, so a device cannot rewrite what another person said.
 *
 * A write is idempotent on the client's own id. The unique index is per member, so
 * a retry after a lost reply lands as a no-op instead of a duplicate — which is
 * what makes it safe for the app to re-send anything it is unsure about.
 *
 * A batch is cleaned before it is stored. Ids and kinds are checked against what
 * the app actually produces, and unusable rows are dropped rather than stored, so
 * a malformed request cannot put junk into a member's own history.
 */
import { and, eq, inArray } from "drizzle-orm";

import { memberMessages } from "../drizzle/schema";
import { getDb } from "./db";

/** One message as it travels, matching `SyncableMessage` in the app. */
export type MessageRow = {
  clientId: string;
  chatId: string;
  text: string;
  time: string;
  kind: string;
};

const KINDS: readonly string[] = ["text", "photo", "voice", "location", "plan", "offer"];

function isKind(value: unknown): value is string {
  return typeof value === "string" && KINDS.includes(value);
}

/**
 * Cleans a client-supplied batch.
 *
 * A duplicate id keeps its first occurrence: the app never sends the same id twice
 * on purpose, and keeping the first is the version the member actually saw when
 * they pressed send.
 *
 * An unusable row is dropped rather than repaired. Coercing an unknown kind to
 * text, which is the tempting shortcut, would store a voice note as a plain bubble
 * and hand the member a message that reads differently on their other device from
 * the one they sent, with nothing on screen to explain why. The app already
 * refuses those rows; the server has to agree, because the app is not the only
 * thing that can call this endpoint.
 */
export function normalizeMessages(input: unknown): MessageRow[] {
  if (!Array.isArray(input)) return [];
  const out: MessageRow[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const clientId = typeof row.clientId === "string" ? row.clientId.trim() : "";
    const chatId = typeof row.chatId === "string" ? row.chatId.trim() : "";
    const text = typeof row.text === "string" ? row.text : "";
    if (!clientId || clientId.length > 96) continue;
    if (!chatId || chatId.length > 64) continue;
    if (!text.trim()) continue;
    if (seen.has(clientId)) continue;
    // An absent kind is text; a kind that is present but not one we produce is a
    // row we cannot render faithfully, so it is not stored.
    const kind = row.kind === undefined || row.kind === null ? "text" : isKind(row.kind) ? row.kind : null;
    if (!kind) continue;
    seen.add(clientId);
    out.push({
      clientId,
      chatId,
      text: text.slice(0, 4000),
      time: typeof row.time === "string" && row.time ? row.time.slice(0, 32) : "now",
      kind,
    });
  }
  return out;
}

/** Everything this member has said, oldest first so the thread reads in order. */
export async function listMessages(memberId: number): Promise<MessageRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      clientId: memberMessages.clientId,
      chatId: memberMessages.chatId,
      text: memberMessages.text,
      time: memberMessages.time,
      kind: memberMessages.kind,
    })
    .from(memberMessages)
    .where(eq(memberMessages.memberId, memberId))
    .orderBy(memberMessages.id);
  return rows.map((row) => ({
    clientId: row.clientId,
    chatId: row.chatId,
    text: row.text,
    time: row.time,
    kind: row.kind,
  }));
}

/**
 * Stores a batch and returns the full history.
 *
 * The insert is written with `ignore` rather than an upsert: a message is a fact
 * about something that already happened, so a repeat must not overwrite it. An
 * edited message would need its own column and its own endpoint, and inventing
 * that here would let a re-send silently change history.
 *
 * The caller gets the whole history back rather than just the accepted rows,
 * because the app needs the authoritative version to display and a half-applied
 * batch would leave the two sides disagreeing with no way to notice.
 */
export async function applyMessages(memberId: number, rows: unknown): Promise<MessageRow[]> {
  const db = await getDb();
  if (!db) return listMessages(memberId);
  const clean = normalizeMessages(rows);
  if (clean.length === 0) return listMessages(memberId);

  for (const row of clean) {
    await db
      .insert(memberMessages)
      .values({
        memberId,
        chatId: row.chatId,
        clientId: row.clientId,
        text: row.text,
        time: row.time,
        kind: row.kind as "text" | "photo" | "voice" | "location" | "plan" | "offer",
      })
      .onDuplicateKeyUpdate({ set: { clientId: row.clientId } });
  }
  return listMessages(memberId);
}

/** How many messages this member has stored, used by the dashboard. */
export async function messageCountFor(memberId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ clientId: memberMessages.clientId })
    .from(memberMessages)
    .where(eq(memberMessages.memberId, memberId));
  return rows.length;
}

/** Forgets specific messages, used when a member deletes a conversation. */
export async function forgetMessages(memberId: number, clientIds: readonly string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const clean = clientIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 96);
  if (clean.length === 0) return;
  await db
    .delete(memberMessages)
    .where(and(eq(memberMessages.memberId, memberId), inArray(memberMessages.clientId, clean)));
}
