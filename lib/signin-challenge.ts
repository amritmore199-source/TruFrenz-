/**
 * Which sign-in a code belongs to.
 *
 * Why this is its own module: this one decision is the difference between a
 * sign-in that works and one that is impossible to complete, and it failed in a
 * way nothing else could catch. The code request used to hand the challenge id
 * back only inside an httpOnly cookie. On the web that is the right place for it —
 * a script on the page cannot read it, and it is not something the member has to
 * carry. On a phone there is no cookie jar: `fetch` in React Native does not
 * persist cookies between calls, so the id was simply gone by the time the code
 * came back to be checked. Every code was compared against nothing and refused as
 * expired, and the member was returned to the number screen with no way forward.
 * The same happened on the web whenever the app and the API sat on different
 * hosts, because a Lax cookie is not sent cross-site at all.
 *
 * So the id now travels in the response body as well, and this decides which of
 * the two to trust. Pure, so the rule can be tested without a request object.
 */

/** How long a challenge id may be, matching the column it is looked up in. */
export const MAX_CHALLENGE_TOKEN_LENGTH = 96;

/**
 * Picks the challenge id to look up.
 *
 * The cookie wins when it is present. That ordering is deliberate: the cookie is
 * httpOnly, so a script on the page cannot read it or replace it, while the body
 * token is necessarily readable by anything running on the page. A browser that
 * has the cookie is therefore the stronger case, and preferring it means a page
 * cannot use the body to redirect a sign-in that was already under way.
 *
 * The value is only ever used as a lookup key for a row that must already exist,
 * so a wrong or hostile value finds nothing and the caller refuses it. Nothing is
 * trusted on the strength of this string alone.
 */
export function resolveChallengeId(input: {
  /** The httpOnly cookie, when the caller sent one. */
  cookie?: string | null;
  /** The value the client echoed back from the code request. */
  body?: string | null;
}): string | null {
  const fromCookie = clean(input.cookie);
  if (fromCookie) return fromCookie;
  return clean(input.body);
}

/** Trims a candidate and refuses anything unusable, rather than passing it on. */
function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CHALLENGE_TOKEN_LENGTH) return null;
  return trimmed;
}
