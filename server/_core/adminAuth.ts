/**
 * Admin authentication — deliberately separate from the consumer app's phone OTP.
 *
 * The dashboard uses email + password + a TOTP second factor, and issues its own
 * session cookie. Nothing here shares state with the member sign-in flow, so a
 * compromised member account can never reach the internal dashboard.
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Request } from "express";

export const ADMIN_COOKIE_NAME = "trufrenz_admin_session";
export const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous, current, and next step to tolerate clock drift. */
export const TOTP_WINDOW = 1;

const SCRYPT_KEYLEN = 64;

/* ------------------------------- passwords ------------------------------- */

/** Hash a password as `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Constant-time password check. Returns false for malformed stored values
 * rather than throwing, so a bad row can never bypass the login.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;

  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

/* ---------------------------------- TOTP --------------------------------- */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Generate a Base32 secret suitable for an authenticator app. */
export function generateTotpSecret(byteLength = 20): string {
  const bytes = randomBytes(byteLength);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");

  let secret = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
}

export function base32Decode(secret: string): Buffer {
  const normalized = secret.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = "";
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Compute the 6-digit code for a given counter value (RFC 6238, SHA-1). */
export function totpCodeForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter % 0x100000000, 4);

  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/** Current TOTP code — handy for tests and for the seeded demo account. */
export function currentTotpCode(secret: string, atMs: number = Date.now()): string {
  return totpCodeForCounter(secret, Math.floor(atMs / 1000 / TOTP_STEP_SECONDS));
}

/**
 * Verify a submitted code against the accepted time window. Comparison is
 * constant-time and non-numeric input is rejected outright.
 */
export function verifyTotp(
  secret: string,
  code: string,
  atMs: number = Date.now(),
  window: number = TOTP_WINDOW,
): boolean {
  const submitted = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(submitted)) return false;

  const step = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
  const submittedBuf = Buffer.from(submitted);

  for (let drift = -window; drift <= window; drift++) {
    const candidate = Buffer.from(totpCodeForCounter(secret, step + drift));
    if (candidate.length === submittedBuf.length && timingSafeEqual(candidate, submittedBuf)) {
      return true;
    }
  }
  return false;
}

/* -------------------------------- sessions ------------------------------- */

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(now: number = Date.now()): Date {
  return new Date(now + ADMIN_SESSION_TTL_MS);
}

/** Parse the admin cookie without pulling in a cookie-parser dependency. */
export function readAdminCookie(req: Request): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ADMIN_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export type AdminRole = "owner" | "admin" | "moderator";

/** Which dashboard actions each role may perform. */
export const ROLE_CAPABILITIES: Record<AdminRole, readonly string[]> = {
  owner: [
    "verification.review",
    "moderation.resolve",
    "members.manage",
    "subscriptions.manage",
    "safety.broadcast",
    "safety.flags",
    "safety.keywords",
  ],
  admin: [
    "verification.review",
    "moderation.resolve",
    "members.manage",
    "subscriptions.manage",
    "safety.broadcast",
    "safety.flags",
    "safety.keywords",
  ],
  moderator: ["verification.review", "moderation.resolve", "members.warn"],
};

export function roleCan(role: AdminRole, capability: string): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}
