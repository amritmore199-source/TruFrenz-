import { describe, expect, it } from "vitest";

import {
  PLAN_KIND_LABEL,
  VENUE_OPTIONS,
  canCheckIn,
  canVote,
  castVote,
  checkInSafetyNote,
  checkInToPlan,
  createPlanCard,
  createPoll,
  isPlanToday,
  planLink,
  planPreview,
  planTiming,
  pollResults,
  respondToPlan,
  venuesForKind,
  winningProposal,
} from "../lib/plan-cards";

const now = new Date("2026-09-26T12:00:00.000Z");

function buildHangout() {
  return createPlanCard({
    id: "plan-1",
    kind: "hangout",
    proposal: { date: "2026-09-26", time: "4:30 PM", place: "Café Lumen", area: "Pacific Heights" },
    proposedBy: "me",
  });
}

describe("plan cards", () => {
  it("creates a proposed card with a stable shareable link", () => {
    const card = buildHangout();
    expect(card.status).toBe("proposed");
    expect(card.title).toBe("A gentle hangout");
    expect(card.link).toBe("trufrenz://hangout/plan-1");
    expect(planLink("meetup", "m9")).toBe("trufrenz://meetup/m9");
  });
  it("labels hangouts and meetups and only offers public venues", () => {
    expect(PLAN_KIND_LABEL.hangout).toBe("Hangout");
    expect(PLAN_KIND_LABEL.meetup).toBe("Meetup");
    expect(venuesForKind("meetup").every((venue) => venue.kind === "meetup")).toBe(true);
    expect(VENUE_OPTIONS.length).toBeGreaterThanOrEqual(6);
  });
  it("accepts and declines a proposal", () => {
    const card = buildHangout();
    expect(respondToPlan(card, "accept").status).toBe("accepted");
    const declined = respondToPlan(card, "decline");
    expect(declined.status).toBe("declined");
    expect(declined.declineReason).toBeTruthy();
  });
  it("hands the proposal to the other side when a new time is suggested", () => {
    const card = buildHangout();
    const moved = respondToPlan(card, "propose-new-time", { proposal: { date: "2026-09-27", time: "11:00 AM", place: "Alta Plaza Park" } });
    expect(moved.status).toBe("rescheduled");
    expect(moved.proposedBy).toBe("them");
    expect(moved.proposal.time).toBe("11:00 AM");
  });
  it("will not move a proposal without a replacement time", () => {
    expect(respondToPlan(buildHangout(), "propose-new-time").status).toBe("proposed");
  });
  it("ignores responses on a completed plan", () => {
    const completed = { ...buildHangout(), status: "completed" as const };
    expect(respondToPlan(completed, "accept").status).toBe("completed");
  });
});

describe("plan timing", () => {
  it("shows Today on the day itself", () => {
    const timing = planTiming(buildHangout(), now);
    expect(timing.label).toBe("Today");
    expect(timing.emphasis).toBe("today");
    const accepted = { ...buildHangout(), status: "accepted" as const };
    expect(isPlanToday(accepted, "2026-09-26")).toBe(true);
    expect(isPlanToday(accepted, "2026-09-25")).toBe(false);
    expect(isPlanToday(buildHangout(), "2026-09-26")).toBe(false);
  });
  it("counts down through tomorrow, the week, and beyond", () => {
    const base = buildHangout();
    expect(planTiming({ ...base, proposal: { ...base.proposal, date: "2026-09-27" } }, now).label).toBe("Tomorrow");
    expect(planTiming({ ...base, proposal: { ...base.proposal, date: "2026-09-30" } }, now).label).toBe("In 4 days");
    expect(planTiming({ ...base, proposal: { ...base.proposal, date: "2026-10-17" } }, now).label).toBe("In 3 weeks");
  });
  it("marks past dates and declined plans without a countdown", () => {
    const base = buildHangout();
    expect(planTiming({ ...base, proposal: { ...base.proposal, date: "2026-09-20" } }, now).label).toBe("This date has passed");
    expect(planTiming({ ...base, status: "declined" }, now).label).toBe("Declined");
  });
  it("handles an unparseable date without crashing", () => {
    const base = buildHangout();
    expect(planTiming({ ...base, proposal: { ...base.proposal, date: "soon" } }, now).label).toBe("Date to be confirmed");
  });
});

describe("arrival check-in", () => {
  it("offers check-in only for accepted meetups on the day", () => {
    const meetup = { ...createPlanCard({ id: "m2", kind: "meetup", proposal: { date: "2026-09-26", time: "6:30 PM", place: "Community Pottery Studio" }, proposedBy: "them" }), status: "accepted" as const };
    expect(canCheckIn(meetup, now)).toBe(true);
    expect(canCheckIn({ ...meetup, status: "proposed" }, now)).toBe(false);
    expect(canCheckIn({ ...meetup, kind: "hangout" }, now)).toBe(false);
    expect(canCheckIn({ ...meetup, proposal: { ...meetup.proposal, date: "2026-10-01" } }, now)).toBe(false);
  });
  it("records the check-in once and refuses a second one", () => {
    const meetup = { ...createPlanCard({ id: "m3", kind: "meetup", proposal: { date: "2026-09-26", time: "6:30 PM", place: "Marina Green courts" }, proposedBy: "me" }), status: "accepted" as const };
    const checked = checkInToPlan(meetup, now);
    expect(checked.checkedInAt).toBe(now.toISOString());
    expect(checkInToPlan(checked, now)).toBe(checked);
  });
  it("reassures the member and points at the safety center", () => {
    expect(checkInSafetyNote("Maya Chen")).toContain("Maya knows you've arrived");
    expect(checkInSafetyNote("Maya Chen")).toContain("Safety center");
  });
});

describe("group polls", () => {
  const poll = createPoll({ id: "poll-1", question: "When works?", options: ["2026-09-27 11:00 AM", "2026-09-28 6:30 PM", "2026-10-02 6:00 PM"], voterIds: ["me", "maya", "sam"] });

  it("creates options and only allows group members to vote", () => {
    expect(poll.options).toHaveLength(3);
    expect(canVote(poll, "maya")).toBe(true);
    expect(canVote(poll, "stranger")).toBe(false);
    expect(canVote({ ...poll, closed: true }, "maya")).toBe(false);
  });
  it("keeps one vote per member and lets them change it", () => {
    let state = castVote(poll, "option-1", "maya");
    expect(state.options[0].votes).toEqual(["maya"]);
    state = castVote(state, "option-2", "maya");
    expect(state.options[0].votes).toEqual([]);
    expect(state.options[1].votes).toEqual(["maya"]);
  });
  it("ignores votes from outsiders and unknown options", () => {
    expect(castVote(poll, "option-1", "stranger")).toBe(poll);
    expect(castVote(poll, "option-9", "maya")).toBe(poll);
  });
  it("marks a clear leader and surfaces ties instead of hiding them", () => {
    let state = castVote(castVote(castVote(poll, "option-1", "me"), "option-1", "maya"), "option-2", "sam");
    const results = pollResults(state);
    expect(results[0]).toMatchObject({ count: 2, leading: true, tied: false });
    const spread = castVote(castVote(castVote(poll, "option-1", "me"), "option-2", "maya"), "option-3", "sam");
    const tied = pollResults(spread).filter((item) => item.tied);
    expect(tied).toHaveLength(3);
    expect(tied.every((item) => item.count === 1)).toBe(true);
  });
  it("converts a winning option into a plan proposal with date and time", () => {
    const state = castVote(castVote(poll, "option-2", "me"), "option-2", "maya");
    const proposal = winningProposal(state);
    expect(proposal).toMatchObject({ date: "2026-09-28", time: "6:30 PM" });
    expect(winningProposal(poll)).toBeNull();
  });
});

describe("plan previews", () => {
  it("summarises each plan state for the inbox row", () => {
    /*
     * The clock is pinned. `buildHangout()` proposes 2026-09-26, and the preview
     * reads "Today" only when that really is today — so without this the test
     * would pass on the day it was written and fail every day after.
     */
    const card = buildHangout();
    expect(planPreview(card, now)).toContain("Hangout suggested");
    expect(planPreview({ ...card, status: "accepted" }, now)).toContain("Hangout confirmed");
    expect(planPreview({ ...card, status: "accepted" }, now)).toContain("Today");
    expect(planPreview({ ...card, status: "declined" }, now)).toContain("declined");
    // A week later the same plan reads as having passed, which is the honest
    // inbox line rather than a stale "confirmed".
    const later = new Date("2026-10-03T12:00:00.000Z");
    expect(planPreview({ ...card, status: "accepted" }, later)).toContain("This date has passed");
  });
});
