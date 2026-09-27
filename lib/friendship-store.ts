import type { ViewerRelationship } from "./profile-details";

/**
 * Who is connected to whom.
 *
 * Why this exists: the connection state used to live in three `useState` arrays
 * seeded with constants, and nothing ever wrote them anywhere. Two things went
 * wrong as a result.
 *
 * An accepted request did not survive a reload — the friendship reverted to
 * "stranger", the conversation stayed in the list but the profile offered "Ask
 * for Friendship" again, and the member was asked to accept a request they had
 * already accepted. From the member's side the chat feature simply never turned
 * on.
 *
 * A declined request came back too, because declining only filtered the id out
 * of the in-memory list. The same person kept reappearing as a stranger to be
 * asked, so a request that arrived from the other side would eventually present
 * itself as "Ask for Friendship" — asking the member to request friendship from
 * someone who had already asked them.
 *
 * So the connection graph is one value, it is persisted, and every decision that
 * depends on it — which actions a profile offers, whether a chat may open —
 * reads from here rather than from a local flag.
 */
export type FriendshipGraph = {
  /** Mutual friends. Chat, hangout, and meetup are open to these ids. */
  accepted: string[];
  /** Requests this member sent and is waiting on. */
  requested: string[];
  /** Requests that arrived and are still unanswered. */
  incoming: string[];
  /**
   * Requests this member turned down. Kept so the same request is never
   * presented twice: a decline is quiet, but it has to be final, otherwise the
   * member is asked again on the next launch.
   */
  declined: string[];
};

export const FRIENDSHIP_STORAGE_KEY = "trufrenz.friendships.v1";

/**
 * The starting circle for a fresh install.
 *
 * Aria has asked to connect, which is the case the member reported: the request
 * arrives from the other side, so the only sensible action is to answer it.
 */
export const DEFAULT_FRIENDSHIPS: FriendshipGraph = {
  accepted: ["maya", "sam", "noah"],
  requested: [],
  incoming: ["aria"],
  declined: [],
};

/** Reads a list of ids out of unknown stored data, dropping anything unusable. */
function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * Parses a stored graph.
 *
 * Tolerant on purpose: a missing, truncated, or corrupt record falls back to the
 * defaults rather than throwing, and one unreadable list never discards the
 * other three.
 */
export function parseFriendships(serialized: string | null | undefined): FriendshipGraph {
  if (!serialized) return { ...DEFAULT_FRIENDSHIPS };
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_FRIENDSHIPS };
    return {
      accepted: readIds(parsed.accepted),
      requested: readIds(parsed.requested),
      incoming: readIds(parsed.incoming),
      declined: readIds(parsed.declined),
    };
  } catch {
    return { ...DEFAULT_FRIENDSHIPS };
  }
}

export function serializeFriendships(graph: FriendshipGraph): string {
  return JSON.stringify({
    accepted: graph.accepted,
    requested: graph.requested,
    incoming: graph.incoming,
    declined: graph.declined,
  });
}

function addOnce(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function removeId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : ids;
}

/**
 * The one place that answers "what is this person to me?".
 *
 * Order matters. A live request that arrived outranks a past decline, so if
 * someone asks again after being turned down they are answered rather than
 * silently ignored. Acceptance outranks everything, so a friend is never
 * demoted by a stale entry in another list.
 */
export function relationshipFor(graph: FriendshipGraph, id: string): ViewerRelationship {
  if (graph.accepted.includes(id)) return "accepted";
  if (graph.incoming.includes(id)) return "request-received";
  if (graph.requested.includes(id)) return "request-sent";
  return "stranger";
}

/** Answering a request that arrived: the member is now a friend, immediately. */
export function acceptFriendship(graph: FriendshipGraph, id: string): FriendshipGraph {
  return {
    accepted: addOnce(graph.accepted, id),
    requested: removeId(graph.requested, id),
    incoming: removeId(graph.incoming, id),
    declined: removeId(graph.declined, id),
  };
}

/**
 * Turning a request down.
 *
 * The id moves to `declined` rather than vanishing, so the request cannot be
 * presented again and the member is never asked to decide twice.
 */
export function declineFriendship(graph: FriendshipGraph, id: string): FriendshipGraph {
  return {
    accepted: removeId(graph.accepted, id),
    requested: removeId(graph.requested, id),
    incoming: removeId(graph.incoming, id),
    declined: addOnce(graph.declined, id),
  };
}

/** Sending a request of the member's own. */
export function requestFriendship(graph: FriendshipGraph, id: string): FriendshipGraph {
  if (graph.accepted.includes(id) || graph.incoming.includes(id)) return graph;
  return {
    accepted: graph.accepted,
    requested: addOnce(graph.requested, id),
    incoming: graph.incoming,
    declined: graph.declined,
  };
}

/**
 * Whether this person still belongs in the discovery list.
 *
 * Anyone already connected, already asked, still to answer, or previously
 * declined is not a new introduction, so they are not offered as one.
 */
export function isNewIntroduction(graph: FriendshipGraph, id: string): boolean {
  return relationshipFor(graph, id) === "stranger" && !graph.declined.includes(id);
}

/**
 * Ending a friendship, by unfriending or blocking.
 *
 * Deliberately different from declining: the member was already a friend, so
 * this is not a decision about an incoming request and it must not be filed as
 * one. The id simply leaves the accepted list, and a later request from them is
 * treated as a fresh introduction rather than a decision already made.
 */
export function unfriend(graph: FriendshipGraph, id: string): FriendshipGraph {
  return {
    accepted: removeId(graph.accepted, id),
    requested: removeId(graph.requested, id),
    incoming: graph.incoming,
    declined: graph.declined,
  };
}

/** Whether a conversation may be opened with this person. */
export function chatUnlockedFor(graph: FriendshipGraph, id: string): boolean {
  return graph.accepted.includes(id);
}

/**
 * The unread count to show on a conversation row.
 *
 * A conversation cannot carry unread messages and be open at the same time, and
 * a friend who has been accepted has an unlocked thread, so the stored seed
 * count is authoritative only until the member has read the thread.
 */
export function unreadForRow(seedUnread: number, readCount: number, messageCount: number): number {
  if (messageCount > 0 && readCount >= messageCount) return 0;
  return Math.max(0, seedUnread);
}