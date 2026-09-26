/**
 * Product event catalogue and daily rollup.
 *
 * The analytics dashboard reads its trend series from `analytics_events`. Every
 * number it shows is derived here from real recorded events, so the charts
 * reflect usage rather than a seeded series.
 *
 * The rollup is pure: give it a day's events plus the current account snapshot
 * and it returns the row for that day. That keeps the arithmetic testable and
 * means the server only has to supply data.
 */

export const ANALYTICS_EVENT_TYPES = [
  /** A member finished onboarding and an account was created. */
  "signup",
  /** A member opened the app; the basis for the daily-active figure. */
  "session_start",
  /** A friend request was sent. */
  "friend_request_sent",
  /** A friend request was accepted, producing a mutual friendship. */
  "friendship_accepted",
  /** A message was sent in a direct or group thread. */
  "message_sent",
  /** A member joined or RSVP'd to a meetup. */
  "meetup_joined",
  /** A meetup was created. */
  "meetup_created",
  /** A group chat was created. */
  "group_created",
  /** A group chat saw at least one message. */
  "group_active",
  /** A voice or video call was placed (premium feature). */
  "call_started",
  /** A verification submission was approved by a moderator. */
  "verification_approved",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

const EVENT_TYPE_SET = new Set<string>(ANALYTICS_EVENT_TYPES);

export function isAnalyticsEventType(value: unknown): value is AnalyticsEventType {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

export type RawAnalyticsEvent = {
  eventType: string;
  day: string;
  memberId?: number | null;
  groupId?: string | null;
};

/** The shape written to the `daily_metrics` table for one day. */
export type DailyMetricRow = {
  day: string;
  activeUsers: number;
  newSignups: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  freeUsers: number;
  paidUsers: number;
  activeGroups: number;
  callsMade: number;
  matchesMade: number;
};

/** An account snapshot for the totals that are not event-derived. */
export type AccountSnapshot = {
  verified: number;
  unverified: number;
  free: number;
  premium: number;
};

/** ISO date (YYYY-MM-DD) for a moment in time, in UTC. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The ISO date `offset` days before `from` (offset 0 is `from` itself). */
export function dayKeyOffset(from: Date, offset: number): string {
  const copy = new Date(from.getTime() - offset * 24 * 60 * 60 * 1000);
  return dayKey(copy);
}

/** Inclusive list of day keys ending at `endDay`, oldest first. */
export function dayRange(endDay: string, days: number): string[] {
  const end = new Date(`${endDay}T00:00:00.000Z`);
  const safeDays = Math.max(1, Math.round(days));
  const keys: string[] = [];
  for (let i = safeDays - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(end.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

/**
 * Roll one day of events into a metrics row.
 *
 * `snapshot` supplies the verified and tier splits, which are point-in-time
 * account facts rather than event counts; every other column is counted from
 * the events themselves. Distinct members and groups are deduplicated, so a
 * member sending twenty messages still counts once toward the daily-active
 * figure.
 */
export function rollupDay(
  day: string,
  events: RawAnalyticsEvent[],
  snapshot: AccountSnapshot,
): DailyMetricRow {
  const forDay = events.filter((event) => event.day === day);

  const activeMembers = new Set<number>();
  const activeGroups = new Set<string>();
  let newSignups = 0;
  let callsMade = 0;
  let matchesMade = 0;

  for (const event of forDay) {
    if (typeof event.memberId === "number") activeMembers.add(event.memberId);
    if (event.groupId) activeGroups.add(event.groupId);

    switch (event.eventType) {
      case "signup":
        newSignups += 1;
        break;
      case "call_started":
        callsMade += 1;
        break;
      case "friendship_accepted":
        matchesMade += 1;
        break;
      default:
        break;
    }
  }

  return {
    day,
    // A signup without a prior session still represents someone who used the
    // product that day, so signups are folded into the active figure.
    activeUsers: Math.max(activeMembers.size, newSignups),
    newSignups,
    verifiedUsers: snapshot.verified,
    unverifiedUsers: snapshot.unverified,
    freeUsers: snapshot.free,
    paidUsers: snapshot.premium,
    activeGroups: activeGroups.size,
    callsMade,
    matchesMade,
  };
}

/**
 * Roll several days at once, oldest first, filling gaps with a carried-forward
 * account snapshot so a quiet day still reports the correct standing totals.
 */
export function rollupRange(
  days: string[],
  events: RawAnalyticsEvent[],
  snapshot: AccountSnapshot,
): DailyMetricRow[] {
  return days.map((day) => rollupDay(day, events, snapshot));
}

/** Aggregate the raw events into the headline counters the dashboard shows. */
export function summarizeEvents(events: RawAnalyticsEvent[]) {
  const counts: Record<string, number> = {};
  const members = new Set<number>();
  const groups = new Set<string>();

  for (const event of events) {
    counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    if (typeof event.memberId === "number") members.add(event.memberId);
    if (event.groupId) groups.add(event.groupId);
  }

  return {
    counts,
    distinctMembers: members.size,
    distinctGroups: groups.size,
    total: events.length,
  };
}

/**
 * A deterministic pseudo-random event stream for a day, used only to backfill
 * the demo dataset so the dashboard opens with a readable trend. The series is
 * derived from the day key, so re-running the backfill produces identical rows
 * instead of drifting.
 */
export function demoEventsForDay(day: string, memberIds: number[]): RawAnalyticsEvent[] {
  const seed = hashString(day);
  const events: RawAnalyticsEvent[] = [];
  if (memberIds.length === 0) return events;

  const activeCount = Math.min(memberIds.length, 3 + (seed % Math.max(1, memberIds.length)));
  for (let i = 0; i < activeCount; i++) {
    const memberId = memberIds[(seed + i * 7) % memberIds.length];
    events.push({ eventType: "session_start", day, memberId });
  }

  const messages = 4 + (seed % 9);
  for (let i = 0; i < messages; i++) {
    const memberId = memberIds[(seed + i * 3) % memberIds.length];
    events.push({ eventType: "message_sent", day, memberId });
  }

  const groupCount = 1 + (seed % 3);
  for (let i = 0; i < groupCount; i++) {
    events.push({ eventType: "group_active", day, groupId: `group-${(seed + i) % 5}` });
  }

  if (seed % 3 === 0) {
    events.push({ eventType: "friendship_accepted", day, memberId: memberIds[seed % memberIds.length] });
  }
  if (seed % 4 === 0) {
    events.push({ eventType: "call_started", day, memberId: memberIds[(seed + 1) % memberIds.length] });
  }
  if (seed % 5 === 0) {
    events.push({ eventType: "meetup_joined", day, memberId: memberIds[(seed + 2) % memberIds.length] });
  }

  return events;
}

/** Small deterministic string hash so demo backfill is stable across runs. */
export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
}
