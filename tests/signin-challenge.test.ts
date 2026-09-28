import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_CHALLENGE_TOKEN_LENGTH, resolveChallengeId } from "../lib/signin-challenge";

/*
 * A sign-in that could not be completed.
 *
 * The code request handed the challenge id back only inside an httpOnly cookie.
 * On a phone that cookie does not exist — fetch in React Native keeps no cookie
 * jar — so the id was gone before the code came back to be checked, every code
 * was compared against nothing, and the member was told their code had expired
 * and sent back to the number screen. The app looked like it was ignoring the
 * correct code, and there was no way forward from that screen.
 *
 * The rule is small, which is exactly why it is worth pinning: nothing about the
 * code itself was wrong, so no test of codes, hashing or expiry could have caught
 * it. Only a test of "which challenge does this call belong to" can.
 */
describe("which sign-in a call belongs to", () => {
  it("takes the body token when there is no cookie, which is the phone case", () => {
    expect(resolveChallengeId({ cookie: null, body: "abc123" })).toBe("abc123");
  });

  it("prefers the cookie, because a script on the page cannot read it", () => {
    expect(resolveChallengeId({ cookie: "from-cookie", body: "from-body" })).toBe("from-cookie");
  });

  it("falls back to the body when the cookie is present but empty", () => {
    expect(resolveChallengeId({ cookie: "", body: "from-body" })).toBe("from-body");
  });

  it("refuses an id that is too long to be one of ours", () => {
    const tooLong = "a".repeat(MAX_CHALLENGE_TOKEN_LENGTH + 1);
    expect(resolveChallengeId({ cookie: null, body: tooLong })).toBeNull();
    expect(resolveChallengeId({ cookie: tooLong, body: null })).toBeNull();
  });

  it("accepts an id exactly at the limit", () => {
    const atLimit = "a".repeat(MAX_CHALLENGE_TOKEN_LENGTH);
    expect(resolveChallengeId({ cookie: null, body: atLimit })).toBe(atLimit);
  });

  it("trims rather than refusing a value with stray whitespace", () => {
    expect(resolveChallengeId({ cookie: null, body: "  abc123  " })).toBe("abc123");
  });

  it("answers null instead of an empty string, so callers refuse rather than look up", () => {
    // An empty string is truthy in no useful way here, but it would reach the
    // database as a lookup that can only ever miss. Null is the honest answer.
    expect(resolveChallengeId({ cookie: null, body: "   " })).toBeNull();
    expect(resolveChallengeId({ cookie: "", body: "" })).toBeNull();
    expect(resolveChallengeId({})).toBeNull();
  });

  it("ignores anything that is not a string", () => {
    expect(resolveChallengeId({ cookie: null, body: 42 as unknown as string })).toBeNull();
    expect(resolveChallengeId({ cookie: null, body: {} as unknown as string })).toBeNull();
    expect(resolveChallengeId({ cookie: [] as unknown as string, body: null })).toBeNull();
  });
});

/*
 * The wiring, held in place.
 *
 * The rule above only helps if the token is actually issued and echoed back. This
 * is the shape of the bug: every piece worked, and the one link between them was
 * missing, so the failure was invisible to any test that exercised the pieces
 * separately.
 */
describe("the token's journey", () => {
  const routes = readFileSync(join(__dirname, "..", "server/accountRoutes.ts"), "utf8");
  const client = readFileSync(join(__dirname, "..", "lib/account-client.ts"), "utf8");
  const screen = readFileSync(join(__dirname, "..", "app/(tabs)/index.tsx"), "utf8");

  it("is issued with the code, alongside the cookie", () => {
    expect(routes).toContain("challengeToken: challengeTokenFor(issued.challengeId)");
  });

  it("is accepted on both calls that need the challenge", () => {
    const used = routes.split("readChallengeId(req)").length - 1;
    expect(used).toBe(2);
  });

  it("is carried by the client's own types", () => {
    expect(client).toContain("challengeToken?: string;");
    expect(client).toContain("challengeToken?: string | null;");
  });

  it("is remembered when a code is issued and sent back when it is checked", () => {
    expect(screen).toContain("setChallengeToken(result.data.challengeToken ?? null)");
    expect(screen).toContain("verifyCode(passcode, challengeToken)");
    expect(screen).toContain("completeSignin({ challengeToken })");
  });

  it("is cleared when the member starts a fresh sign-in", () => {
    // A stale token would send the next attempt at the wrong challenge, which
    // reads as the code being rejected for no reason the member can see.
    expect(screen).toContain("setChallengeToken(null)");
  });
});
