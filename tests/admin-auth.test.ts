import { describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_TTL_MS,
  ROLE_CAPABILITIES,
  base32Decode,
  currentTotpCode,
  generateTotpSecret,
  hashPassword,
  hashSessionToken,
  roleCan,
  sessionExpiry,
  totpCodeForCounter,
  verifyPassword,
  verifyTotp,
  type AdminRole,
} from "../server/_core/adminAuth";
import {
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
  DEMO_ADMIN_TOTP_SECRET,
} from "../server/adminDb";

describe("admin password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("Trufrenz#Safety2026");
    expect(verifyPassword("Trufrenz#Safety2026", stored)).toBe(true);
    expect(verifyPassword("trufrenz#safety2026", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("produces a salted digest that never contains the raw password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("correct horse battery staple");
    expect(stored.split("$")).toHaveLength(3);
  });

  it("salts every hash so identical passwords differ", () => {
    expect(hashPassword("same-password")).not.toBe(hashPassword("same-password"));
  });

  it("rejects malformed stored values instead of throwing", () => {
    for (const bad of ["", "plaintext", "scrypt$only-salt", "bcrypt$aa$bb", "scrypt$zz$zz"]) {
      expect(verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("is deterministic when given the same salt", () => {
    const salt = "00112233445566778899aabbccddeeff";
    expect(hashPassword("repeatable", salt)).toBe(hashPassword("repeatable", salt));
  });
});

describe("TOTP second factor", () => {
  it("matches the RFC 6238 reference vector", () => {
    // Secret "12345678901234567890" in Base32, 59s after the epoch.
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpCodeForCounter(secret, 1)).toBe("287082");
  });

  it("produces six-digit codes", () => {
    const secret = generateTotpSecret();
    expect(currentTotpCode(secret)).toMatch(/^\d{6}$/);
  });

  it("generates distinct Base32 secrets of the expected length", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepts the current code and codes within the drift window", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, currentTotpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, currentTotpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, currentTotpCode(secret, now + 30_000), now)).toBe(true);
  });

  it("rejects codes outside the window and stale codes", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, currentTotpCode(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, currentTotpCode(secret, now + 120_000), now)).toBe(false);
  });

  it("rejects wrong, short, long, and non-numeric codes", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const correct = currentTotpCode(secret, now);
    const wrong = correct === "000000" ? "111111" : "000000";
    expect(verifyTotp(secret, wrong, now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
    expect(verifyTotp(secret, "1234567", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
    expect(verifyTotp(secret, "", now)).toBe(false);
  });

  it("tolerates whitespace in the submitted code", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const spaced = currentTotpCode(secret, now).split("").join(" ");
    expect(verifyTotp(secret, spaced, now)).toBe(true);
  });

  it("decodes Base32 secrets to bytes", () => {
    expect(base32Decode("JBSWY3DPEHPK3PXP")).toHaveLength(10);
    expect(base32Decode("").length).toBe(0);
  });

  it("accepts the seeded demo account's own secret", () => {
    expect(verifyTotp(DEMO_ADMIN_TOTP_SECRET, currentTotpCode(DEMO_ADMIN_TOTP_SECRET))).toBe(true);
  });
});

describe("admin sessions", () => {
  it("hashes tokens to a stable sha-256 digest", () => {
    const hash = hashSessionToken("token-value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken("token-value")).toBe(hash);
    expect(hashSessionToken("other-token")).not.toBe(hash);
  });

  it("expires sessions in the future", () => {
    const now = Date.now();
    const expiry = sessionExpiry(now);
    expect(expiry.getTime()).toBe(now + ADMIN_SESSION_TTL_MS);
    expect(expiry.getTime()).toBeGreaterThan(now);
  });
});

describe("admin roles", () => {
  const roles: AdminRole[] = ["owner", "admin", "moderator"];

  it("lets owners and admins run every module", () => {
    for (const role of ["owner", "admin"] as AdminRole[]) {
      expect(roleCan(role, "members.manage")).toBe(true);
      expect(roleCan(role, "subscriptions.manage")).toBe(true);
      expect(roleCan(role, "safety.broadcast")).toBe(true);
      expect(roleCan(role, "safety.flags")).toBe(true);
      expect(roleCan(role, "safety.keywords")).toBe(true);
      expect(roleCan(role, "verification.review")).toBe(true);
      expect(roleCan(role, "moderation.resolve")).toBe(true);
    }
  });

  it("restricts moderators to review and warn", () => {
    expect(roleCan("moderator", "verification.review")).toBe(true);
    expect(roleCan("moderator", "moderation.resolve")).toBe(true);
    expect(roleCan("moderator", "members.warn")).toBe(true);
    expect(roleCan("moderator", "members.manage")).toBe(false);
    expect(roleCan("moderator", "subscriptions.manage")).toBe(false);
    expect(roleCan("moderator", "safety.broadcast")).toBe(false);
    expect(roleCan("moderator", "safety.flags")).toBe(false);
  });

  it("denies unknown capabilities and roles", () => {
    for (const role of roles) {
      expect(roleCan(role, "not.a.capability")).toBe(false);
    }
    expect(roleCan("ghost" as AdminRole, "members.manage")).toBe(false);
  });

  it("keeps every declared capability spelled in a module namespace", () => {
    for (const role of roles) {
      for (const capability of ROLE_CAPABILITIES[role]) {
        expect(capability).toMatch(/^[a-z]+\.[a-z]+$/);
      }
    }
  });
});

describe("seeded demo credentials", () => {
  it("exposes a demo password long enough for the bootstrap minimum", () => {
    expect(DEMO_ADMIN_PASSWORD.length).toBeGreaterThanOrEqual(12);
  });

  it("uses a plausible work email address", () => {
    expect(DEMO_ADMIN_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
  });

  it("uses a Base32 TOTP secret", () => {
    expect(DEMO_ADMIN_TOTP_SECRET).toMatch(/^[A-Z2-7]+$/);
  });
});
