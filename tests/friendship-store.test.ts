import { describe, expect, it } from "vitest";

import {
  DEFAULT_FRIENDSHIPS,
  acceptFriendship,
  declineFriendship,
  isNewIntroduction,
  parseFriendships,
  relationshipFor,
  requestFriendship,
  serializeFriendships,
  unfriend,
  withdrawRequest,
  type FriendshipGraph,
} from "../lib/friendship-store";

const empty = (): FriendshipGraph => ({ accepted: [], requested: [], incoming: [], declined: [] });

describe("a request that arrives from the other side", () => {
  it("is offered for an answer, not as something to ask for", () => {
    // The reported bug: the app asked the member to send a friend request to
    // someone who had already sent one to them.
    const graph = { ...empty(), incoming: ["aria"] };

    expect(relationshipFor(graph, "aria")).toBe("request-received");
  });

  it("does not appear as a new introduction while it waits", () => {
    const graph = { ...empty(), incoming: ["aria"] };

    expect(isNewIntroduction(graph, "aria")).toBe(false);
  });

  it("grants chat the moment it is accepted", () => {
    const accepted = acceptFriendship({ ...empty(), incoming: ["aria"] }, "aria");

    expect(relationshipFor(accepted, "aria")).toBe("accepted");
    expect(accepted.incoming).toEqual([]);
  });

  it("cannot be answered twice", () => {
    const once = acceptFriendship({ ...empty(), incoming: ["aria"] }, "aria");
    const twice = acceptFriendship(once, "aria");

    expect(twice.accepted).toEqual(["aria"]);
    expect(twice.incoming).toEqual([]);
  });
});

describe("surviving a reload", () => {
  it("round-trips an accepted friendship", () => {
    const accepted = acceptFriendship(DEFAULT_FRIENDSHIPS, "aria");

    expect(parseFriendships(serializeFriendships(accepted))).toEqual(accepted);
  });

  it("keeps the accepted friend out of the request queue after reload", () => {
    const stored = serializeFriendships(acceptFriendship(DEFAULT_FRIENDSHIPS, "aria"));
    const restored = parseFriendships(stored);

    expect(restored.incoming).toEqual([]);
    expect(relationshipFor(restored, "aria")).toBe("accepted");
  });

  it("starts a fresh install with the arriving request waiting", () => {
    // The exact first-run situation the member reported.
    expect(relationshipFor(DEFAULT_FRIENDSHIPS, "aria")).toBe("request-received");
  });
});

describe("declining", () => {
  it("records the decision so the request does not come back", () => {
    const declined = declineFriendship({ ...empty(), incoming: ["aria"] }, "aria");

    expect(declined.incoming).toEqual([]);
    expect(declined.declined).toEqual(["aria"]);
    // Without this the row reappeared in discovery and read as a stranger to be
    // asked, which is how the confusing wording resurfaced.
    expect(isNewIntroduction(declined, "aria")).toBe(false);
  });

  it("stays declined across a reload", () => {
    const declined = declineFriendship({ ...empty(), incoming: ["aria"] }, "aria");

    expect(parseFriendships(serializeFriendships(declined)).declined).toEqual(["aria"]);
  });

  it("lets a later request be answered rather than staying silent forever", () => {
    // Someone who asks again after being turned down deserves an answer, so a
    // live request outranks the older decline.
    const graph = { ...empty(), declined: ["aria"], incoming: ["aria"] };

    expect(relationshipFor(graph, "aria")).toBe("request-received");
  });
});

describe("sending a request", () => {
  it("stays visible as sent rather than reverting to a stranger", () => {
    const sent = requestFriendship(empty(), "leo");

    expect(relationshipFor(sent, "leo")).toBe("request-sent");
    expect(parseFriendships(serializeFriendships(sent)).requested).toEqual(["leo"]);
  });

  it("is not offered to someone who already asked us", () => {
    // Answering takes priority: asking back would be the confusing prompt again.
    const graph = requestFriendship({ ...empty(), incoming: ["aria"] }, "aria");

    expect(graph.requested).toEqual([]);
    expect(relationshipFor(graph, "aria")).toBe("request-received");
  });

  it("is not offered to an existing friend", () => {
    const graph = requestFriendship({ ...empty(), accepted: ["maya"] }, "maya");

    expect(graph.requested).toEqual([]);
  });
});

describe("ending a connection", () => {
  it("removes the friendship without filing a decline", () => {
    const graph = unfriend({ ...empty(), accepted: ["maya"] }, "maya");

    expect(graph.accepted).toEqual([]);
    // Unfriending is not a decision about an incoming request, so it must not
    // mark the person as someone whose request was refused.
    expect(graph.declined).toEqual([]);
  });

  it("leaves the person able to reach out again", () => {
    const graph = unfriend({ ...empty(), accepted: ["maya"] }, "maya");

    expect(isNewIntroduction(graph, "maya")).toBe(true);
  });
});

describe("taking back a request we sent", () => {
  it("removes it from the waiting list without filing a decline", () => {
    const waiting: FriendshipGraph = { ...empty(), accepted: ["sam"], requested: ["leo"], incoming: ["aria"] };
    const after = withdrawRequest(waiting, "leo");

    expect(after.requested).toEqual([]);
    // Withdrawing our own unanswered request is not a decision about a request
    // that arrived, so it must not be remembered as a refusal. Filing it as one
    // would silently stop that person from ever reaching out again.
    expect(after.declined).toEqual([]);
    expect(after.accepted).toEqual(["sam"]);
    expect(after.incoming).toEqual(["aria"]);
  });

  it("leaves the person able to be introduced again later", () => {
    const after = withdrawRequest({ ...empty(), requested: ["leo"] }, "leo");

    expect(isNewIntroduction(after, "leo")).toBe(true);
    expect(relationshipFor(after, "leo")).toBe("stranger");
  });

  it("stays withdrawn across a reload", () => {
    const after = withdrawRequest({ ...empty(), requested: ["leo"] }, "leo");

    expect(parseFriendships(serializeFriendships(after)).requested).toEqual([]);
  });
});

describe("a corrupt stored record", () => {
  it("falls back to the starting circle rather than throwing", () => {
    expect(parseFriendships("{not json")).toEqual(DEFAULT_FRIENDSHIPS);
    expect(parseFriendships(null)).toEqual(DEFAULT_FRIENDSHIPS);
    expect(parseFriendships("null")).toEqual(DEFAULT_FRIENDSHIPS);
  });

  it("keeps the readable lists when only one is damaged", () => {
    // One bad list must not discard the rest: a member would otherwise lose
    // every friend because a single field was malformed.
    const restored = parseFriendships(
      JSON.stringify({ accepted: ["maya", 42, ""], incoming: "not-a-list", requested: ["leo"], declined: null }),
    );

    expect(restored.accepted).toEqual(["maya"]);
    expect(restored.requested).toEqual(["leo"]);
    expect(restored.incoming).toEqual([]);
    expect(restored.declined).toEqual([]);
  });
});

describe("one authority for the relationship", () => {
  it("never reports a stranger for an accepted friend", () => {
    const graph: FriendshipGraph = { accepted: ["maya"], requested: ["maya"], incoming: ["maya"], declined: ["maya"] };

    // Acceptance outranks every other entry, so the profile and the discovery
    // row cannot disagree about the same person.
    expect(relationshipFor(graph, "maya")).toBe("accepted");
  });

  it("reports a stranger only for someone genuinely new", () => {
    expect(relationshipFor(empty(), "new-person")).toBe("stranger");
    expect(isNewIntroduction(empty(), "new-person")).toBe(true);
  });
});