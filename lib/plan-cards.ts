/**
 * Structured Hangout / Meetup cards shared inside a chat, plus group polls for
 * deciding plans together. These are cards rather than plain text so a plan can
 * be accepted, declined, rescheduled, and checked into.
 */

export type PlanKind = "hangout" | "meetup";
export type PlanStatus = "proposed" | "accepted" | "declined" | "rescheduled" | "completed";
export type PlanResponse = "accept" | "decline" | "propose-new-time";

export type PlanProposal = {
  /** ISO date (YYYY-MM-DD) of the proposed day. */
  date: string;
  /** Local time label such as "4:30 PM". */
  time: string;
  /** Public venue or place label chosen from the map/venue picker. */
  place: string;
  /** Broad area shown under the venue, never an exact address. */
  area?: string;
};

export type PlanCard = {
  id: string;
  kind: PlanKind;
  title: string;
  proposal: PlanProposal;
  status: PlanStatus;
  /** Who proposed it: the member or the friend. */
  proposedBy: "me" | "them";
  /** Set when a proposal is declined, for a gentle explanation. */
  declineReason?: string;
  /** Meetups only: the arrival check-in from the safety flow. */
  checkedInAt?: string | null;
  /** Optional shared link so the plan can be revisited later. */
  link: string;
};

export const PLAN_KIND_LABEL: Record<PlanKind, string> = { hangout: "Hangout", meetup: "Meetup" };

/** Every plan carries a stable, shareable link for follow-ups. */
export function planLink(kind: PlanKind, id: string): string {
  return `trufrenz://${kind}/${id}`;
}

export function createPlanCard(input: {
  id: string;
  kind: PlanKind;
  title?: string;
  proposal: PlanProposal;
  proposedBy: "me" | "them";
}): PlanCard {
  const label = PLAN_KIND_LABEL[input.kind];
  return {
    id: input.id,
    kind: input.kind,
    title: input.title?.trim() || `A gentle ${label.toLowerCase()}`,
    proposal: { ...input.proposal },
    status: "proposed",
    proposedBy: input.proposedBy,
    checkedInAt: null,
    link: planLink(input.kind, input.id),
  };
}

/** Apply a response to a plan; only the recipient can respond. */
export function respondToPlan(card: PlanCard, response: PlanResponse, options?: { proposal?: PlanProposal; reason?: string }): PlanCard {
  if (card.status === "completed") return card;
  if (response === "accept") return { ...card, status: "accepted", declineReason: undefined };
  if (response === "decline") return { ...card, status: "declined", declineReason: options?.reason ?? "They can't make it this time." };
  if (!options?.proposal) return card;
  return { ...card, status: "rescheduled", proposal: { ...options.proposal }, proposedBy: card.proposedBy === "me" ? "them" : "me", declineReason: undefined };
}

/** Accepted plans on the day itself are the ones worth checking into. */
export function isPlanToday(card: PlanCard, today: string): boolean {
  return card.status === "accepted" && card.proposal.date === today;
}

export type PlanTiming = { label: string; emphasis: "soon" | "today" | "later" | "past"; canCheckIn: boolean };

/** Human timing copy: a countdown before the day, "Today" on the day. */
export function planTiming(card: PlanCard, now: Date = new Date()): PlanTiming {
  const [year, month, day] = card.proposal.date.split("-").map((part) => Number(part));
  if (!year || !month || !day) return { label: "Date to be confirmed", emphasis: "later", canCheckIn: false };
  const target = new Date(year, month - 1, day);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - startOfToday.getTime()) / 86400000);
  if (card.status === "declined") return { label: "Declined", emphasis: "past", canCheckIn: false };
  if (days < 0) return { label: "This date has passed", emphasis: "past", canCheckIn: false };
  if (days === 0) return { label: "Today", emphasis: "today", canCheckIn: card.status === "accepted" };
  if (days === 1) return { label: "Tomorrow", emphasis: "soon", canCheckIn: false };
  if (days <= 6) return { label: `In ${days} days`, emphasis: "soon", canCheckIn: false };
  const weeks = Math.round(days / 7);
  return { label: `In ${weeks} week${weeks === 1 ? "" : "s"}`, emphasis: "later", canCheckIn: false };
}

/** Only accepted meetups offer the arrival check-in, and only once. */
export function canCheckIn(card: PlanCard, now: Date = new Date()): boolean {
  if (card.kind !== "meetup") return false;
  if (card.status !== "accepted") return false;
  if (card.checkedInAt) return false;
  return planTiming(card, now).canCheckIn;
}

export function checkInToPlan(card: PlanCard, now: Date = new Date()): PlanCard {
  if (!canCheckIn(card, now)) return card;
  return { ...card, checkedInAt: now.toISOString() };
}

/** The safety reminder shown once someone checks in. */
export function checkInSafetyNote(name: string): string {
  const first = name.split(" ")[0] || name;
  return `Checked in. ${first} knows you've arrived. If anything feels off, use the Safety center to share your live location with a trusted contact.`;
}

export type PollOption = { id: string; label: string; votes: string[] };

export type PlanPoll = {
  id: string;
  question: string;
  options: PollOption[];
  /** Member ids allowed to vote; group polls are invite-only. */
  voterIds: string[];
  /** One vote per member, changeable at any time. */
  closed: boolean;
};

export function createPoll(input: { id: string; question: string; options: string[]; voterIds: string[] }): PlanPoll {
  return {
    id: input.id,
    question: input.question.trim() || "When works for everyone?",
    options: input.options.map((label, index) => ({ id: `option-${index + 1}`, label: label.trim(), votes: [] })),
    voterIds: [...input.voterIds],
    closed: false,
  };
}

/** A member may only vote if they belong to the group and the poll is open. */
export function canVote(poll: PlanPoll, memberId: string): boolean {
  return !poll.closed && poll.voterIds.includes(memberId);
}

export function castVote(poll: PlanPoll, optionId: string, memberId: string): PlanPoll {
  if (!canVote(poll, memberId)) return poll;
  if (!poll.options.some((option) => option.id === optionId)) return poll;
  return {
    ...poll,
    options: poll.options.map((option) => {
      const withoutMember = option.votes.filter((id) => id !== memberId);
      if (option.id !== optionId) return { ...option, votes: withoutMember };
      return { ...option, votes: [...withoutMember, memberId] };
    }),
  };
}

export type PollResult = { optionId: string; label: string; count: number; leading: boolean; tied: boolean };

/** Results with the leading option marked; ties are surfaced rather than hidden. */
export function pollResults(poll: PlanPoll): PollResult[] {
  const counts = poll.options.map((option) => ({ optionId: option.id, label: option.label, count: option.votes.length }));
  const max = counts.reduce((highest, item) => Math.max(highest, item.count), 0);
  const leaders = counts.filter((item) => item.count === max && max > 0);
  return counts.map((item) => ({
    ...item,
    leading: max > 0 && item.count === max,
    tied: leaders.length > 1 && item.count === max,
  }));
}

/** Turn the winning option into a plan proposal in one tap. */
export function winningProposal(poll: PlanPoll): PlanProposal | null {
  const results = pollResults(poll);
  const leader = results.find((result) => result.leading && !result.tied);
  if (!leader) return null;
  const option = poll.options.find((item) => item.id === leader.optionId);
  if (!option) return null;
  const dateMatch = option.label.match(/\d{4}-\d{2}-\d{2}/);
  return {
    date: dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10),
    time: (option.label.match(/\d{1,2}(:\d{2})?\s?(AM|PM|am|pm)/) ?? ["6:30 PM"])[0],
    place: "Chosen together in the group",
  };
}

/** Chat-row preview text for a plan card, so the inbox stays readable. */
export function planPreview(card: PlanCard, now: Date = new Date()): string {
  // The clock is injected for the same reason `planTiming` takes one: this
  // string contains "Today" or "In 3 days", so a test that could not pin the
  // date would pass or fail depending on the day it ran.
  const timing = planTiming(card, now);
  const label = PLAN_KIND_LABEL[card.kind];
  if (card.status === "accepted") return `${card.kind === "meetup" ? "🗓️" : "☕"} ${label} confirmed · ${timing.label}`;
  if (card.status === "declined") return `${label} declined · ${card.proposal.place}`;
  if (card.status === "rescheduled") return `${label} moved to ${card.proposal.date} · ${card.proposal.time}`;
  return `${label} suggested · ${card.proposal.time} at ${card.proposal.place}`;
}

/** Meeting places are always public venues from the picker, never a home. */
export const VENUE_OPTIONS: readonly { name: string; area: string; kind: PlanKind }[] = [
  { name: "Café Lumen", area: "Pacific Heights", kind: "hangout" },
  { name: "Alta Plaza Park", area: "Pacific Heights", kind: "hangout" },
  { name: "Fillmore Bookshop", area: "Lower Pacific Heights", kind: "hangout" },
  { name: "Japantown Tea Room", area: "Japantown", kind: "hangout" },
  { name: "Sunday Walk Club route", area: "Presidio edge", kind: "hangout" },
  { name: "Community Pottery Studio", area: "Western Addition", kind: "meetup" },
  { name: "Marina Green courts", area: "Marina District", kind: "meetup" },
  { name: "Central Library room 2", area: "Civic Center", kind: "meetup" },
];

export function venuesForKind(kind: PlanKind): typeof VENUE_OPTIONS {
  return VENUE_OPTIONS.filter((venue) => venue.kind === kind);
}
