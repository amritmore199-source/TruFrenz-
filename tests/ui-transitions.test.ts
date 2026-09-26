import { describe, expect, it } from "vitest";
import { isInboxMeetupTransition } from "../lib/ui-transitions";

describe("inbox and meetup transition routing", () => {
  it("animates in both directions between chats and meetups", () => {
    expect(isInboxMeetupTransition("Chats", "Meetups")).toBe(true);
    expect(isInboxMeetupTransition("Meetups", "Chats")).toBe(true);
  });

  it("does not show the handoff animation for unrelated tabs", () => {
    expect(isInboxMeetupTransition("Chats", "Friends")).toBe(false);
    expect(isInboxMeetupTransition("You", "Meetups")).toBe(false);
  });
});
