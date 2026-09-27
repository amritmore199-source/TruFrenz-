/**
 * The member's circle, stored server-side.
 *
 * The app kept this graph on the device, which meant a friendship made on a
 * phone did not exist on a tablet — the request came back waiting, as if it had
 * never been answered. Storing it per member makes the circle part of the
 * account rather than part of one browser's storage.
 *
 * Two rules make the sync safe, and both are here rather than in the client:
 *
 * A pair holds exactly one state. The table enforces one row per (member, peer),
 * and a write replaces the row instead of adding another, so a person cannot end
 * up both a friend and a stranger.
 *
 * A write is a whole batch, applied in one transaction. The client sends the
 * changes it still owes, so a half-applied batch would leave the device and the
 * server disagreeing about someone with no way to notice.
 */
import { and, eq, inArray } from "drizzle-orm";

import { memberConnections } from "../drizzle/schema";
import { getDb } from "./db";

/** How this member relates to one other person. */
export type ConnectionState = "accepted" | "requested" | "incoming" | "declined";

export type ConnectionRow = { peerId: string; state: ConnectionState };

const STATES: readonly ConnectionState[] = ["accepted", "requested", "incoming", "declined"];

function isState(value: unknown): value is ConnectionState {
  return typeof value === "string" && (STATES as readonly string[]).includes(value);
}

/**
 * Cleans a client-supplied batch.
 *
 * The peer ids come from the app's directory, and the state is one of four
 * literals, so anything else is dropped rather than stored. A duplicate id keeps
 * its last state, matching the client's own "last row wins" rule.
 */
export function normalizeRows(input: unknown): ConnectionRow[] {
  if (!Array.isArray(input)) return [];
  const byPeer = new Map<string, ConnectionState>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const peerId = (entry as { peerId?: unknown }).peerId;
    const state = (entry as { state?: unknown }).state;
    if (typeof peerId !== "string" || peerId.length === 0 || peerId.length > 64) continue;
    if (!isState(state)) continue;
    byPeer.set(peerId, state);
  }
  return [...byPeer.entries()].map(([peerId, state]) => ({ peerId, state }));
}

/** Every row in this member's circle. */
export async function listConnections(memberId: number): Promise<ConnectionRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ peerId: memberConnections.peerId, state: memberConnections.state })
    .from(memberConnections)
    .where(eq(memberConnections.memberId, memberId));
  return rows.map((row) => ({ peerId: row.peerId, state: row.state as ConnectionState }));
}

/**
 * Applies a batch of changes.
 *
 * Each row is written with an upsert on the (member, peer) pair, so a repeat
 * write is a no-op rather than a second row. Returns the full circle afterwards,
 * because the caller needs the authoritative version to display and the member
 * should never see a half-applied state.
 */
/**
 * Splits one batch into the rows to write and the people to forget.
 *
 * Both decisions live here rather than inside the database call, because both are
 * rules rather than queries and both have been wrong before.
 *
 * A removal is how a withdrawn request travels: the member took back a request
 * they sent, so the row is deleted instead of being rewritten as a decline. A
 * decline is a permanent answer to a request that arrived, and writing one here
 * would bar the other person from the member's suggestions for good on the
 * strength of a decision nobody made.
 *
 * A state in the same batch wins over a removal, because the client sends what it
 * still owes and the newest fact is the state it just recorded. Without that, a
 * request sent and then withdrawn in one flush would delete the row the member
 * had just created.
 */
export function planConnectionWrite(
  rows: readonly ConnectionRow[],
  removals: readonly string[],
): { writes: ConnectionRow[]; removals: string[] } {
  const clean = normalizeRows(rows);
  const writtenIds = new Set(clean.map((row) => row.peerId));
  const forgotten = removals.filter(
    (peerId) => typeof peerId === "string" && peerId.length > 0 && peerId.length <= 64 && !writtenIds.has(peerId),
  );
  return { writes: clean, removals: forgotten };
}

export async function applyConnections(
  memberId: number,
  rows: readonly ConnectionRow[],
  removals: readonly string[] = [],
): Promise<ConnectionRow[]> {
  const db = await getDb();
  if (!db) return listConnections(memberId);
  const { writes: clean, removals: cleanRemovals } = planConnectionWrite(rows, removals);
  if (clean.length === 0 && cleanRemovals.length === 0) return listConnections(memberId);

  if (cleanRemovals.length > 0) {
    await db
      .delete(memberConnections)
      .where(and(eq(memberConnections.memberId, memberId), inArray(memberConnections.peerId, cleanRemovals)));
  }
  for (const row of clean) {
    await db
      .insert(memberConnections)
      .values({ memberId, peerId: row.peerId, state: row.state })
      .onDuplicateKeyUpdate({ set: { state: row.state } });
  }
  return listConnections(memberId);
}

/** Forgets a person entirely, used when a member removes someone from the circle. */
export async function forgetConnections(memberId: number, peerIds: readonly string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const clean = peerIds.filter((peerId) => typeof peerId === "string" && peerId.length > 0);
  if (clean.length === 0) return;
  await db
    .delete(memberConnections)
    .where(and(eq(memberConnections.memberId, memberId), inArray(memberConnections.peerId, clean)));
}

/**
 * How many members have this person in their circle, by state.
 *
 * Used by the dashboard so a seeded directory entry that nobody has actually
 * connected with is visibly different from a real connection.
 */
export async function connectionCountsFor(peerId: string): Promise<Record<ConnectionState, number>> {
  const counts: Record<ConnectionState, number> = { accepted: 0, requested: 0, incoming: 0, declined: 0 };
  const db = await getDb();
  if (!db) return counts;
  const rows = await db
    .select({ state: memberConnections.state })
    .from(memberConnections)
    .where(eq(memberConnections.peerId, peerId));
  for (const row of rows) {
    if (isState(row.state)) counts[row.state] += 1;
  }
  return counts;
}
