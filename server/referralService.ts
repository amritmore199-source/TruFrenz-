/**
 * Who invited whom.
 *
 * The invite link carries a code derived from the sender's account, so the
 * moment a new member finishes signing up the server knows which code brought
 * them. That is what turns the referral month in the pricing plan from a promise
 * into something the app can actually honour: without attribution there is no
 * way to tell an invited member from an organic one, and a referral reward could
 * never be paid to the right person.
 *
 * Two decisions are deliberate and worth keeping:
 *
 *  - Attribution is recorded once and never rewritten. A member who later opens
 *    somebody else's link is already attributed; reassigning them would let a
 *    reward be stolen simply by sharing a link more widely.
 *
 *  - A member is never attributed to themselves. It costs nothing to check and
 *    it is the cheapest way to stop a self-referral farming loop, which is the
 *    first thing anybody tries.
 *
 * The service resolves a code to a member by hashing candidate account ids and
 * comparing, rather than storing a code column on the inviter's row. The code is
 * a pure function of the account, so there is nothing to keep in step — and
 * nothing to go stale if an id is ever reissued to a different person.
 */

import { eq } from "drizzle-orm";

import { members } from "../drizzle/schema";
import { getDb } from "./db";
import { inviteCode } from "../lib/invite-link";

/** The public face of an invitation: who sent it, and nothing else. */
export type InviterCard = { name: string; code: string };

/**
 * Who a code belongs to, for the landing page.
 *
 * Deliberately returns only a display name. The page is public and unauthenticated
 * — anybody with a code can open it — so it must not carry an account id, a
 * locality, a verification tier, or anything else that would let a stranger
 * browse the membership by guessing links.
 */
export async function findInviterByCode(code: string): Promise<InviterCard | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: members.id, name: members.name }).from(members).limit(20000);
  const match = rows.find((row) => inviteCode(row.id) === normalized);
  if (!match) return null;
  const first = match.name.trim().split(/\s+/)[0] ?? "";
  return { name: first.slice(0, 40), code: normalized };
}

/** The shape this module needs from a member row. */
type MemberLike = { id: number; referredByCode?: string | null; referredAt?: Date | null };

export const REFERRAL_CODE_PATTERN = /^[a-z2-9]{8}$/;

/** A code from a URL or a request body, or null when it is not a code at all. */
export function normalizeReferralCode(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(value) ? value : null;
}

/**
 * Whether this signup should be attributed to `code`.
 *
 * Pure, so the rules are testable without a database: the code has to be
 * well-formed, the member has to not be attributed already, and the code must
 * not belong to the member themselves.
 */
export function shouldAttributeReferral(options: {
  code: string | null;
  member: MemberLike;
  inviterId: number | null;
}): boolean {
  const { code, member, inviterId } = options;
  if (!code || !REFERRAL_CODE_PATTERN.test(code)) return false;
  if (member.referredByCode) return false;
  if (inviterId === null) return false;
  if (inviterId === member.id) return false;
  return true;
}

/**
 * Find the member a code belongs to.
 *
 * The code is not stored anywhere, so this walks the accounts and matches the
 * derived value. That is a full scan, which is fine at the scale this app has
 * (a referral is resolved once, at signup) and is the honest trade for not
 * keeping a second copy of a derivable value in step. `limit` is deliberately
 * generous rather than unbounded so a runaway table cannot stall a signup.
 */
export async function findMemberByReferralCode(code: string, limit = 20000): Promise<number | null> {
  if (!REFERRAL_CODE_PATTERN.test(code)) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: members.id }).from(members).limit(limit);
  for (const row of rows) {
    if (inviteCode(row.id) === code) return row.id;
  }
  return null;
}

/**
 * Record that `memberId` was invited by the owner of `code`.
 *
 * Returns what happened rather than a bare boolean, because the caller has to
 * tell the member something and "we could not find that code" is a different
 * message from "welcome aboard".
 */
export async function attributeReferral(
  memberId: number,
  code: unknown,
): Promise<{ ok: boolean; reason?: "bad-code" | "no-db" | "unknown-code" | "self" | "already" }> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return { ok: false, reason: "bad-code" };
  const db = await getDb();
  if (!db) return { ok: false, reason: "no-db" };

  const rows = await db
    .select({
      id: members.id,
      referredByCode: members.referredByCode,
      referredAt: members.referredAt,
    })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  const member = rows[0];
  if (!member) return { ok: false, reason: "no-db" };

  const inviterId = await findMemberByReferralCode(normalized);
  if (member.referredByCode) return { ok: false, reason: "already" };
  if (inviterId === null) return { ok: false, reason: "unknown-code" };
  if (!shouldAttributeReferral({ code: normalized, member, inviterId })) {
    return { ok: false, reason: inviterId === memberId ? "self" : "already" };
  }

  await db
    .update(members)
    .set({ referredByCode: normalized, referredAt: new Date() })
    .where(eq(members.id, memberId));
  return { ok: true };
}

/**
 * How many members a given code has brought in.
 *
 * This is the number a referral reward is based on, so it counts attributed
 * members only — an invitation that was sent but never accepted is not an
 * invitation that worked.
 */
export async function referralCountFor(memberId: number): Promise<number> {
  const code = inviteCode(memberId);
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.referredByCode, code));
  return rows.length;
}