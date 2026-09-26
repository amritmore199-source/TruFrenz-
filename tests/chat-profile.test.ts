import { describe, expect, it } from "vitest";
import { resolveChatProfile } from "../lib/chat-profile";

const people = [{ id: "maya", name: "Maya" }, { id: "sam", name: "Sam" }];

describe("chat profile lookup", () => {
  it("resolves a direct friend by the conversation id", () => {
    expect(resolveChatProfile("maya", "friend", people)).toEqual(people[0]);
  });

  it("returns null for groups and unknown conversations", () => {
    expect(resolveChatProfile("sunday-club", "group", people)).toBeNull();
    expect(resolveChatProfile("not-found", "friend", people)).toBeNull();
  });
});
