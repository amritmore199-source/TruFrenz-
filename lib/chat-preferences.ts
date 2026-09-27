import { DEFAULT_CHAT_ROW_STATE, type ChatRowState } from "./chat-extras";

/**
 * Mute, archive, and frozen threads, kept across launches.
 *
 * Why this exists: the row states were `useState` and nothing wrote them down.
 * A member who muted a group to stop it buzzing found it unmuted the next
 * morning, and an archived conversation walked back into the inbox on every
 * reload. Both are promises the app makes and then forgets, which is worse than
 * not offering them: a mute that does not hold teaches the member to distrust
 * every other setting on the screen.
 *
 * Only the three real flags are stored, and only for conversations the member
 * actually changed. A chat with no entry uses the defaults, so the stored record
 * stays as small as the member's own decisions.
 */
export const CHAT_PREFERENCES_STORAGE_KEY = "trufrenz.chat-preferences.v1";

/** Only the conversations with a non-default state, which is usually a few. */
export type ChatPreferences = Record<string, ChatRowState>;

export const EMPTY_CHAT_PREFERENCES: ChatPreferences = {};

function readBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Parses stored preferences.
 *
 * Tolerant, like every other stored record here: a truncated or corrupt entry
 * loses that conversation's state and nothing else, and an unreadable record
 * leaves the member with a clean list rather than a crash on launch.
 */
export function parseChatPreferences(serialized: string | null | undefined): ChatPreferences {
  if (!serialized) return {};
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ChatPreferences = {};
    for (const [chatId, raw] of Object.entries(parsed)) {
      if (!chatId || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      const muted = readBool(entry.muted) ?? DEFAULT_CHAT_ROW_STATE.muted;
      const archived = readBool(entry.archived) ?? DEFAULT_CHAT_ROW_STATE.archived;
      const readOnly = readBool(entry.readOnly) ?? DEFAULT_CHAT_ROW_STATE.readOnly;
      // A conversation back at its defaults is not worth a stored line, and
      // dropping it here keeps un-muting from leaving a permanent record behind.
      if (muted === DEFAULT_CHAT_ROW_STATE.muted && archived === DEFAULT_CHAT_ROW_STATE.archived && readOnly === DEFAULT_CHAT_ROW_STATE.readOnly) {
        continue;
      }
      out[chatId] = { muted, archived, readOnly };
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeChatPreferences(preferences: ChatPreferences): string {
  return JSON.stringify(preferences);
}

/** Drops entries that are back at their defaults, so storage tracks real choices. */
export function compactChatPreferences(preferences: ChatPreferences): ChatPreferences {
  const out: ChatPreferences = {};
  for (const [chatId, state] of Object.entries(preferences)) {
    if (!chatId || !state) continue;
    if (!state.muted && !state.archived && !state.readOnly) continue;
    out[chatId] = { muted: state.muted, archived: state.archived, readOnly: state.readOnly };
  }
  return out;
}

/**
 * Whether a stored record has anything worth keeping.
 *
 * Used to decide whether the preferences are worth writing at all: a member who
 * never muted or archived anything should not accumulate a storage key that says
 * nothing.
 */
export function preferencesAreEmpty(preferences: ChatPreferences): boolean {
  return Object.keys(compactChatPreferences(preferences)).length === 0;
}

/**
 * How many conversations are archived, for the Archived filter's label.
 *
 * Counted from the stored record rather than from a list of chats, because a
 * conversation can be archived and later removed from the directory; the count
 * should still match what the member chose.
 */
export function archivedCount(preferences: ChatPreferences): number {
  return Object.values(preferences).filter((state) => state?.archived).length;
}

/** How many conversations are muted, shown in the settings summary. */
export function mutedCount(preferences: ChatPreferences): number {
  return Object.values(preferences).filter((state) => state?.muted).length;
}
