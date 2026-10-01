/**
 * The link a member sends when they invite someone.
 *
 * The invite used to be a bare domain: `https://trufrenz.net`. That address
 * carries no information, so it could not tell the app who sent the invitation,
 * which screen to open, or whether a particular invite was ever used. It also
 * put every single invite behind one web page whose only job would be to guess
 * what the visitor wanted.
 *
 * An invite is now a link with a path and a code: `https://trufrenz.net/i/CODE`.
 * The code is derived from the member's account, so the same person's invites
 * always carry the same code. That is what makes the two things this link has to
 * do possible — open the app on the right screen, and let a signup be traced
 * back to the person who sent the invitation, which is the whole basis of the
 * referral month promised in the pricing plan.
 *
 * Everything here is pure. Delivering the message, and deciding what the link
 * opens into, happen elsewhere.
 */

/** The path a link points at. Kept in one place so the app and the web agree. */
export const INVITE_PATH = "i";

/**
 * The deep-link scheme the built app answers to.
 *
 * Deliberately not a constant. The scheme is generated from the bundle id at
 * build time, so it changes whenever the app is built under a new identifier —
 * a hardcoded "trufrenz://" would have been wrong on the very first build (the
 * shipped app answers to `manuskindrednearby://`) and would break silently on
 * the next one. Callers read the live value out of the app config.
 */
export function resolveInviteScheme(configured?: string | string[] | null): string {
  // The app config types this as string | string[] | null, so the first usable
  // entry wins rather than the value being trusted to be a string.
  const candidate = Array.isArray(configured) ? configured[0] : configured;
  const scheme = (candidate ?? "").trim();
  return /^[a-z][a-z0-9+.-]*$/i.test(scheme) ? scheme : "";
}

/**
 * The address a link falls back to when nothing is configured.
 *
 * This is a real registered domain, but a domain is not a website. The app has
 * no page at this address yet, so `inviteLinkIsLive` reports it as staged rather
 * than pretending the link works.
 */
export const INVITE_BASE_FALLBACK = "https://trufrenz.net";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * A short, stable code for a member.
 *
 * FNV-1a rather than a cryptographic hash: this value is not a secret and is
 * not guarding anything, it only has to be the same for the same member and
 * different between members. The ambiguous characters — i, l, o, 0, 1 — are out
 * of the alphabet, because these codes get read aloud and copied by hand.
 */
export function inviteCode(seed: string | number): string {
  const text = String(seed ?? "").trim().toLowerCase();
  if (!text) return "";
  /*
   * Iterated by code point rather than by index. `text[index]` walks UTF-16 code
   * units, so a single emoji in a display name reads back as half a surrogate
   * pair — and the result of `hash ^ undefined` is `undefined`, which made the
   * rest of the code overflow into the literal string "undefined". A member
   * whose name contained an emoji got a link ending in `...aweundefined`.
   */
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let code = "";
  let value = hash;
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET[value % CODE_ALPHABET.length];
    value = Math.floor(value / CODE_ALPHABET.length);
    // The hash is 32 bits, which the alphabet exhausts after six characters.
    // Re-mixing keeps the last two characters meaningful instead of zero-padding.
    /*
     * The mix is kept inside unsigned 32-bit range on purpose. `^` in
     * JavaScript returns a *signed* int32, so once the hash has its top bit set
     * — which is half of all seeds — the XOR comes back negative, `value % 31`
     * is negative, and the alphabet lookup returns `undefined`. The code then
     * ends with the literal word "undefined": `maya` produced
     * `wdk9a4dundefined`. Math.imul keeps the multiply in int32 and `>>> 0`
     * brings the result back to unsigned, so the index is never negative.
     */
    if (value === 0) value = (hash ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  }
  return code;
}

/** Trailing slashes on a configured base would otherwise double up in the path. */
function normalizeBase(baseUrl: string): string {
  return (baseUrl || "").trim().replace(/\/+$/, "");
}

/** The web link for a member's invitation. */
export function buildInviteLink(baseUrl: string, seed: string | number): string {
  const base = normalizeBase(baseUrl) || INVITE_BASE_FALLBACK;
  const code = inviteCode(seed);
  if (!code) return base;
  return `${base}/${INVITE_PATH}/${code}`;
}

/**
 * The link that opens the installed app directly.
 *
 * Sent alongside the web link rather than instead of it, because the people
 * being invited may or may not have the app — and somebody who does not have it
 * needs the web address, not a scheme their phone cannot open.
 */
export function buildInviteAppLink(scheme: string | string[] | null | undefined, seed: string | number): string {
  const resolved = resolveInviteScheme(scheme);
  const code = inviteCode(seed);
  if (!resolved || !code) return "";
  return `${resolved}://${INVITE_PATH}?code=${code}`;
}

/**
 * Whether the invite link is worth sending.
 *
 * A link is only usable if something is actually serving that path. Until a
 * landing page exists, the honest thing is to say so rather than hand a member a
 * URL that 404s to their friend — which is how an invitation turns into an
 * embarrassment. This reports the state; the caller decides what to do about it.
 */
export function inviteLinkIsLive(baseUrl?: string | null): boolean {
  const base = normalizeBase(baseUrl ?? "");
  if (!base) return false;
  // The shipped default has no page behind it yet, so it is not live.
  if (base === normalizeBase(INVITE_BASE_FALLBACK)) return false;
  return /^https?:\/\/[^/\s]+/i.test(base);
}

/**
 * The message drafted for a contact.
 *
 * It names the sender, because an invitation from an unknown number is exactly
 * what a safety-first app should not be sending. It also says plainly that this
 * is a friendship app and not a dating app, which is the one thing the recipient
 * needs to know before they open anything.
 */
export function inviteSmsText(options: {
  link: string;
  fromName?: string | null;
  appLink?: string | null;
}): string {
  const sender = (options.fromName ?? "").trim();
  const opener = sender ? `${sender} invited you to Trufrenz.` : "You're invited to Trufrenz.";
  const lines = [
    opener,
    "A calm, safety-first app for finding friends nearby — not dating.",
    "Join here:",
    options.link,
  ];
  if (options.appLink) lines.push(`Already have it? ${options.appLink}`);
  return lines.join("\n");
}

/**
 * What to tell the member about the link they are about to send.
 *
 * Kept next to the link builder so the warning and the link cannot disagree: if
 * the link becomes live, this copy changes with it.
 */
export function inviteReadinessNote(baseUrl?: string | null): string {
  return inviteLinkIsLive(baseUrl)
    ? "Your invite link is live. Contacts can open it straight from the message."
    : "Your invite link points at a page that isn't published yet. The message still opens, but the link will not load until the landing page is live — set EXPO_PUBLIC_INVITE_URL once it is.";
}
