import { describe, expect, it } from "vitest";

import {
  CONTACT_SEARCH_LIMIT,
  contactMatchesQuery,
  contactRowNote,
  contactSearchEmptyCopy,
  filterContacts,
  groupContactResults,
  type ContactSearchRow,
} from "../lib/contact-search";

const row = (name: string, matchName: string | null = null, matchTier: ContactSearchRow["matchTier"] = null): ContactSearchRow => ({
  phoneE164: `+1555${name.length}0000`,
  name,
  matchName,
  matchTier,
});

describe("matching contacts by name", () => {
  it("ignores case and surrounding space", () => {
    expect(contactMatchesQuery("Priya Raman", "  priya ")).toBe(true);
    expect(contactMatchesQuery("Priya Raman", "RAMAN")).toBe(true);
    expect(contactMatchesQuery("Priya Raman", "dan")).toBe(false);
  });

  it("matches everything when the box is empty or blank", () => {
    expect(contactMatchesQuery("Anyone", "")).toBe(true);
    expect(contactMatchesQuery("Anyone", "   ")).toBe(true);
  });

  it("keeps the scan's order rather than re-sorting", () => {
    const rows = [row("Zara"), row("Adam"), row("Mia")];
    expect(filterContacts(rows, "").map((item) => item.name)).toEqual(["Zara", "Adam", "Mia"]);
  });

  it("caps the list so one search shows a readable number of rows", () => {
    const many = Array.from({ length: 80 }, (_, index) => row(`Contact ${index}`));
    expect(filterContacts(many, "").length).toBe(CONTACT_SEARCH_LIMIT);
  });

  it("returns nothing for a limit that is not a usable number", () => {
    const rows = [row("Ada")];
    expect(filterContacts(rows, "", 0)).toEqual([]);
    expect(filterContacts(rows, "", Number.NaN)).toEqual([]);
  });
});

describe("splitting the results", () => {
  it("answers 'are they here?' by which block the row is in", () => {
    const groups = groupContactResults([row("Ada", "Ada L", "id_selfie"), row("Ben"), row("Cleo", "Cleo M", "phone")]);
    expect(groups.map((group) => group.id)).toEqual(["on-trufrenz", "invite"]);
    expect(groups[0].rows.map((item) => item.name)).toEqual(["Ada", "Cleo"]);
    expect(groups[1].rows.map((item) => item.name)).toEqual(["Ben"]);
  });

  it("omits a block that has nothing in it", () => {
    expect(groupContactResults([row("Ada", "Ada L", "id_selfie")]).map((group) => group.id)).toEqual(["on-trufrenz"]);
    expect(groupContactResults([row("Ben")]).map((group) => group.id)).toEqual(["invite"]);
    expect(groupContactResults([])).toEqual([]);
  });

  it("counts the members it found so the heading can say how many", () => {
    const [found] = groupContactResults([row("Ada", "Ada L", "id_selfie"), row("Cleo", "Cleo M", "phone")]);
    expect(found.note).toContain("2");
  });
});

describe("what each row says", () => {
  it("names the member and their verification when the contact is here", () => {
    expect(contactRowNote(row("Ada", "Ada Lovelace", "id_selfie"))).toBe("On Trufrenz as Ada Lovelace · ID + selfie verified");
    expect(contactRowNote(row("Cleo", "Cleo M", "phone"))).toBe("On Trufrenz as Cleo M · Phone verified");
  });

  /*
   * A member who never verified anything is still a member. Calling that
   * "verified" would be a lie a member could act on.
   */
  it("does not promote an unverified account to verified", () => {
    expect(contactRowNote(row("Dan", "Dan P", "none"))).toBe("On Trufrenz as Dan P · Account found");
    expect(contactRowNote(row("Ben"))).toBe("Not on Trufrenz yet");
  });
});

describe("the lookup's empty states", () => {
  it("explains the privacy of the scan before it has run", () => {
    const copy = contactSearchEmptyCopy({ scanning: false, scanned: false, query: "", contactsScanned: 0 });
    expect(copy.body).toMatch(/never leave this device/i);
  });

  it("reports progress while the scan runs", () => {
    expect(contactSearchEmptyCopy({ scanning: true, scanned: false, query: "", contactsScanned: 0 }).title).toMatch(/looking/i);
  });

  it("distinguishes an empty address book from a search with no matches", () => {
    expect(contactSearchEmptyCopy({ scanning: false, scanned: true, query: "", contactsScanned: 0 }).title).toBe("No contacts to search");
    expect(contactSearchEmptyCopy({ scanning: false, scanned: true, query: "Priya", contactsScanned: 40 }).title).toMatch(/no contact matches/i);
  });
});