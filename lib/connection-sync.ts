import {
  DEFAULT_FRIENDSHIPS,
  type FriendshipGraph,
} from "./friendship-store";

/**
 * Keeping the member's circle on the server.
 *
 * Why this exists: the connection graph was device-local. A member who accepted
 * a request on their phone opened the app on a tablet and found the request
 * waiting again, because the acceptance only ever existed in that one browser's
 * storage. A circle that lives on one device is not a circle, it is a cache.
 *
 * The server now stores one row per person the member has a relationship with,
 * so the graph travels with the account. What this module owns is the hard part:
 * deciding which side wins when the two disagree.
 *
 * The rule is that the server wins, with one exception — a change this device
 * made that the server has not acknowledged yet. That exception is what makes an
 * offline acceptance survive: the member tapped Accept on a train, the write
 * failed, and without the exception the next launch would hand them the server's
 * older answer and quietly undo the tap.
 *
 * Everything here is pure so the merge can be reasoned about and tested without
 * a server, a device, or a network.
 */

/** How this member relates to one other person. */
export type ConnectionState = "accepted" | "requested" | "incoming" | "declined";

/** One row of the circle, in the shape the server stores and returns. */
export type ConnectionRow = { peerId: string; state: ConnectionState };

export const CONNECTION_SYNC_STORAGE_KEY = "trufrenz.connection-sync.v1";

/**
 * What this device still owes the server.
 *
 * `pending` maps a person's id to the state the server has not been told about.
 * It is deliberately tiny: a person either has an unsent change or does not.
 */
export type ConnectionSync = {
  pending: Record<string, ConnectionState>;
  /**
   * People this device removed from the circle, which a block does.
   *
   * Removal is not one of the four states: the member did not decide something
   * about a request, they ended the relationship. It still has to reach the
   * server, though — otherwise the row stays behind as "accepted" and the next
   * launch hands the blocked person back as a friend.
   */
  removed: string[];
  /**
   * Whether the local graph has ever been pushed.
   *
   * Without this the very first launch of an existing install would treat an
   * empty server as authoritative and hand the member an empty circle, wiping
   * friendships that were made before the server existed.
   */
  pushed: boolean;
};

export const EMPTY_CONNECTION_SYNC: ConnectionSync = { pending: {}, removed: [], pushed: false };

const STATES: readonly ConnectionState[] = ["accepted", "requested", "incoming", "declined"];

function isState(value: unknown): value is ConnectionState {
  return typeof value === "string" && (STATES as readonly string[]).includes(value);
}

function readPending(value: unknown): Record<string, ConnectionState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, ConnectionState> = {};
  for (const [peerId, state] of Object.entries(value as Record<string, unknown>)) {
    if (peerId && isState(state)) out[peerId] = state;
  }
  return out;
}

/** Reads a list of peer ids out of stored data, dropping anything unusable. */
function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * Parses stored sync state.
 *
 * Tolerant, like the graph itself: a corrupt record costs the member a re-push,
 * never a crash and never a lost friendship — the graph has its own storage.
 */
export function parseConnectionSync(serialized: string | null | undefined): ConnectionSync {
  const empty: ConnectionSync = { pending: {}, removed: [], pushed: false };
  if (!serialized) return empty;
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return empty;
    return {
      pending: readPending(parsed.pending),
      removed: readIds(parsed.removed),
      pushed: parsed.pushed === true,
    };
  } catch {
    return empty;
  }
}

export function serializeConnectionSync(sync: ConnectionSync): string {
  return JSON.stringify({ pending: sync.pending, removed: sync.removed, pushed: sync.pushed });
}

/** Which of the four states a person holds, or `null` when they are a stranger. */
export function connectionStateFor(graph: FriendshipGraph, peerId: string): ConnectionState | null {
  if (graph.accepted.includes(peerId)) return "accepted";
  if (graph.incoming.includes(peerId)) return "incoming";
  if (graph.requested.includes(peerId)) return "requested";
  if (graph.declined.includes(peerId)) return "declined";
  return null;
}

/** The circle as rows, which is how it is stored and sent. */
export function rowsFromGraph(graph: FriendshipGraph): ConnectionRow[] {
  const rows: ConnectionRow[] = [];
  for (const peerId of graph.accepted) rows.push({ peerId, state: "accepted" });
  for (const peerId of graph.incoming) rows.push({ peerId, state: "incoming" });
  for (const peerId of graph.requested) rows.push({ peerId, state: "requested" });
  for (const peerId of graph.declined) rows.push({ peerId, state: "declined" });
  return rows;
}

/**
 * The circle rebuilt from rows.
 *
 * A person holds exactly one state, so the last row for an id wins. The server
 * enforces the same uniqueness, which is what makes this safe to rebuild.
 */
export function graphFromRows(rows: readonly ConnectionRow[]): FriendshipGraph {
  const graph: FriendshipGraph = { accepted: [], requested: [], incoming: [], declined: [] };
  for (const row of rows) {
    if (!row || typeof row.peerId !== "string" || !row.peerId) continue;
    if (!isState(row.state)) continue;
    if (row.state === "accepted") graph.accepted.push(row.peerId);
    else if (row.state === "incoming") graph.incoming.push(row.peerId);
    else if (row.state === "requested") graph.requested.push(row.peerId);
    else graph.declined.push(row.peerId);
  }
  return graph;
}

/**
 * Lays unsent changes over a graph.
 *
 * Used after the server's answer arrives: the server's version is the base and
 * anything this device still owes is written on top, so an offline tap is not
 * thrown away by the next successful fetch.
 */
export function overlayPending(
  base: FriendshipGraph,
  pending: Record<string, ConnectionState>,
): FriendshipGraph {
  const next: FriendshipGraph = {
    accepted: [...base.accepted],
    requested: [...base.requested],
    incoming: [...base.incoming],
    declined: [...base.declined],
  };
  for (const [peerId, state] of Object.entries(pending)) {
    if (!peerId || !isState(state)) continue;
    const remove = (list: string[]) => list.filter((item) => item !== peerId);
    next.accepted = remove(next.accepted);
    next.requested = remove(next.requested);
    next.incoming = remove(next.incoming);
    next.declined = remove(next.declined);
    if (state === "accepted") next.accepted.push(peerId);
    else if (state === "requested") next.requested.push(peerId);
    else if (state === "incoming") next.incoming.push(peerId);
    else next.declined.push(peerId);
  }
  return next;
}

/**
 * Puts one person into one state, in a single step.
 *
 * This is the local half of a change: the screen answers the tap immediately and
 * the queue carries the same fact to the server. A person holds exactly one
 * state, so they are cleared out of the other three lists first — otherwise
 * someone could be a friend and a stranger at the same time, and the profile
 * would offer to ask again.
 */
export function setConnectionState(
  graph: FriendshipGraph,
  peerId: string,
  state: ConnectionState,
): FriendshipGraph {
  if (!peerId) return graph;
  const cleared: FriendshipGraph = {
    accepted: graph.accepted.filter((id) => id !== peerId),
    requested: graph.requested.filter((id) => id !== peerId),
    incoming: graph.incoming.filter((id) => id !== peerId),
    declined: graph.declined.filter((id) => id !== peerId),
  };
  if (state === "accepted") cleared.accepted.push(peerId);
  else if (state === "requested") cleared.requested.push(peerId);
  else if (state === "incoming") cleared.incoming.push(peerId);
  else cleared.declined.push(peerId);
  return cleared;
}

/**
 * Forgets a person entirely, which is what a block does.
 *
 * Blocking is not one of the four connection states: the member has not made a
 * decision about a request, they have ended the relationship. The row is removed
 * rather than rewritten, so the server's copy matches.
 */
export function clearConnection(graph: FriendshipGraph, peerId: string): FriendshipGraph {
  return {
    accepted: graph.accepted.filter((id) => id !== peerId),
    requested: graph.requested.filter((id) => id !== peerId),
    incoming: graph.incoming.filter((id) => id !== peerId),
    declined: graph.declined.filter((id) => id !== peerId),
  };
}

/**
 * The circle to use once the server has answered.
 *
 * An empty server is only authoritative if this device has pushed before.
 * Otherwise it is a brand-new server account, and the local circle is the one
 * that has the friendships in it — handing back an empty circle there would look
 * exactly like losing them.
 */
export function reconcileOnLaunch(options: {
  local: FriendshipGraph;
  server: FriendshipGraph;
  pending: Record<string, ConnectionState>;
  hasPushed: boolean;
}): FriendshipGraph {
  const { local, server, pending, hasPushed } = options;
  const serverIsEmpty =
    server.accepted.length === 0 &&
    server.requested.length === 0 &&
    server.incoming.length === 0 &&
    server.declined.length === 0;
  if (serverIsEmpty && !hasPushed) return overlayPending(local, pending);
  return overlayPending(server, pending);
}

/** Queues a change for the server, replacing any earlier unsent change for them. */
export function queueChange(
  sync: ConnectionSync,
  peerId: string,
  state: ConnectionState,
): ConnectionSync {
  if (!peerId) return sync;
  return {
    ...sync,
    pending: { ...sync.pending, [peerId]: state },
    removed: sync.removed.filter((id) => id !== peerId),
  };
}

/**
 * Queues a removal, which is what a block does.
 *
 * The person leaves the queue of state changes as well: telling the server
 * "accepted" and "removed" in the same batch would leave the row's fate down to
 * which one happened to land last.
 */
export function queueRemoval(sync: ConnectionSync, peerId: string): ConnectionSync {
  if (!peerId) return sync;
  const pending = { ...sync.pending };
  delete pending[peerId];
  return { ...sync, pending, removed: sync.removed.includes(peerId) ? sync.removed : [...sync.removed, peerId] };
}

/** Everything still owed to the server, in a shape a single request can carry. */
export function pendingRows(sync: ConnectionSync): ConnectionRow[] {
  return Object.entries(sync.pending)
    .filter(([peerId, state]) => Boolean(peerId) && isState(state))
    .map(([peerId, state]) => ({ peerId, state }));
}

/**
 * Drops the changes a successful write covered.
 *
 * Only entries whose state still matches what was sent are cleared: if the
 * member tapped something else while the request was in flight, that newer
 * change is still owed and must stay queued.
 */
export function acknowledge(
  sync: ConnectionSync,
  sent: readonly ConnectionRow[],
  sentRemovals: readonly string[] = [],
): ConnectionSync {
  const pending = { ...sync.pending };
  for (const row of sent) {
    if (pending[row.peerId] === row.state) delete pending[row.peerId];
  }
  /*
   * A removal is cleared once the send has covered it. Reconnecting with the
   * person while the request was in flight is already handled: `queueChange`
   * cancels the removal as soon as the newer state is queued, so nothing here
   * has to second-guess which one the member meant.
   */
  const sentSet = new Set(sentRemovals);
  const removed = sync.removed.filter((peerId) => !sentSet.has(peerId));
  return { pending, removed, pushed: true };
}

/** Whether the member has any connection at all, used to pick empty-state copy. */
export function graphIsEmpty(graph: FriendshipGraph): boolean {
  return (
    graph.accepted.length === 0 &&
    graph.requested.length === 0 &&
    graph.incoming.length === 0 &&
    graph.declined.length === 0
  );
}

/**
 * The circle a member starts with.
 *
 * Kept here so the app and the tests agree on what "nothing yet" means, and so
 * the server's empty answer can be compared against the real starting state
 * rather than a second copy of it.
 */
export const STARTING_GRAPH: FriendshipGraph = DEFAULT_FRIENDSHIPS;
