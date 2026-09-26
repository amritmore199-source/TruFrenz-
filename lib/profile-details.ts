export const MAX_PHOTOS = 6;
export const MAX_BIO_LENGTH = 150;
export const MAX_INTERESTS_DETAIL = 8;
export const MAX_LANGUAGES = 6;
export const MAX_LOOKING_FOR = 4;
export const MAX_STATUS_LENGTH = 60;
/** A status line quietly expires after this many hours so stale moods do not linger. */
export const STATUS_LIFETIME_HOURS = 72;

export type StatusMood = {
  /** The short line shown beside the member's name, e.g. "free this weekend". */
  text: string;
  /** Optional emoji or icon-style marker shown before the text. */
  emoji?: string;
  /** ISO timestamp of the last edit, used to expire stale statuses. */
  updatedAt: string;
};

/** One-tap starting points shown under the status field. */
export const STATUS_SUGGESTIONS: readonly { emoji: string; text: string }[] = [
  { emoji: "🌿", text: "free this weekend" },
  { emoji: "🏋️", text: "looking for a gym buddy" },
  { emoji: "☕", text: "up for a coffee walk" },
  { emoji: "📚", text: "studying at the library this week" },
  { emoji: "🎧", text: "new to the neighborhood" },
  { emoji: "🧺", text: "planning a park picnic" },
  { emoji: "🧗", text: "trying bouldering for the first time" },
  { emoji: "🎬", text: "movie night, anyone?" },
  { emoji: "🚶", text: "walking most evenings" },
  { emoji: "🍜", text: "hunting for good noodles" },
];

/** Trim a status line to the cap, collapsing whitespace so it stays a single short line. */
export function clampStatus(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_STATUS_LENGTH);
}

/** Build a status from free text plus an optional emoji; empty text clears it. */
export function createStatus(text: string, emoji: string | undefined, now: Date = new Date()): StatusMood | null {
  const clamped = clampStatus(text);
  if (!clamped) return null;
  return { text: clamped, emoji: emoji?.trim() ? emoji.trim().slice(0, 4) : undefined, updatedAt: now.toISOString() };
}

/** A status is stale once it passes the lifetime window. */
export function isStatusStale(status: StatusMood | null | undefined, now: Date = new Date()): boolean {
  if (!status) return false;
  const updated = Date.parse(status.updatedAt);
  if (!Number.isFinite(updated)) return true;
  return now.getTime() - updated > STATUS_LIFETIME_HOURS * 60 * 60 * 1000;
}

/** The status to display, or null when it is empty or has gone stale. */
export function visibleStatus(status: StatusMood | null | undefined, now: Date = new Date()): StatusMood | null {
  if (!status || !status.text.trim()) return null;
  return isStatusStale(status, now) ? null : status;
}

/** Short label for a status chip: emoji plus text, or just the text. */
export function statusLabel(status: StatusMood | null | undefined): string {
  if (!status) return "";
  return status.emoji ? `${status.emoji} ${status.text}` : status.text;
}

/** How long ago the status was set, for the edit screen's helper copy. */
export function statusFreshness(status: StatusMood | null | undefined, now: Date = new Date()): string | null {
  if (!status) return null;
  const updated = Date.parse(status.updatedAt);
  if (!Number.isFinite(updated)) return null;
  const minutes = Math.max(0, Math.round((now.getTime() - updated) / 60000));
  if (minutes < 2) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

export type GenderOption = "Woman" | "Man" | "Non-binary" | "Prefer not to say";

export const GENDER_OPTIONS: readonly GenderOption[] = ["Woman", "Man", "Non-binary", "Prefer not to say"];

export type LookingFor = "Friendship" | "Hangout buddy" | "Activity partner" | "Study partner" | "Travel buddy" | "Coffee company";

export const LOOKING_FOR_OPTIONS: readonly LookingFor[] = [
  "Friendship",
  "Hangout buddy",
  "Activity partner",
  "Study partner",
  "Travel buddy",
  "Coffee company",
];

export const LANGUAGE_SUGGESTIONS: readonly string[] = ["English", "Spanish", "Mandarin", "Hindi", "French", "Tagalog", "Vietnamese", "Arabic", "Portuguese", "Korean"];

export type RequestAudience = "everyone" | "friends-of-friends" | "verified-only";

export const REQUEST_AUDIENCE_OPTIONS: readonly { value: RequestAudience; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "friends-of-friends", label: "Friends of friends" },
  { value: "verified-only", label: "Verified only" },
];

export type ProfilePhoto = {
  id: string;
  /** Local uri or bundled image reference resolved by the screen. */
  uri: string;
  /** Optional accessibility description for screen readers. */
  alt?: string;
};

export type PrivacySettings = {
  requestAudience: RequestAudience;
  hideFromDiscovery: boolean;
  hideExactLocality: boolean;
  /** Ids of members this person has blocked; only used for the block-list screen. */
  blockedIds: string[];
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  requestAudience: "friends-of-friends",
  hideFromDiscovery: false,
  hideExactLocality: true,
  blockedIds: [],
};

export type EditableProfile = {
  name: string;
  /** Age is derived from the verified date of birth and is never freely editable. */
  age: number;
  gender: GenderOption;
  locality: string;
  bio: string;
  interests: string[];
  languages: string[];
  lookingFor: LookingFor[];
  photos: ProfilePhoto[];
  primaryPhotoId: string | null;
  verification: "id-selfie" | "phone-only";
  available: boolean;
  /** Short, self-expiring mood line shown beside the member's name. */
  status: StatusMood | null;
  privacy: PrivacySettings;
  /** True when the locality was filled from device location rather than typed. */
  localityAutoFilled: boolean;
};

/** A brand-new profile that has only completed phone onboarding. */
export function createInitialProfile(input: { name: string; age: number; locality: string }): EditableProfile {
  return {
    name: input.name.trim().slice(0, 40),
    age: Math.max(18, Math.round(input.age)),
    gender: "Prefer not to say",
    locality: input.locality.trim().slice(0, 60),
    bio: "",
    interests: [],
    languages: ["English"],
    lookingFor: ["Friendship"],
    photos: [],
    primaryPhotoId: null,
    verification: "phone-only",
    available: true,
    status: null,
    privacy: { ...DEFAULT_PRIVACY_SETTINGS },
    localityAutoFilled: false,
  };
}

/** Add a photo, refusing to exceed the cap and auto-promoting the first one to primary. */
export function addProfilePhoto(profile: EditableProfile, photo: ProfilePhoto): EditableProfile {
  if (profile.photos.length >= MAX_PHOTOS) return profile;
  if (profile.photos.some((item) => item.id === photo.id)) return profile;
  const photos = [...profile.photos, photo];
  return { ...profile, photos, primaryPhotoId: profile.primaryPhotoId ?? photo.id };
}

export function removeProfilePhoto(profile: EditableProfile, photoId: string): EditableProfile {
  const photos = profile.photos.filter((item) => item.id !== photoId);
  const primaryPhotoId = profile.primaryPhotoId === photoId ? (photos[0]?.id ?? null) : profile.primaryPhotoId;
  return { ...profile, photos, primaryPhotoId };
}

/** Move a photo one slot toward the front (offset -1) or the back (offset +1). */
export function moveProfilePhoto(profile: EditableProfile, photoId: string, offset: number): EditableProfile {
  const index = profile.photos.findIndex((item) => item.id === photoId);
  if (index === -1) return profile;
  const target = index + Math.round(offset);
  if (target < 0 || target >= profile.photos.length) return profile;
  const photos = [...profile.photos];
  const [moved] = photos.splice(index, 1);
  photos.splice(target, 0, moved);
  return { ...profile, photos };
}

export function setPrimaryPhoto(profile: EditableProfile, photoId: string): EditableProfile {
  if (!profile.photos.some((item) => item.id === photoId)) return profile;
  return { ...profile, primaryPhotoId: photoId };
}

/** Photos in display order, primary first — the order used by the viewer carousel. */
export function orderedPhotos(profile: EditableProfile): ProfilePhoto[] {
  if (!profile.primaryPhotoId) return [...profile.photos];
  const primary = profile.photos.find((item) => item.id === profile.primaryPhotoId);
  if (!primary) return [...profile.photos];
  return [primary, ...profile.photos.filter((item) => item.id !== profile.primaryPhotoId)];
}

/** Trim a bio to the character cap, keeping whole words where possible. */
export function clampBio(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_BIO_LENGTH) return trimmed;
  const clipped = trimmed.slice(0, MAX_BIO_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > MAX_BIO_LENGTH - 24 ? clipped.slice(0, lastSpace) : clipped).trim();
}

export function toggleFromList<T>(list: readonly T[], value: T, max?: number): T[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (max !== undefined && list.length >= max) return [...list];
  return [...list, value];
}

export type ProfileErrors = { name?: string; locality?: string; bio?: string; interests?: string; photos?: string };

export function validateEditableProfile(profile: EditableProfile): ProfileErrors {
  const errors: ProfileErrors = {};
  if (profile.name.trim().length < 2) errors.name = "Add the name friends should call you.";
  if (profile.locality.trim().length < 2) errors.locality = "Add your home area so nearby friends can find you.";
  if (profile.bio.length > MAX_BIO_LENGTH) errors.bio = `Keep your bio to ${MAX_BIO_LENGTH} characters.`;
  if (profile.interests.length > MAX_INTERESTS_DETAIL) errors.interests = `Choose up to ${MAX_INTERESTS_DETAIL} interests.`;
  if (profile.photos.length > MAX_PHOTOS) errors.photos = `Add up to ${MAX_PHOTOS} photos.`;
  return errors;
}

export function firstProfileDetailError(errors: ProfileErrors): string | null {
  return errors.name ?? errors.locality ?? errors.bio ?? errors.interests ?? errors.photos ?? null;
}

/** Age always comes from the verified date of birth, never from a free-text field. */
export function ageFieldLocked(profile: EditableProfile): boolean {
  return profile.age >= 18;
}

/** Which verification badge a profile should show, and whether it can upgrade. */
export function verificationBadge(verification: EditableProfile["verification"]): {
  label: string;
  strong: boolean;
  canGetVerified: boolean;
} {
  if (verification === "id-selfie") return { label: "ID + selfie verified", strong: true, canGetVerified: false };
  return { label: "Phone verified", strong: false, canGetVerified: true };
}

/** Availability drives discoverability and call reachability together. */
export function canBeDiscovered(profile: EditableProfile): boolean {
  return profile.available && !profile.privacy.hideFromDiscovery;
}

export function canReceiveRequest(profile: EditableProfile, sender: { isFriendOfFriend: boolean; isVerified: boolean }): boolean {
  if (!canBeDiscovered(profile)) return false;
  if (profile.privacy.requestAudience === "everyone") return true;
  if (profile.privacy.requestAudience === "verified-only") return sender.isVerified;
  return sender.isFriendOfFriend;
}

export type DistanceTier = "paid" | "free";

/**
 * Free members never see a distance; paid members see it rounded to one decimal.
 * When the owner hides their exact locality, only a coarse range is shown.
 */
export function formatDistance(distanceKm: number | null, viewerTier: DistanceTier, hideExactLocality: boolean): string | null {
  if (viewerTier !== "paid") return null;
  if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  if (hideExactLocality) {
    // Round up to the next 5 km bucket so a coarse range never narrows down a home area.
    const bucket = Math.max(5, Math.ceil(distanceKm / 5) * 5);
    return `~${bucket} km away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
}

/** Shared interests first, then the rest, with duplicates removed. */
export function orderInterestsByShared(theirInterests: readonly string[], myInterests: readonly string[]): { shared: string[]; other: string[] } {
  const mine = new Set(myInterests.map((item) => item.toLowerCase()));
  const shared: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();
  for (const interest of theirInterests) {
    const key = interest.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (mine.has(key)) shared.push(interest);
    else other.push(interest);
  }
  return { shared, other };
}

export function sharedInterestSentence(shared: readonly string[]): string | null {
  if (shared.length === 0) return null;
  if (shared.length === 1) return `You both like ${shared[0].toLowerCase()}`;
  const head = shared.slice(0, -1).map((item) => item.toLowerCase()).join(", ");
  return `You both like ${head} and ${shared[shared.length - 1].toLowerCase()}`;
}

export type ViewerRelationship = "stranger" | "request-sent" | "request-received" | "accepted" | "blocked";

export type ViewerAction = "ask-friendship" | "accept-request" | "chat" | "hangout" | "meetup" | "call" | "report" | "block" | "unblock";

/** Which actions the viewer can take, honouring verification, acceptance, and paid-tier gating. */
export function availableViewerActions(input: {
  relationship: ViewerRelationship;
  viewerCanRequestFriendship: boolean;
  paidTierActive: boolean;
}): ViewerAction[] {
  if (input.relationship === "blocked") return ["unblock", "report"];
  if (input.relationship === "accepted") {
    const actions: ViewerAction[] = ["chat", "hangout", "meetup"];
    if (input.paidTierActive) actions.push("call");
    actions.push("report", "block");
    return actions;
  }
  if (input.relationship === "request-received") return ["accept-request", "report", "block"];
  if (input.relationship === "request-sent") return ["report", "block"];
  const actions: ViewerAction[] = [];
  if (input.viewerCanRequestFriendship) actions.push("ask-friendship");
  actions.push("report", "block");
  return actions;
}

export function actionLabel(action: ViewerAction): string {
  const labels: Record<ViewerAction, string> = {
    "ask-friendship": "Ask for Friendship",
    "accept-request": "Accept request",
    chat: "Chat",
    hangout: "Hangout",
    meetup: "Meetup",
    call: "Call",
    report: "Report",
    block: "Block",
    unblock: "Unblock",
  };
  return labels[action];
}

/** How complete a profile is, used for the edit-mode progress hint. */
export function profileCompleteness(profile: EditableProfile): number {
  const checks = [
    profile.photos.length > 0,
    profile.name.trim().length >= 2,
    profile.bio.length >= 20,
    profile.interests.length >= 3,
    profile.languages.length > 0,
    profile.lookingFor.length > 0,
    profile.locality.trim().length >= 2,
    profile.verification === "id-selfie",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
