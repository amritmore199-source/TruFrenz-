export const MINIMUM_AGE = 18;
export const MINIMUM_NAME_LENGTH = 2;
export const MAX_INTERESTS = 4;

export const INTEREST_SUGGESTIONS: readonly string[] = [
  "Coffee walks",
  "Bookshops",
  "Park hangs",
  "Cooking",
  "Bouldering",
  "Hiking",
  "Ceramics",
  "Live music",
  "Art walks",
  "Gardening",
  "Board games",
  "Try something new",
];

export const LOCALITY_SUGGESTIONS: readonly string[] = [
  "Pacific Heights",
  "Lower Pacific Heights",
  "Japantown",
  "Western Addition",
  "Cow Hollow",
  "Marina District",
];

/**
 * Accepts the two common date formats people type: `YYYY-MM-DD` and `MM/DD/YYYY`.
 * Returns null for anything unparseable, in the future, or absurdly old.
 */
export function parseDateOfBirth(value: string, now: Date = new Date()): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let year: number;
  let month: number;
  let day: number;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (slashMatch) {
    month = Number(slashMatch[1]);
    day = Number(slashMatch[2]);
    year = Number(slashMatch[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  if (candidate.getTime() > now.getTime()) return null;
  if (year < now.getUTCFullYear() - 120) return null;
  return candidate;
}

/** Format a stored date of birth for display in the onboarding summary. */
export function formatDateOfBirth(date: Date): string {
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** Whole-year age for a valid date of birth. */
export function ageFromDateOfBirth(date: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - date.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return Math.max(0, age);
}

export type ProfileDraft = {
  name: string;
  dateOfBirth: string;
  locality: string;
  interests: string[];
  photoUri?: string | null;
};

export type ProfileDraftErrors = {
  name?: string;
  dateOfBirth?: string;
  locality?: string;
  interests?: string;
};

/** Field-level errors for the onboarding profile step; an empty object means valid. */
export function validateProfileDraft(draft: ProfileDraft, now: Date = new Date()): ProfileDraftErrors {
  const errors: ProfileDraftErrors = {};

  const name = draft.name.trim();
  if (name.length < MINIMUM_NAME_LENGTH) errors.name = "Add the name friends should call you.";
  else if (name.length > 40) errors.name = "Keep your name under 40 characters.";

  const dateOfBirth = parseDateOfBirth(draft.dateOfBirth, now);
  if (!dateOfBirth) errors.dateOfBirth = "Use a real date like 1996-04-18 or 04/18/1996.";
  else if (ageFromDateOfBirth(dateOfBirth, now) < MINIMUM_AGE) errors.dateOfBirth = `Trufrenz is only for adults ${MINIMUM_AGE} and over.`;

  if (draft.locality.trim().length < 2) errors.locality = "Add your neighborhood so nearby friends can find you.";

  if (draft.interests.length === 0) errors.interests = "Pick at least one thing you enjoy.";
  else if (draft.interests.length > MAX_INTERESTS) errors.interests = `Choose up to ${MAX_INTERESTS} interests.`;

  return errors;
}

export function hasProfileErrors(errors: ProfileDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The single message shown in the toast when the profile step cannot continue. */
export function firstProfileError(errors: ProfileDraftErrors): string | null {
  return errors.name ?? errors.dateOfBirth ?? errors.locality ?? errors.interests ?? null;
}

/** Add or remove an interest chip, refusing to grow past the cap. */
export function toggleInterest(list: readonly string[], value: string, max: number = MAX_INTERESTS): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [...list];
  if (list.includes(trimmed)) return list.filter((item) => item !== trimmed);
  if (list.length >= max) return [...list];
  return [...list, trimmed];
}
