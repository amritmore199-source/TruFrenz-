import { describe, expect, it } from "vitest";

import { normalizeMessages } from "../server/messageService";

/*
 * These run against the server's own normalizer rather than the app's copy,
 * deliberately. The two must agree: the app refuses an unusable row, so if the
 * server quietly repaired it instead, a request that did not come from the app —
 * a replayed body, an older build, a hand-written call — would store a message the
 * member never sent.
 */

const row = (overrides: Record<string, unknown> = {}) => ({
  clientId: "device-1",
  chatId: "maya",
  text: "A café sounds lovely.",
  time: "10:15 AM",
  kind: "text",
  ...overrides,
});

describe("normalizing a batch of messages", () => {
  it("keeps a well-formed row", () => {
    expect(normalizeMessages([row()])).toEqual([
      { clientId: "device-1", chatId: "maya", text: "A café sounds lovely.", time: "10:15 AM", kind: "text" },
    ]);
  });

  it("treats a missing kind as plain text", () => {
    const { kind, ...withoutKind } = row();
    void kind;
    expect(normalizeMessages([withoutKind])[0].kind).toBe("text");
  });

  it("refuses a kind we do not produce rather than relabelling it", () => {
    // Relabelling a voice note as text would hand the member a message that reads
    // differently from the one they sent, with nothing to explain the change.
    expect(normalizeMessages([row({ kind: "video" })])).toEqual([]);
    expect(normalizeMessages([row({ kind: "plan-card" })])).toEqual([]);
  });

  it("accepts every kind the app actually sends", () => {
    for (const kind of ["text", "photo", "voice", "location", "plan"]) {
      expect(normalizeMessages([row({ kind })])[0].kind).toBe(kind);
    }
  });

  it("drops a row with no id, no chat, or no text", () => {
    expect(normalizeMessages([row({ clientId: "" })])).toEqual([]);
    expect(normalizeMessages([row({ chatId: "   " })])).toEqual([]);
    expect(normalizeMessages([row({ text: "   " })])).toEqual([]);
  });

  it("drops an absurdly long id or chat key", () => {
    expect(normalizeMessages([row({ clientId: "a".repeat(97) })])).toEqual([]);
    expect(normalizeMessages([row({ chatId: "b".repeat(65) })])).toEqual([]);
  });

  it("trims the identifiers so a padded key still matches the thread", () => {
    const [clean] = normalizeMessages([row({ clientId: "  device-1  ", chatId: " maya " })]);
    expect(clean.clientId).toBe("device-1");
    expect(clean.chatId).toBe("maya");
  });

  it("keeps the first occurrence of a repeated id", () => {
    const batch = normalizeMessages([row({ text: "the first one" }), row({ text: "a retry" })]);
    expect(batch).toHaveLength(1);
    expect(batch[0].text).toBe("the first one");
  });

  it("caps a very long message instead of rejecting it", () => {
    const [stored] = normalizeMessages([row({ text: "x".repeat(9000) })]);
    expect(stored.text).toHaveLength(4000);
  });

  it("falls back to a placeholder time when the app sent none", () => {
    expect(normalizeMessages([row({ time: "" })])[0].time).toBe("now");
    expect(normalizeMessages([row({ time: 42 })])[0].time).toBe("now");
  });

  it("ignores anything that is not a list of rows", () => {
    expect(normalizeMessages(undefined)).toEqual([]);
    expect(normalizeMessages(null)).toEqual([]);
    expect(normalizeMessages("not a batch")).toEqual([]);
    expect(normalizeMessages([null, 7, "text", []])).toEqual([]);
  });

  it("keeps the good rows out of a batch that also contains bad ones", () => {
    const batch = normalizeMessages([row({ clientId: "" }), row({ clientId: "keeper" }), row({ kind: "video" })]);
    expect(batch.map((entry) => entry.clientId)).toEqual(["keeper"]);
  });
});