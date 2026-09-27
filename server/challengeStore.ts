/**
 * One-time-code challenges.
 *
 * Replaces the in-memory Map that used to hold these. That map broke in three
 * ways that all showed up as "the code does not work": a restart dropped every
 * in-flight sign-in, a second instance could not see a challenge the first one
 * issued, and a sign-up that spans several screens had no way to survive the
 * wait between proving the code and creating the account.
 *
 * The critical fix is `markVerified`. The old flow deleted the challenge the
 * moment a code matched, but the app verifies early and only creates the
 * account at the end of onboarding. That meant the account was never created on
 * the server at all. A challenge now stays alive after verification and is
 * consumed exactly once, by the call that finishes the account.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";

import { getDb } from "./db";
import { signinChallenges } from "../drizzle/schema";

/** How long a member has to use a code. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Failed attempts allowed before the challenge is burned. */
export const MAX_OTP_ATTEMPTS = 5;
/** How long a verified challenge stays usable while onboarding finishes. */
export const CHALLENGE_GRACE_MS = 30 * 60 * 1000;

export type ChallengeChannel = "phone" | "email";
export type ChallengePurpose = "signup" | "login";

export type Challenge = {
  challengeId: string;
  channel: ChallengeChannel;
  destination: string;
  purpose: ChallengePurpose;
  attempts: number;
  verifiedAt: Date | null;
  expiresAt: Date;
  consumedAt: Date | null;
};

/**
 * A six-digit code from a cryptographic source.
 *
 * `Math.random` would be predictable enough to guess from a few samples, which
 * matters when the code is the only thing standing in front of an account.
 */
export function generateOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
}

/** The opaque value handed to the client, so codes are never the key. */
export function generateChallengeId(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a code with the challenge id as salt.
 *
 * Salting with the id means two members who happen to receive the same six
 * digits do not share a hash, and a stolen table cannot be attacked with a
 * precomputed list of the million possible codes in one pass.
 */
export function hashOtp(code: string, challengeId: string): string {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}

/** Constant-time comparison, so a wrong code cannot be found by timing. */
export function otpMatches(code: string, challengeId: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOtp(code, challengeId), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Storage shape returned alongside the challenge, for the caller's response. */
export type IssuedChallenge = {
  challengeId: string;
  expiresAt: Date;
  /** Only present when there is genuinely no delivery provider configured. */
  demoCode?: string;
};

export class ChallengeUnavailableError extends Error {
  constructor() {
    super("Challenge storage is unavailable");
    this.name = "ChallengeUnavailableError";
  }
}

/**
 * Issue a challenge, replacing any earlier one for the same destination.
 *
 * Replacing matters: a member who taps "resend" three times must not end up
 * with three valid codes, only the newest. The unique index on
 * (channel, destination) is what enforces that, so this deletes first.
 *
 * `revealCode` is true only when no delivery provider can actually send the
 * code. Callers must never pass it in a deployment that can send.
 */
export async function issueChallenge(input: {
  channel: ChallengeChannel;
  destination: string;
  purpose: ChallengePurpose;
  revealCode: boolean;
}): Promise<IssuedChallenge & { code: string }> {
  const db = await getDb();
  if (!db) throw new ChallengeUnavailableError();

  const challengeId = generateChallengeId();
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  await db
    .delete(signinChallenges)
    .where(
      and(
        eq(signinChallenges.channel, input.channel),
        eq(signinChallenges.destination, input.destination),
      ),
    );

  await db.insert(signinChallenges).values({
    challengeId,
    channel: input.channel,
    destination: input.destination,
    codeHash: hashOtp(code, challengeId),
    purpose: input.purpose,
    attempts: 0,
    expiresAt,
  });

  return {
    challengeId,
    code,
    expiresAt,
    demoCode: input.revealCode ? code : undefined,
  };
}

/** The raw row, including the hash the caller must not send to the client. */
export async function loadChallenge(
  challengeId: string,
): Promise<(Challenge & { codeHash: string }) | null> {
  const db = await getDb();
  if (!db) throw new ChallengeUnavailableError();

  const rows = await db
    .select()
    .from(signinChallenges)
    .where(eq(signinChallenges.challengeId, challengeId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    challengeId: row.challengeId,
    channel: row.channel,
    destination: row.destination,
    purpose: row.purpose,
    attempts: row.attempts,
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    codeHash: row.codeHash,
  };
}

/** Record a failed attempt, returning the new count. */
export async function recordFailedAttempt(challengeId: string, attempts: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new ChallengeUnavailableError();
  const next = attempts + 1;
  await db
    .update(signinChallenges)
    .set({ attempts: next })
    .where(eq(signinChallenges.challengeId, challengeId));
  return next;
}

/**
 * Mark the code as proven without spending the challenge.
 *
 * This is the fix for the sign-up bug. The app proves the code early, then
 * collects a name, a birth date, and a photo before it creates the account. The
 * challenge has to survive that gap, so verification and consumption are now
 * two separate steps.
 *
 * The expiry is extended here because the grace period starts when the member
 * proves the code, not when it was sent.
 */
export async function markVerified(challengeId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new ChallengeUnavailableError();
  await db
    .update(signinChallenges)
    .set({ verifiedAt: new Date(), expiresAt: new Date(Date.now() + CHALLENGE_GRACE_MS) })
    .where(eq(signinChallenges.challengeId, challengeId));
}

/** Burn a challenge after the account-creating call finishes with it. */
export async function consumeChallenge(challengeId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new ChallengeUnavailableError();
  await db
    .update(signinChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(signinChallenges.challengeId, challengeId));
}

/** Forget a challenge, e.g. after too many wrong codes. */
export async function dropChallenge(challengeId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new ChallengeUnavailableError();
  await db.delete(signinChallenges).where(eq(signinChallenges.challengeId, challengeId));
}

/**
 * Remove challenges that are past saving.
 *
 * Verified-but-unconsumed rows are kept until the grace period lapses, since a
 * member may still be mid-onboarding.
 */
export async function pruneChallenges(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const stale = await db
    .delete(signinChallenges)
    .where(
      or(
        lt(signinChallenges.expiresAt, new Date()),
        and(
          isNull(signinChallenges.verifiedAt),
          lt(signinChallenges.createdAt, new Date(Date.now() - CHALLENGE_TTL_MS)),
        ),
      ),
    );
  // mysql2 reports affected rows on the result header rather than a tuple.
  return Number((stale as unknown as { affectedRows?: number })?.affectedRows ?? 0);
}

/**
 * The reason a challenge cannot be used yet, or null when it can.
 *
 * Kept pure so the rules are testable without a database, and so the route and
 * the tests cannot drift apart.
 */
export function challengeProblem(
  challenge: Challenge | null,
  now: number,
): "missing" | "expired" | "consumed" | "exhausted" | "already-verified" | null {
  if (!challenge) return "missing";
  if (challenge.consumedAt) return "consumed";
  if (challenge.expiresAt.getTime() <= now) return "expired";
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) return "exhausted";
  return null;
}

/** Whether this challenge has already had its code accepted. */
export function isVerified(challenge: Challenge | null): boolean {
  return Boolean(challenge?.verifiedAt);
}