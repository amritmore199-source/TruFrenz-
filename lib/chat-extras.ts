/**
 * Chat-section rules that are pure and testable: availability dots, per-chat
 * mute/archive state, the read-receipt privacy toggle, emoji reactions,
 * attachment kinds, and the unfriend-to-archive transition.
 */

export type Availability = "available" | "away" | "unavailable";

export type AvailabilityView = {
  /** Colour token the dot uses: green when reachable, red when not. */
  tone: "available" | "unavailable";
  /** The dot pulses only when the member is genuinely reachable. */
  pulses: boolean;
  label: string;
};

/** Availability is intentionally binary in the UI: reachable, or not. */
export function availabilityView(availability: Availability | undefined): AvailabilityView {
  if (availability === "available") return { tone: "available", pulses: true, label: "Available now" };
  if (availability === "away") return { tone: "unavailable", pulses: false, label: "Away right now" };
  return { tone: "unavailable", pulses: false, label: "Not available" };
}

export type ChatRowState = {
  /** Muted chats stop sending push notifications but keep the badge. */
  muted: boolean;
  /** Archived chats leave the main list and become read-only. */
  archived: boolean;
  /** Unfriending archives the thread and freezes the conversation. */
  readOnly: boolean;
};

export const DEFAULT_CHAT_ROW_STATE: ChatRowState = { muted: false, archived: false, readOnly: false };

export function rowStateFor(states: Record<string, ChatRowState>, chatId: string): ChatRowState {
  return states[chatId] ?? DEFAULT_CHAT_ROW_STATE;
}

export function toggleMuted(states: Record<string, ChatRowState>, chatId: string): Record<string, ChatRowState> {
  const current = rowStateFor(states, chatId);
  return { ...states, [chatId]: { ...current, muted: !current.muted } };
}

export function toggleArchived(states: Record<string, ChatRowState>, chatId: string): Record<string, ChatRowState> {
  const current = rowStateFor(states, chatId);
  return { ...states, [chatId]: { ...current, archived: !current.archived } };
}

/** Unfriending archives and freezes the thread; messages are preserved. */
export function archiveOnUnfriend(states: Record<string, ChatRowState>, chatId: string): Record<string, ChatRowState> {
  const current = rowStateFor(states, chatId);
  return { ...states, [chatId]: { ...current, archived: true, readOnly: true } };
}

/** Only chats that are neither archived nor read-only can accept new messages. */
export function canSendTo(state: ChatRowState): boolean {
  return !state.archived && !state.readOnly;
}

/** Copy for the confirmation dialog before unfriending. */
export function unfriendConfirmation(name: string): { title: string; body: string; confirm: string } {
  const first = name.split(" ")[0] || name;
  return {
    title: `Unfriend ${first}?`,
    body: `Your conversation moves to Archived and becomes read-only. ${first} can't message you again unless you both reconnect. Your messages stay on your device until you delete them.`,
    confirm: `Unfriend ${first}`,
  };
}

/** Copy for the confirmation dialog before deleting an archived thread. */
export function deleteThreadConfirmation(name: string): { title: string; body: string; confirm: string } {
  const first = name.split(" ")[0] || name;
  return {
    title: `Delete this conversation with ${first}?`,
    body: "Messages are removed from your device. This cannot be undone.",
    confirm: "Delete messages",
  };
}

export type ChatPrivacy = {
  /** Read receipts are opt-in; when off, the other side never sees "Read". */
  shareReadReceipts: boolean;
  /** Availability is opt-in and can be paused without leaving the app. */
  showAvailability: boolean;
};

export const DEFAULT_CHAT_PRIVACY: ChatPrivacy = { shareReadReceipts: false, showAvailability: true };

/** The receipt to render on an outgoing message, honouring the privacy toggle. */
export function outgoingReceipt(
  receipt: "sending" | "sent" | "delivered" | "read" | undefined,
  shareReadReceipts: boolean,
): "sending" | "sent" | "delivered" | "read" | null {
  if (!receipt) return null;
  if (receipt === "read" && !shareReadReceipts) return "delivered";
  return receipt;
}

/** Receipts are only shown to the sender, and only when they opted in. */
export function shouldShowReceipt(
  message: { from: "me" | "them"; receipt?: "sending" | "sent" | "delivered" | "read" },
  shareReadReceipts: boolean,
): boolean {
  if (message.from !== "me") return false;
  if (!message.receipt) return false;
  if (message.receipt === "read") return shareReadReceipts;
  return true;
}

export type MessageKind = "text" | "photo" | "voice" | "location" | "plan" | "offer";

export type AttachmentDraft = {
  kind: Exclude<MessageKind, "text" | "plan">;
  /** Local uri for photos and voice notes. */
  uri?: string;
  /** Seconds, for voice notes. */
  durationSeconds?: number;
  /** Broad place label for a manual location share. */
  place?: string;
};

/** Build the one-line summary shown on a chat row for a non-text message. */
export function messagePreview(kind: MessageKind, options?: { text?: string; durationSeconds?: number; place?: string; planTitle?: string; offerWhat?: string }): string {
  switch (kind) {
    case "photo": return "📷 Photo";
    case "voice": return `🎤 Voice note · ${Math.max(1, Math.round(options?.durationSeconds ?? 0))}s`;
    case "location": return `📍 ${options?.place ?? "Shared a place"}`;
    case "plan": return `🗓️ ${options?.planTitle ?? "Plan card"}`;
    case "offer": return `💼 ${options?.offerWhat ?? "Shared what they do"}`;
    case "text": return options?.text ?? "";
  }
}

/** Voice notes are capped so a chat stays light and quick to skim. */
export const MAX_VOICE_SECONDS = 60;

export function clampVoiceSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 1;
  return Math.min(MAX_VOICE_SECONDS, Math.max(1, Math.round(seconds)));
}

export type Reaction = { emoji: string; count: number; mine: boolean };

export const REACTION_CHOICES: readonly string[] = ["❤️", "😂", "👍", "🙌", "☕", "🌿"];

/**
 * Tapping the same emoji twice removes the reaction; tapping a different one
 * moves the member's single reaction to it.
 */
export function applyReaction(reactions: readonly Reaction[], emoji: string): Reaction[] {
  const mine = reactions.find((reaction) => reaction.mine);
  if (mine && mine.emoji === emoji) {
    const next = reactions
      .map((reaction) => (reaction.emoji === emoji ? { ...reaction, count: reaction.count - 1, mine: false } : reaction))
      .filter((reaction) => reaction.count > 0);
    return next;
  }
  const withoutMine = reactions
    .map((reaction) => (reaction.mine ? { ...reaction, count: reaction.count - 1, mine: false } : reaction))
    .filter((reaction) => reaction.count > 0);
  const existing = withoutMine.find((reaction) => reaction.emoji === emoji);
  if (existing) {
    return withoutMine.map((reaction) => (reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, mine: true } : reaction));
  }
  return [...withoutMine, { emoji, count: 1, mine: true }];
}

/** Reactions are summarised after three distinct emoji to keep bubbles tidy. */
export function summariseReactions(reactions: readonly Reaction[], max = 3): Reaction[] {
  return [...reactions].sort((a, b) => b.count - a.count).slice(0, max);
}

/** Unread badges are suppressed on muted chats, matching every major messenger. */
export function displayUnread(unread: number, state: ChatRowState): number {
  if (state.muted) return 0;
  return Math.max(0, Math.round(unread));
}

/** The empty state's copy, which changes with the reason the list is empty. */
export function emptyChatsCopy(options: { hasAcceptedFriends: boolean; filter: "All" | "Unread" | "Groups"; search: string; archivedCount: number }): { title: string; body: string } {
  if (options.search.trim()) {
    return { title: "No matches", body: `Nothing matches "${options.search.trim()}". Try a friend's first name or a group.` };
  }
  if (options.filter === "Unread") {
    return { title: "All caught up", body: "You've read everything. New messages will land here first." };
  }
  if (options.filter === "Groups") {
    return { title: "No groups yet", body: "Start a private group with accepted friends, then plan together in one place." };
  }
  if (!options.hasAcceptedFriends) {
    return { title: "Accept a friend request to start chatting", body: "Conversations only open after you both say yes. Browse nearby members and send a gentle request." };
  }
  return { title: "Nothing here just yet", body: "Your accepted friends' messages will appear here." };
}

/** Archived threads are listed separately and never mixed into the inbox. */
export function splitByArchive(chats: readonly { id: string }[], states: Record<string, ChatRowState>): { active: string[]; archived: string[] } {
  const active: string[] = [];
  const archived: string[] = [];
  for (const chat of chats) {
    if (rowStateFor(states, chat.id).archived) archived.push(chat.id);
    else active.push(chat.id);
  }
  return { active, archived };
}

/** Call entry points always re-check entitlement before connecting. */
export function callGate(options: { viewerPaid: boolean; recipientPaid: boolean }): { allowed: boolean; message: string } {
  if (options.viewerPaid && options.recipientPaid) return { allowed: true, message: "Connecting your call…" };
  if (!options.viewerPaid) return { allowed: false, message: "Calls are part of Trufrenz Premium. Upgrade to call your friends." };
  return { allowed: false, message: "Calls need Premium on both sides. We'll let them know you'd like to talk." };
}

/** Unread total for the tab badge, ignoring muted and archived threads. */
export function unreadTotal(chats: readonly { id: string; unread: number }[], states: Record<string, ChatRowState>): number {
  return chats.reduce((sum, chat) => {
    const state = rowStateFor(states, chat.id);
    if (state.archived) return sum;
    return sum + displayUnread(chat.unread, state);
  }, 0);
}
