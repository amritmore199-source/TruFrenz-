import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { planConnectionWrite } from "../server/connectionService";
import {
  EMPTY_CONNECTION_SYNC,
  acknowledge,
  connectionStateFor,
  graphFromRows,
  overlayPending,
  pendingRows,
  queueChange,
  queueRemoval,
} from "../lib/connection-sync";
import { relationshipFor, requestFriendship, withdrawRequest } from "../lib/friendship-store";
import type { FriendshipGraph } from "../lib/friendship-store";

/*
 * Withdrawing a request the member sent.
 *
 * This is the case that is easy to get wrong by reusing something that already
 * exists. A decline is right there and looks like the same thing — the request
 * goes away either way — but it records a decision about a request that arrived,
 * and that record is permanent. Withdrawing is the member changing their own mind
 * before the other side has even seen it. Reusing the decline leaves the other
 * person barred from the member's suggestions for good, so the tests below check
 * the *absence* of that record as carefully as they check the removal.
 */

const emptyGraph = (): FriendshipGraph => ({ accepted: [], requested: [], incoming: [], declined: [] });

describe("withdrawing a request from the member's side", () => {
  it("leaves the waiting list and becomes a fresh introduction", () => {
    const asked = requestFriendship(emptyGraph(), "leo");
    expect(relationshipFor(asked, "leo")).toBe("request-sent");

    const withdrawn = withdrawRequest(asked, "leo");
    expect(relationshipFor(withdrawn, "leo")).toBe("stranger");
  });

  it("does not record a decline", () => {
    // The heart of it: nobody turned Leo down, so nothing may say they did.
    const withdrawn = withdrawRequest(requestFriendship(emptyGraph(), "leo"), "leo");
    expect(withdrawn.declined).toEqual([]);
    expect(withdrawn.requested).toEqual([]);
  });

  it("leaves a decline that already existed alone", () => {
    // Withdrawing a request to one person must not quietly forgive someone else.
    const graph: FriendshipGraph = { ...emptyGraph(), declined: ["sam"] };
    const withdrawn = withdrawRequest({ ...graph, requested: ["leo"] }, "leo");
    expect(withdrawn.declined).toEqual(["sam"]);
  });

  it("keeps other people's requests untouched", () => {
    const graph: FriendshipGraph = { ...emptyGraph(), requested: ["leo", "maya"], accepted: ["sam"] };
    const withdrawn = withdrawRequest(graph, "leo");
    expect(withdrawn.requested).toEqual(["maya"]);
    expect(withdrawn.accepted).toEqual(["sam"]);
  });

  it("survives a reload, because nothing was written back in", () => {
    const withdrawn = withdrawRequest(requestFriendship(emptyGraph(), "leo"), "leo");
    expect(withdrawn.declined).toEqual([]);
    expect(relationshipFor(withdrawn, "leo")).toBe("stranger");
  });
});

describe("carrying the withdrawal to the server", () => {
  it("queues a removal rather than a declined state", () => {
    const sync = queueRemoval(EMPTY_CONNECTION_SYNC, "leo");
    expect(pendingRows(sync)).toEqual([]);
    expect(sync.removed).toContain("leo");
  });

  it("replaces an earlier request in the queue instead of leaving both", () => {
    // Sent, then taken back before either flush reached the server.
    let sync = queueChange(EMPTY_CONNECTION_SYNC, "leo", "requested");
    sync = queueRemoval(sync, "leo");
    expect(pendingRows(sync).map((row) => row.peerId)).not.toContain("leo");
    expect(sync.removed).toContain("leo");
  });

  it("plans a delete on the server, not a declined row", () => {
    const plan = planConnectionWrite([], ["leo"]);
    expect(plan.writes).toEqual([]);
    expect(plan.removals).toEqual(["leo"]);
  });

  it("never plans a decline from a removal alone", () => {
    // Whatever else changes, a removal must not become a state on the way out.
    const plan = planConnectionWrite([], ["leo", "maya"]);
    expect(plan.writes.some((row) => row.state === "declined")).toBe(false);
  });

  it("lets a newer state win over a stale removal in the same batch", () => {
    const plan = planConnectionWrite([{ peerId: "leo", state: "requested" }], ["leo"]);
    expect(plan.removals).toEqual([]);
    expect(plan.writes).toEqual([{ peerId: "leo", state: "requested" }]);
  });

  it("drops an unusable peer id instead of deleting on it", () => {
    expect(planConnectionWrite([], ["", "a".repeat(65)]).removals).toEqual([]);
    expect(planConnectionWrite([], ["leo"]).removals).toEqual(["leo"]);
  });

  it("ignores a removal that is not a string at all", () => {
    const plan = planConnectionWrite([], [null as unknown as string, 42 as unknown as string, "leo"]);
    expect(plan.removals).toEqual(["leo"]);
  });
});

describe("a withdrawn request as the member sees it afterwards", () => {
  it("comes back as a stranger once the server confirms the removal", () => {
    // The whole round trip: ask, withdraw, push, then the server's reply.
    let sync = queueChange(EMPTY_CONNECTION_SYNC, "leo", "requested");
    sync = queueRemoval(sync, "leo");

    const graph = graphFromRows([]); // the server now holds no row for Leo
    const merged = overlayPending(graph, sync.pending);
    expect(connectionStateFor(merged, "leo")).toBeNull();
    expect(relationshipFor(merged, "leo")).toBe("stranger");
    // And the queued request is gone too, so nothing re-sends it on the next flush.
    expect(sync.pending.leo).toBeUndefined();
  });

  it("still reads as a stranger on a fresh device, which is the point", () => {
    // Nothing local is left to carry the withdrawal: only the server's copy is.
    const sync = acknowledge(queueRemoval(EMPTY_CONNECTION_SYNC, "leo"), [], ["leo"]);
    const graph = graphFromRows([]);
    const merged = overlayPending(graph, sync.pending);
    expect(relationshipFor(merged, "leo")).toBe("stranger");
    expect(merged.declined).toEqual([]);
    expect(sync.removed).toEqual([]);
  });

  it("does not resurrect a declined record from the server either", () => {
    const graph = graphFromRows([{ peerId: "leo", state: "accepted" }]);
    expect(relationshipFor(graph, "leo")).toBe("accepted");
    // A removal produces no row, so nothing about Leo can be declined.
    expect(graphFromRows([]).declined).toEqual([]);
  });
});

/*
 * The two call sites, held in place.
 *
 * Both are one-line mistakes that the tests above cannot see, because the pure
 * functions they replaced are perfectly correct on their own — the bug is which
 * one the screen reaches for.
 */
describe("the Friends screen wiring", () => {
  const screen = read("app/(tabs)/index.tsx");

  it("withdraws through the removal path, never by declining", () => {
    // Declining a request the member sent would bar that person from their
    // suggestions forever on the strength of a decision nobody made.
    expect(screen).toContain("withdrawSentRequest(person.id)");
    expect(screen).not.toContain('applyConnectionChange(person.id, "declined")');
  });

  it("sends the withdrawal to the server as a removal", () => {
    // Local-only would come back as a waiting request on the next launch.
    expect(screen).toMatch(
      /const withdrawSentRequest = useCallback\(\(peerId: string\) => \{[\s\S]{0,220}queueRemoval\(current, peerId\)/,
    );
  });

  it("declines an incoming request through the synced path", () => {
    // The direct graph edit left the server still holding the request, so it
    // returned on the next launch as if it had never been answered.
    expect(screen).toContain('applyConnectionChange(id, "declined")');
    expect(screen).not.toContain("declineFriendship(current, id)");
  });

  it("gates a new request on the member's own verification, not a fixed tier", () => {
    // Pinned to "phone-only", the prompt could never be satisfied: an approved
    // member was asked to verify again and requests could never be sent.
    expect(screen).toContain("canRequestFriendship(myProfile.verification)");
    expect(screen).not.toMatch(/canRequestFriendship\("phone-only"\)/);
  });
});

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}
