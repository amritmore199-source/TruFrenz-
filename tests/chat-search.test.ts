import { describe, expect, it } from "vitest";

import {
  CHAT_SEARCH_LIMIT,
  buildChatSearch,
  chatSearchEmptyCopy,
  chatSearchIsEmpty,
  chatSearchSummary,
  type ChatSearchInput,
} from "../lib/chat-search";

const threads = [
  { id: "maya", name: "Maya Chen", preview: "That little garden café was lovely", kind: "direct" as const },
  { id: "walk", name: "Sunday Walk Club", preview: "Maya: 10:30 works for me", kind: "group" as const },
  { id: "sam", name: "Sam Rivera", preview: "Are you still up for a walk Saturday?", kind: "direct" as const },
];

const people = [
  { id: "maya", name: "Maya Chen", note: "Indiranagar · ID + selfie verified", accepted: true, requested: false },
  { id: "sam", name: "Sam Rivera", note: "Koramangala · Phone verified", accepted: true, requested: false },
  { id: "noah", name: "Noah Kim", note: "Jayanagar · Phone verified", accepted: false, requested: true },
  { id: "asha", name: "Asha Rao", note: "HSR · Phone verified", accepted: false, requested: false },
];

const contacts = [
  { phoneE164: "+919800000001", name: "Priya work", matchName: "Priya Menon", matchTier: "id_selfie" as const },
  { phoneE164: "+919800000002", name: "Rahul gym", matchName: null, matchTier: null },
  { phoneE164: "+919800000003", name: "Zoya", matchName: null, matchTier: null },
];

const base: ChatSearchInput = { query: "", threads, people, contacts, contactsScanned: true };

/** The groups, keyed by id, for readable assertions. */
function groupOf(input: Partial<ChatSearchInput>, id: string) {
  const groups = buildChatSearch({ ...base, ...input });
  return groups.find((group) => group.id === id);
}

describe("searching everything from one box", () => {
  it("groups results by the decision each row carries", () => {
    const groups = buildChatSearch({ ...base, query: "a" });
    expect(groups.map((group) => group.id)).toEqual([
      "conversations",
      "friends",
      "on-trufrenz",
      "invite",
    ]);
  });

  it("puts conversations first, because a name already in a thread means that thread", () => {
    const groups = buildChatSearch({ ...base, query: "maya" });
    expect(groups[0]!.id).toBe("conversations");
    expect(groups[0]!.rows.map((row) => row.title)).toEqual(["Maya Chen", "Sunday Walk Club"]);
  });

  it("finds a thread by what was said in it, not only by its name", () => {
    const conversations = groupOf({ query: "garden" }, "conversations");
    expect(conversations?.rows.map((row) => row.title)).toEqual(["Maya Chen"]);
  });

  it("lists a group thread as a circle and a direct one as a thread", () => {
    const conversations = groupOf({ query: "walk" }, "conversations");
    const byTitle = Object.fromEntries(conversations!.rows.map((row) => [row.title, row.note]));
    expect(byTitle["Sunday Walk Club"]).toContain("Circle");
    expect(byTitle["Sam Rivera"]).not.toContain("Circle");
  });

  it("matches contacts on the phone's name and on their Trufrenz name", () => {
    // Saved as "Priya work", here as "Priya Menon": either name should find her.
    expect(groupOf({ query: "priya" }, "on-trufrenz")?.rows).toHaveLength(1);
    expect(groupOf({ query: "work" }, "on-trufrenz")?.rows).toHaveLength(1);
  });

  it("splits contacts by whether they are a member, with an action for each", () => {
    const here = groupOf({ query: "priya" }, "on-trufrenz");
    expect(here?.rows[0]!.action).toEqual({ kind: "invite-contact", phoneE164: "+919800000001" });
    expect(here?.rows[0]!.note).toContain("On Trufrenz as Priya Menon");

    const missing = groupOf({ query: "rahul" }, "invite");
    expect(missing?.rows[0]!.action).toEqual({ kind: "invite-contact", phoneE164: "+919800000002" });
    expect(missing?.rows[0]!.note).toContain("Not on Trufrenz");
  });

  it("gives each group a note that says how many rows it holds", () => {
    expect(groupOf({ query: "maya" }, "conversations")?.note).toBe("2 threads");
    expect(groupOf({ query: "priya" }, "on-trufrenz")?.note).toContain("send a friend request");
    expect(groupOf({ query: "rahul" }, "invite")?.note).toContain("send a download link");
  });

  it("offers an empty query everything, which is what the inbox already shows", () => {
    const groups = buildChatSearch(base);
    expect(groups.map((group) => group.id)).toEqual([
      "conversations",
      "friends",
      "on-trufrenz",
      "invite",
    ]);
  });

  it("reports no matches rather than an empty group", () => {
    const groups = buildChatSearch({ ...base, query: "zzzz" });
    expect(chatSearchIsEmpty(groups)).toBe(true);
    expect(groups).toHaveLength(0);
    expect(chatSearchSummary(groups)).toBe("No matches");
  });

  it("summarises what was matched for an accessibility label", () => {
    const groups = buildChatSearch({ ...base, query: "maya" });
    expect(chatSearchSummary(groups)).toMatch(/match(es)? in \d+ group/);
  });

  /*
   * A long address book must not bury the member's own conversations, which is
   * why the cap is per group rather than on the total.
   */
  it("caps each group rather than the whole result set", () => {
    const many = Array.from({ length: CHAT_SEARCH_LIMIT + 6 }, (_, i) => ({
      phoneE164: `+9198000010${String(i).padStart(2, "0")}`,
      name: `Contact ${i}`,
      matchName: null,
      matchTier: null,
    }));
    const groups = buildChatSearch({ ...base, query: "", contacts: many });
    expect(groups.find((g) => g.id === "invite")!.rows).toHaveLength(CHAT_SEARCH_LIMIT);
    // The conversations are untouched by the contact flood.
    expect(groups.find((g) => g.id === "conversations")!.rows).toHaveLength(threads.length);
  });

  it("refuses to return anything for a nonsensical limit", () => {
    expect(buildChatSearch({ ...base, limit: 0 })).toEqual([]);
    expect(buildChatSearch({ ...base, limit: -3 })).toEqual([]);
  });

  /*
   * The address book is only read when the member asks. Reporting "no contacts
   * match" for a phone that was never scanned would be a plain lie about their
   * own contacts, so the note says the check has not run.
   */
  it("says the contacts are unchecked rather than empty", () => {
    const groups = buildChatSearch({ ...base, query: "rahul", contactsScanned: false, contacts: [] });
    expect(groups.map((group) => group.id)).toEqual([]);
    expect(chatSearchIsEmpty(groups)).toBe(true);

    /*
     * The empty state has to name the unchecked half. Claiming "nothing
     * matches" would assert something about an address book the app has not
     * read, and a member would believe their contact is not here.
     */
    const unchecked = chatSearchEmptyCopy({ contactsScanned: false });
    const checked = chatSearchEmptyCopy({ contactsScanned: true });
    expect(unchecked.body).toContain("address book");
    expect(checked.body).not.toContain("address book");
    expect(checked.body).toContain("contact");
  });
});