/**
 * Email addresses.
 *
 * Shared by the server and the app so a member can never be told an address is
 * fine on one side and rejected on the other. The rules are deliberately
 * conservative: a recovery address only helps if mail actually reaches it, so
 * anything ambiguous is refused rather than accepted and silently dropped.
 */

/** The longest address the `members.email` column can hold. */
export const EMAIL_MAX_LENGTH = 320;

/**
 * Practical address shape, not RFC 5322.
 *
 * Full RFC compliance accepts things no mail provider will deliver to, so this
 * checks what actually works: a local part, one @, a domain with at least one
 * dot, and a plausible top-level label.
 */
const ADDRESS = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Why an address was rejected, so the caller can say something useful. */
export type EmailProblem = "empty" | "too-long" | "shape";

export type EmailCheck =
  | { ok: true; email: string }
  | { ok: false; problem: EmailProblem };

/**
 * Normalise an address for storage and comparison.
 *
 * Addresses are case-insensitive in practice: "Dana@Example.com" and
 * "dana@example.com" are the same mailbox. Storing them lowercased means a
 * member cannot end up with two accounts whose recovery addresses differ only
 * in capitalisation.
 */
export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/** Validate an address, returning the normalised form on success. */
export function checkEmail(value: unknown): EmailCheck {
  const email = normalizeEmail(value);
  if (!email) return { ok: false, problem: "empty" };
  if (email.length > EMAIL_MAX_LENGTH) return { ok: false, problem: "too-long" };
  if (!ADDRESS.test(email)) return { ok: false, problem: "shape" };
  return { ok: true, email };
}

/** True when the value looks like a usable address. */
export function isValidEmail(value: unknown): boolean {
  return checkEmail(value).ok;
}

/** Plain-language reason for a rejected address, or null when it is fine. */
export function emailProblemMessage(value: unknown): string | null {
  const result = checkEmail(value);
  if (result.ok) return null;
  if (result.problem === "too-long") return "That email address is too long.";
  return "Check the email address — it should look like name@example.com.";
}

/**
 * The address a code was sent to, partly hidden.
 *
 * Members need to recognise which address they used without the screen ever
 * showing a full address back to whoever is holding the device.
 */
export function maskEmail(value: unknown): string {
  const email = normalizeEmail(value);
  const at = email.indexOf("@");
  if (at <= 0) return email ? "•••" : "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  // Keep the first character so the member recognises it, and the whole domain
  // so they can tell which mailbox it went to.
  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}