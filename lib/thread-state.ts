/**
 * What a member has already seen inside their conversations.
 *
 * Two things were missing from the thread and both had the same cause: nothing
 * remembered the visit.
 *
 * There was no last-read marker, so a member returning to a long conversation
 * had to find their place by memory — and the unread badge on the row was a
 * seeded number that never cleared, so a conversation could read as unread
 * forever. The count has to come from where the member actually stopped, which
 * means the stopping point has to be stored.
 *
 * The safety line ("Only friends can see these messages") was also shown on
 * every visit. It is the last thing on that screen that costs a row of height,
 * and repeating a reassurance to someone who has already understood it spends
 * space without adding trust. It is shown once per conversation and then folded
 * away, which is why the "seen" list is stored next to the read markers: both
 * answer "has this member already been here?".
 */
export type ThreadState = {
  /** Chat id to the id of the last message the member has seen. */
  reads: Record<string, string>;
  /** Conversations whose safety note has already been shown. */
  notesSeen: string[];
};

export const THREAD_STATE_STORAGE_KEY = "trufrenz.thread-state.v1";

export const EMPTY_THREAD_STATE: ThreadState = { reads: {}, notesSeen: [] };

/** The minimum a message needs for read tracking. */
export type TrackableMessage = { id: string; from: "me" | "them" };

function readRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key && typeof entry === "string" && entry.length > 0) out[key] = entry;
  }
  return out;
}

function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * Parses stored state.
 *
 * Tolerant for the same reason as the connection graph: a truncated or corrupt
 * record must leave the member with an empty history, never a crash, and one
 * unreadable half must not discard the other.
 */
export function parseThreadState(serialized: string | null | undefined): ThreadState {
  if (!serialized) return { reads: {}, notesSeen: [] };
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return { reads: {}, notesSeen: [] };
    return { reads: readRecord(parsed.reads), notesSeen: readList(parsed.notesSeen) };
  } catch {
    return { reads: {}, notesSeen: [] };
  }
}

export function serializeThreadState(state: ThreadState): string {
  return JSON.stringify({ reads: state.reads, notesSeen: state.notesSeen });
}

/** Records that the member has reached a given message. */
export function markThreadRead(state: ThreadState, chatId: string, lastMessageId: string): ThreadState {
  if (!chatId || !lastMessageId) return state;
  if (state.reads[chatId] === lastMessageId) return state;
  return { ...state, reads: { ...state.reads, [chatId]: lastMessageId } };
}

/** Records that the conversation's safety note has been shown. */
export function markSafetyNoteSeen(state: ThreadState, chatId: string): ThreadState {
  if (!chatId || state.notesSeen.includes(chatId)) return state;
  return { ...state, notesSeen: [...state.notesSeen, chatId] };
}

export function hasSeenSafetyNote(state: ThreadState, chatId: string): boolean {
  return state.notesSeen.includes(chatId);
}

/**
 * The index of the first message the member has not seen, or `null` when there
 * is nothing new.
 *
 * The marker belongs *before* this message, which is what makes it useful: it
 * says "you stopped here", not "here is a number".
 */
export function firstUnreadIndex(messages: readonly TrackableMessage[], state: ThreadState, chatId: string): number | null {
  const lastReadId = state.reads[chatId];
  if (!lastReadId) return messages.length > 0 ? 0 : null;
  const index = messages.findIndex((message) => message.id === lastReadId);
  // A marker pointing at a message that is no longer in the thread (deleted, or
  // restored from another device) cannot place a divider, so nothing is claimed.
  if (index < 0) return null;
  const next = index + 1;
  return next < messages.length ? next : null;
}

/** How many messages from the other person sit past the member's stopping point. */
export function unreadFromThem(messages: readonly TrackableMessage[], state: ThreadState, chatId: string): number {
  const index = firstUnreadIndex(messages, state, chatId);
  if (index === null) return 0;
  return messages.slice(index).filter((message) => message.from === "them").length;
}

/**
 * The unread badge for a conversation row.
 *
 * A thread the member has never opened keeps its seeded count, because nothing
 * has been read yet. Once opened, the count comes from the real stopping point —
 * which is what lets the badge clear instead of staying lit forever.
 */
export function unreadForRow(input: {
  seedUnread: number;
  messages: readonly TrackableMessage[];
  state: ThreadState;
  chatId: string;
}): number {
  const { seedUnread, messages, state, chatId } = input;
  if (state.reads[chatId] === undefined) return Math.max(0, seedUnread);
  return unreadFromThem(messages, state, chatId);
}

/**
 * Whether the composer may reach the conversation at all.
 *
 * An archived or frozen thread stays readable but stops accepting new messages,
 * so a member is never surprised by a send that silently went nowhere.
 */
export function threadIsReadOnly(readOnly: boolean): boolean {
  return readOnly;
}

/** The divider label. Kept short: it sits in a hairline row between messages. */
export function readMarkerLabel(count: number): string {
  if (count <= 0) return "Caught up";
  if (count === 1) return "1 new message";
  return `${count} new messages`;
}