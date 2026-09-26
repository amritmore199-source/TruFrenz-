import { describe, expect, it } from "vitest";
import { addQuickReply, DEFAULT_QUICK_REPLIES, parseQuickReplies, removeQuickReply } from "../lib/quick-replies";

describe("customizable quick replies", () => {
  it("adds normalized phrases without sending and ignores case-insensitive duplicates", () => {
    const added = addQuickReply(DEFAULT_QUICK_REPLIES, "  Let's   meet at noon. ");
    expect(added.at(-1)?.text).toBe("Let's meet at noon.");
    expect(addQuickReply(added, "LET'S MEET AT NOON.")).toEqual(added);
  });

  it("ignores empty and too-long custom phrases", () => {
    expect(addQuickReply(DEFAULT_QUICK_REPLIES, "  ")).toEqual(DEFAULT_QUICK_REPLIES);
    expect(addQuickReply(DEFAULT_QUICK_REPLIES, "x".repeat(121))).toEqual(DEFAULT_QUICK_REPLIES);
  });

  it("removes a custom phrase by its id", () => {
    const added = addQuickReply(DEFAULT_QUICK_REPLIES, "Let's get coffee");
    expect(removeQuickReply(added, "custom-let-s-get-coffee")).toEqual(DEFAULT_QUICK_REPLIES);
  });

  it("loads valid saved items and falls back to defaults for corrupt storage", () => {
    expect(parseQuickReplies(JSON.stringify([{ id: "custom-a", text: "Hello there" }]))).toEqual([{ id: "custom-a", text: "Hello there" }]);
    expect(parseQuickReplies("not json")).toEqual(DEFAULT_QUICK_REPLIES);
    expect(parseQuickReplies(null)).toEqual(DEFAULT_QUICK_REPLIES);
  });
});
