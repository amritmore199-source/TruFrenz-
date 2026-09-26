import { describe, expect, it } from "vitest";
import { isValidCredential, isValidDemoCode } from "../lib/onboarding";

describe("standalone signup validation", () => {
  it("accepts a well-formed email and rejects incomplete addresses", () => {
    expect(isValidCredential("Email", "neighbor@example.com")).toBe(true);
    expect(isValidCredential("Email", "  hello+kindred@sample.org  ")).toBe(true);
    expect(isValidCredential("Email", "not-an-email")).toBe(false);
    expect(isValidCredential("Email", "name@host")).toBe(false);
  });

  it("accepts a phone number with 10–15 digits after formatting is removed", () => {
    expect(isValidCredential("Phone", "+1 (415) 555-0142")).toBe(true);
    expect(isValidCredential("Phone", "123456789")).toBe(false);
    expect(isValidCredential("Phone", "1234567890123456")).toBe(false);
  });

  it("requires exactly six numeric digits for the prototype verification step", () => {
    expect(isValidDemoCode("123456")).toBe(true);
    expect(isValidDemoCode("12345")).toBe(false);
    expect(isValidDemoCode("12ab56")).toBe(false);
  });
});
