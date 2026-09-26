export const SESSION_STORAGE_KEY = "trufrenz.session.v1";

export type SessionMode = "member" | "guest";
export type SessionVerification = "phone-only" | "id-selfie";

export type StoredSession = {
  mode: SessionMode;
  name: string;
  locality: string;
  verification: SessionVerification;
  /** Verified date of birth (YYYY-MM-DD); the profile age is derived from it. */
  dateOfBirth?: string;
  /** Age captured at sign-up, used when the birth date is unavailable. */
  age?: number;
  /** Short mood/status line shown beside the member's name. */
  status?: { text: string; emoji?: string; updatedAt: string } | null;
  /** ISO timestamp of when the visitor entered the app. */
  enteredAt: string;
};

/** A signed-in member who finished onboarding. */
export function createMemberSession(input: {
  name: string;
  locality: string;
  verification?: SessionVerification;
  dateOfBirth?: string;
  age?: number;
  status?: { text: string; emoji?: string; updatedAt: string } | null;
  now?: Date;
}): StoredSession {
  return {
    mode: "member",
    name: input.name.trim().slice(0, 40),
    locality: input.locality.trim().slice(0, 60),
    verification: input.verification ?? "phone-only",
    dateOfBirth: input.dateOfBirth,
    age: input.age,
    status: input.status ?? null,
    enteredAt: (input.now ?? new Date()).toISOString(),
  };
}

/** A browse-only visitor who chose "Continue as guest". */
export function createGuestSession(now: Date = new Date()): StoredSession {
  return { mode: "guest", name: "", locality: "", verification: "phone-only", enteredAt: now.toISOString() };
}

/** Parse a persisted session, ignoring corrupted or unknown payloads. */
export function parseSession(serialized: string | null): StoredSession | null {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as Partial<StoredSession> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.mode !== "member" && parsed.mode !== "guest") return null;
    const verification: SessionVerification = parsed.verification === "id-selfie" ? "id-selfie" : "phone-only";
    const dateOfBirth = typeof parsed.dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateOfBirth) ? parsed.dateOfBirth : undefined;
    const age = typeof parsed.age === "number" && Number.isFinite(parsed.age) && parsed.age >= 18 ? Math.round(parsed.age) : undefined;
    const rawStatus = (parsed as { status?: unknown }).status;
    const status = rawStatus && typeof rawStatus === "object" && typeof (rawStatus as { text?: unknown }).text === "string"
      ? {
          text: String((rawStatus as { text: string }).text).slice(0, 60),
          emoji: typeof (rawStatus as { emoji?: unknown }).emoji === "string" ? String((rawStatus as { emoji: string }).emoji).slice(0, 4) : undefined,
          updatedAt: typeof (rawStatus as { updatedAt?: unknown }).updatedAt === "string" ? String((rawStatus as { updatedAt: string }).updatedAt) : new Date(0).toISOString(),
        }
      : null;
    return {
      mode: parsed.mode,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 40) : "",
      locality: typeof parsed.locality === "string" ? parsed.locality.slice(0, 60) : "",
      verification,
      dateOfBirth,
      age,
      status,
      enteredAt: typeof parsed.enteredAt === "string" ? parsed.enteredAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function serializeSession(session: StoredSession): string {
  return JSON.stringify(session);
}

/** The welcome screen is shown only when nothing has been stored yet. */
export function shouldShowWelcome(session: StoredSession | null): boolean {
  return session === null;
}

export function isGuestSession(session: StoredSession | null): boolean {
  return session?.mode === "guest";
}
