import { describe, expect, it } from "vitest";
import { memberAuthorizationHeader, memberTokenFromAuthorization } from "../lib/account-auth";

describe("native member-session authorization", () => {
  it("formats a stored token as a Bearer header", () => {
    expect(memberAuthorizationHeader("a".repeat(64))).toBe(`Bearer ${"a".repeat(64)}`);
  });

  it("omits absent or whitespace-only tokens", () => {
    expect(memberAuthorizationHeader(null)).toBeUndefined();
    expect(memberAuthorizationHeader("  ")).toBeUndefined();
  });

  it("parses only a bounded, well-formed Bearer token", () => {
    const token = "A_9-".repeat(16);
    expect(memberTokenFromAuthorization(`Bearer ${token}`)).toBe(token);
    expect(memberTokenFromAuthorization(`bearer ${token}`)).toBe(token);
    expect(memberTokenFromAuthorization(`Basic ${token}`)).toBeNull();
    expect(memberTokenFromAuthorization("Bearer short")).toBeNull();
    expect(memberTokenFromAuthorization(undefined)).toBeNull();
  });
});
