import { describe, expect, it } from "vitest";
import {
  contactInviteMessage,
  normalizeDeviceContacts,
  normalizeDevicePhone,
  normalizePhoneHashes,
} from "../lib/contact-discovery";

describe("device contact normalization", () => {
  it("parses international numbers without applying a national default", () => {
    expect(normalizeDevicePhone("+1 (415) 555-0134")).toBe("+14155550134");
    expect(normalizeDevicePhone("(415) 555-0134")).toBeNull();
    expect(normalizeDevicePhone("(415) 555-0134", undefined, "US")).toBe("+14155550134");
  });

  it("uses an individual contact's country context before the device region", () => {
    expect(normalizeDevicePhone("020 7946 0018", "GB", "US")).toBe("+442079460018");
  });

  it("deduplicates phone numbers locally and never alters caller data", () => {
    const entries = [
      { name: "Avery", number: "+1 415 555 0134" },
      { name: "Avery duplicate", number: "4155550134", countryCode: "us" },
      { name: "Unknown", number: "not a phone" },
    ];
    const result = normalizeDeviceContacts(entries, "US");
    expect(result).toEqual([{ id: "+14155550134", name: "Avery", phoneE164: "+14155550134" }]);
    expect(entries[0]?.number).toBe("+1 415 555 0134");
  });
});

describe("contact match API input", () => {
  it("accepts only deduplicated SHA-256 hex strings, up to the cap", () => {
    const valid = "A".repeat(64);
    expect(normalizePhoneHashes([valid, valid, "not-a-hash", 12])).toEqual(["a".repeat(64)]);
    expect(normalizePhoneHashes("not-an-array")).toEqual([]);
    expect(normalizePhoneHashes(Array.from({ length: 3 }, (_, i) => i.toString(16).padStart(64, "0")), 2)).toHaveLength(2);
  });
});

describe("contact invitation copy", () => {
  it("includes the supplied link and makes no claim that an invite was sent", () => {
    const text = contactInviteMessage("https://trufrenz.net", "Jo");
    expect(text).toContain("Jo");
    expect(text).toContain("friendship-only");
    expect(text).toContain("https://trufrenz.net");
    expect(text.toLowerCase()).not.toContain("sent you");
  });
});
