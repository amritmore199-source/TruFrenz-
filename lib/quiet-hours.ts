/**
 * Quiet hours.
 *
 * Why this exists: the app's only way to stop a conversation interrupting you was
 * to mute that conversation, one at a time. A member with twelve chats who wants
 * a calm night has to mute twelve times and remember to set them all back in the
 * morning — so in practice nobody does it, and the app buzzes at 1am. That is not
 * the promise a calm, safety-first app makes.
 *
 * Quiet hours are one setting that covers every conversation at once, and they
 * expire on their own. Mute still exists and still wins: it silences one chat
 * permanently, while this silences everything for a window.
 *
 * The window is allowed to cross midnight (22 → 7 is the default and the common
 * case), which is the part worth being careful about: a naive `start <= hour < end`
 * comparison makes the most common setting of all silently do nothing.
 *
 * Everything here is pure so the windows can be checked against real clock times
 * without waiting for one.
 */

export const QUIET_HOURS_STORAGE_KEY = "trufrenz.quiet-hours.v1";

/** A nightly window when notifications stay silent. */
export type QuietHours = {
  enabled: boolean;
  /** The hour the window opens, 0-23. */
  startHour: number;
  /** The hour the window closes, 0-23, exclusive. */
  endHour: number;
};

/**
 * Off by default.
 *
 * A notification setting that turns itself on would swallow messages the member
 * never agreed to miss. The window is pre-set to the usual night so switching it
 * on is a single tap rather than a small configuration exercise.
 */
export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, startHour: 22, endHour: 7 };

function clampHour(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const whole = Math.trunc(value);
  if (whole < 0 || whole > 23) return fallback;
  return whole;
}

/**
 * Parses stored quiet hours.
 *
 * Tolerant, like every other stored record here: a malformed value leaves the
 * member with the default setting rather than a crash on launch, and an hour
 * outside 0-23 falls back rather than producing a window that can never match.
 */
export function parseQuietHours(serialized: string | null | undefined): QuietHours {
  if (!serialized) return { ...DEFAULT_QUIET_HOURS };
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_QUIET_HOURS };
    return {
      enabled: parsed.enabled === true,
      startHour: clampHour(parsed.startHour, DEFAULT_QUIET_HOURS.startHour),
      endHour: clampHour(parsed.endHour, DEFAULT_QUIET_HOURS.endHour),
    };
  } catch {
    return { ...DEFAULT_QUIET_HOURS };
  }
}

export function serializeQuietHours(quiet: QuietHours): string {
  return JSON.stringify({ enabled: quiet.enabled, startHour: quiet.startHour, endHour: quiet.endHour });
}

/**
 * Whether the window is open at a given moment.
 *
 * Two shapes have to work: a window inside one day (1 → 6, the small hours) and a
 * window that crosses midnight (22 → 7). The crossing case is why this is not a
 * single comparison — with `start > end` the window is the union of "at or after
 * the start" and "before the end", not the empty set.
 *
 * An equal start and end is treated as never quiet rather than always quiet: a
 * zero-length window is what the member sees if they nudge both values to the
 * same hour, and silencing everything forever is not what they asked for.
 */
export function isQuietAt(quiet: QuietHours, at: Date): boolean {
  if (!quiet.enabled) return false;
  const hour = at.getHours();
  if (quiet.startHour === quiet.endHour) return false;
  if (quiet.startHour < quiet.endHour) return hour >= quiet.startHour && hour < quiet.endHour;
  return hour >= quiet.startHour || hour < quiet.endHour;
}

/**
 * Whether a message should be allowed to interrupt, given both settings.
 *
 * Mute is per conversation and permanent; quiet hours are global and temporary.
 * Either one is enough to hold the banner back, and the message itself still
 * arrives — only the interruption is suppressed.
 */
export function shouldHoldNotification(options: {
  quiet: QuietHours;
  at: Date;
  chatMuted: boolean;
}): boolean {
  if (options.chatMuted) return true;
  return isQuietAt(options.quiet, options.at);
}

/** How long until the window closes, in minutes, for the settings caption. */
export function minutesUntilQuietEnds(quiet: QuietHours, at: Date): number {
  if (!quiet.enabled || !isQuietAt(quiet, at)) return 0;
  const minutesNow = at.getHours() * 60 + at.getMinutes();
  const endMinutes = quiet.endHour * 60;
  if (quiet.startHour < quiet.endHour) return Math.max(0, endMinutes - minutesNow);
  /*
   * Crossing midnight, which is the default window and therefore the common case.
   *
   * The two halves of the night are counted differently. Before midnight there is
   * the rest of today plus the run up to the end; after midnight only the run up to
   * the end is left. Adding a full day in both halves — which one expression does —
   * told a member waking at 3:30am that their quiet window had another 27 hours to
   * run, on the one screen they opened to check whether it was working.
   */
  if (at.getHours() < quiet.endHour) return Math.max(0, endMinutes - minutesNow);
  return Math.max(0, 24 * 60 - minutesNow + endMinutes);
}

/** "10 PM", "12 AM", "7 AM" — the way a member would say the hour. */
export function hourLabel(hour: number): string {
  const whole = clampHour(hour, 0);
  const suffix = whole < 12 ? "AM" : "PM";
  const display = whole % 12 === 0 ? 12 : whole % 12;
  return `${display} ${suffix}`;
}

/** Steps an hour forward or back, wrapping around the clock. */
export function shiftHour(hour: number, delta: number): number {
  const whole = clampHour(hour, 0);
  const moved = (whole + Math.trunc(delta)) % 24;
  return moved < 0 ? moved + 24 : moved;
}

/**
 * A one-line summary for the settings row.
 *
 * Says what is actually happening rather than restating the switch: a member who
 * has just turned it on wants to know when it lifts, not that it is on.
 */
export function describeQuietHours(quiet: QuietHours, at?: Date): string {
  if (!quiet.enabled) return "Off — every chat can reach you.";
  const window = `Silent from ${hourLabel(quiet.startHour)} to ${hourLabel(quiet.endHour)}.`;
  if (!at || !isQuietAt(quiet, at)) return window;
  const remaining = minutesUntilQuietEnds(quiet, at);
  const hours = Math.floor(remaining / 60);
  const minutes = remaining % 60;
  if (hours === 0) return `${window} Lifting in ${minutes} min.`;
  return `${window} Lifting in ${hours}h ${minutes}m.`;
}
