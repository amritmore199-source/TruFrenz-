import { describe, expect, it } from "vitest";

import {
  checkEmail,
  emailProblemMessage,
  isValidEmail,
  maskEmail,
  normalizeEmail,
} from "../lib/email";
import {
  challengeProblem,
  generateOtp,
  hashOtp,
  isVerified,
  MAX_OTP_ATTEMPTS,
  otpMatches,
  type Challenge,
} from "../server/challengeStore";
import { describeFailure, redactCode } from "../server/mailer";

/** A challenge shaped for the rules under test, with sensible defaults. */
function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    challengeId: "abc123",
    channel: "phone",
    destination: "+919810000000",
    purpose: "signup",
    attempts: 0,
    verifiedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    ...overrides,
  };
}

describe("email addresses", () => {
  it("normalises case and whitespace", () => {
    expect(normalizeEmail("  Dana@Example.COM  ")).toBe("dana@example.com");
    expect(checkEmail("  Dana@Example.COM  ")).toEqual({ ok: true, email: "dana@example.com" });
  });

  it("accepts ordinary addresses", () => {
    for (const address of [
      "dana@example.com",
      "dana.rao+friends@example.co.in",
      "d_1@sub.domain.example.org",
    ]) {
      expect(isValidEmail(address), address).toBe(true);
    }
  });

  it("refuses shapes that could never be delivered to", () => {
    for (const address of ["", "   ", "dana", "dana@", "@example.com", "dana@example", "a b@example.com"]) {
      expect(isValidEmail(address), address).toBe(false);
    }
  });

  it("refuses non-strings rather than coercing them", () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(42)).toBe(false);
    expect(isValidEmail({})).toBe(false);
  });

  it("refuses an address too long for the column", () => {
    const long = `${"a".repeat(320)}@example.com`;
    const result = checkEmail(long);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toBe("too-long");
    expect(emailProblemMessage(long)).toMatch(/too long/i);
  });

  it("explains a rejected address in plain language", () => {
    expect(emailProblemMessage("nope")).toMatch(/name@example.com/);
    expect(emailProblemMessage("dana@example.com")).toBeNull();
  });

  it("masks an address while keeping it recognisable", () => {
    const masked = maskEmail("dana.rao@example.com");
    expect(masked.startsWith("d")).toBe(true);
    expect(masked.endsWith("@example.com")).toBe(true);
    // The local part must not survive in a readable form.
    expect(masked).not.toContain("dana");
    expect(masked).not.toContain("rao");
  });

  it("does not crash on a malformed address", () => {
    expect(maskEmail("no-at-sign")).toBe("•••");
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });
});

describe("one-time codes", () => {
  it("always produces exactly six digits", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("does not favour small numbers by padding the wrong end", () => {
    // Modulo of a 32-bit value can be small; padStart must keep six digits.
    const codes = new Set(Array.from({ length: 300 }, () => generateOtp()));
    for (const code of codes) expect(code.length).toBe(6);
    // A real random source should not repeat much over 300 draws.
    expect(codes.size).toBeGreaterThan(250);
  });

  it("salts the hash with the challenge id, so equal codes differ", () => {
    const a = hashOtp("123456", "challenge-a");
    const b = hashOtp("123456", "challenge-b");
    expect(a).not.toBe(b);
  });

  it("matches only the right code", () => {
    const id = "abc123";
    const hash = hashOtp("654321", id);
    expect(otpMatches("654321", id, hash)).toBe(true);
    expect(otpMatches("654322", id, hash)).toBe(false);
    // A code replayed against another challenge must not match.
    expect(otpMatches("654321", "other-id", hash)).toBe(false);
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(otpMatches("123456", "abc", "not-hex")).toBe(false);
    expect(otpMatches("123456", "abc", "")).toBe(false);
  });
});

describe("challenge rules", () => {
  const now = Date.now();

  it("allows a fresh challenge", () => {
    expect(challengeProblem(challenge(), now)).toBeNull();
  });

  it("refuses a missing, expired or already-used challenge", () => {
    expect(challengeProblem(null, now)).toBe("missing");
    expect(challengeProblem(challenge({ expiresAt: new Date(now - 1) }), now)).toBe("expired");
    expect(challengeProblem(challenge({ consumedAt: new Date(now - 5000) }), now)).toBe("consumed");
  });

  it("treats the expiry instant as expired, not valid", () => {
    expect(challengeProblem(challenge({ expiresAt: new Date(now) }), now)).toBe("expired");
  });

  it("burns a challenge once the attempt limit is reached", () => {
    expect(challengeProblem(challenge({ attempts: MAX_OTP_ATTEMPTS - 1 }), now)).toBeNull();
    expect(challengeProblem(challenge({ attempts: MAX_OTP_ATTEMPTS }), now)).toBe("exhausted");
  });

  it("still allows a verified challenge, because onboarding continues", () => {
    // This is the sign-up fix: proving the code must NOT end the challenge,
    // otherwise the later account-creating call has nothing to use.
    const verified = challenge({ verifiedAt: new Date(now - 1000), attempts: 3 });
    expect(isVerified(verified)).toBe(true);
    expect(challengeProblem(verified, now)).toBeNull();
  });

  it("refuses a verified challenge once it is consumed", () => {
    const spent = challenge({ verifiedAt: new Date(now - 5000), consumedAt: new Date(now - 1000) });
    expect(challengeProblem(spent, now)).toBe("consumed");
  });

  it("reports verification only after the code was accepted", () => {
    expect(isVerified(challenge())).toBe(false);
    expect(isVerified(null)).toBe(false);
    expect(isVerified(challenge({ verifiedAt: new Date() }))).toBe(true);
  });
});

describe("logging safety", () => {
  it("strips a six-digit code from anything about to be logged", () => {
    expect(redactCode("code 123456 was rejected")).toBe("code •••••• was rejected");
    expect(redactCode("123456")).toBe("••••••");
  });

  it("keeps a failure message short and readable", () => {
    const described = describeFailure(422, '{"message":"invalid from address 778899"}');
    expect(described).toContain("HTTP 422");
    expect(described).toContain("••••••");
    expect(described).not.toContain("778899");
  });

  it("never leaves a bare status code without context", () => {
    expect(describeFailure(500, "")).toBe("HTTP 500");
    expect(describeFailure(500, "   ")).toBe("HTTP 500");
  });
});