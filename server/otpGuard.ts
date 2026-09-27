/**
 * Storage for the sending limits in `lib/otp-limits.ts`.
 *
 * This file only records and counts. Every decision lives in the pure module,
 * so the rules can be tested without a database and the route cannot drift from
 * what the tests assert.
 *
 * The caller fingerprint is a hash of the request's address and user agent. It
 * exists to count requests per device, not to identify anyone: the raw values
 * are never stored, and the digest is salted with a per-deployment value so the
 * same caller cannot be correlated across environments.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";

import { getDb } from "./db";
import { otpSendAttempts } from "../drizzle/schema";
import {
  CALLER_FAILED_WINDOW_MS,
  CALLER_LONG_WINDOW_MS,
  type FailureRecord,
  type SendRecord,
} from "../lib/otp-limits";

/**
 * Turn a request into a stable, non-identifying key.
 *
 * `x-forwarded-for` is read first because the app runs behind a proxy in
 * production; the socket address is the fallback for local development. The
 * user agent is included so that two people behind one office NAT are counted
 * separately, which is the difference between a shared network working and
 * being locked out.
 */
export function callerKeyFor(input: {
  forwardedFor?: string | string[] | undefined;
  remoteAddress?: string | undefined;
  userAgent?: string | undefined;
}): string {
  const forwarded = Array.isArray(input.forwardedFor)
    ? input.forwardedFor[0]
    : input.forwardedFor;
  // The left-most entry is the original client when a proxy appends to the list.
  const address = (forwarded ?? input.remoteAddress ?? "unknown").split(",")[0]!.trim();
  const agent = (input.userAgent ?? "unknown").slice(0, 200);
  const salt = process.env.OTP_CALLER_SALT ?? "trufrenz-otp";
  return createHash("sha256").update(`${salt}:${address}:${agent}`).digest("hex").slice(0, 64);
}

/** Record that a code was sent, so the windows can count it. */
export async function recordSend(input: {
  channel: "phone" | "email";
  destination: string;
  callerKey: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(otpSendAttempts).values({
    kind: "send",
    channel: input.channel,
    destination: input.destination,
    callerKey: input.callerKey,
  });
}

/**
 * The sends worth counting for one destination and caller.
 *
 * Scoped to the longer of the two windows so the query stays small as the log
 * grows, and narrowed to rows that match either the destination or the caller
 * so one round trip answers all five counts.
 */
export async function recentSends(input: {
  destination: string;
  callerKey: string;
  now: number;
}): Promise<SendRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const floor = new Date(input.now - CALLER_LONG_WINDOW_MS);
  const rows = await db
    .select({
      destination: otpSendAttempts.destination,
      callerKey: otpSendAttempts.callerKey,
      createdAt: otpSendAttempts.createdAt,
    })
    .from(otpSendAttempts)
    .where(and(eq(otpSendAttempts.kind, "send"), gte(otpSendAttempts.createdAt, floor)))
    .orderBy(desc(otpSendAttempts.createdAt))
    .limit(500);

  return rows
    .filter((r) => r.destination === input.destination || r.callerKey === input.callerKey)
    .map((r) => ({
      destination: r.destination,
      callerKey: r.callerKey,
      createdAt: r.createdAt.getTime(),
    }));
}

/**
 * Record a wrong code.
 *
 * The challenge already counts attempts against itself, but the lock is per
 * caller and a challenge does not know who asked. This is the second layer:
 * someone cycling through fresh challenges to get more guesses is stopped here
 * rather than at the challenge they discard.
 */
export async function recordFailedVerification(input: {
  callerKey: string;
  channel: "phone" | "email";
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(otpSendAttempts).values({
    kind: "failure",
    channel: input.channel,
    destination: "",
    callerKey: input.callerKey,
  });
}

/** Wrong codes by one caller inside the lock window. */
export async function recentFailures(callerKey: string, now: number): Promise<FailureRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const floor = new Date(now - CALLER_FAILED_WINDOW_MS);
  const rows = await db
    .select({ callerKey: otpSendAttempts.callerKey, createdAt: otpSendAttempts.createdAt })
    .from(otpSendAttempts)
    .where(
      and(
        eq(otpSendAttempts.kind, "failure"),
        eq(otpSendAttempts.callerKey, callerKey),
        gte(otpSendAttempts.createdAt, floor),
      ),
    )
    .limit(200);
  return rows.map((r) => ({ callerKey: r.callerKey, createdAt: r.createdAt.getTime() }));
}

/**
 * Drop log rows outside the longest window.
 *
 * Runs alongside challenge pruning. Without it the table grows forever, and
 * this is a high-write table precisely because it counts abuse.
 */
export async function pruneSendLog(now: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(now - CALLER_LONG_WINDOW_MS);
  const result = await db.delete(otpSendAttempts).where(lt(otpSendAttempts.createdAt, cutoff));
  return Number((result as unknown as { affectedRows?: number })?.affectedRows ?? 0);
}
