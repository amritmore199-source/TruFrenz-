import { describe, expect, it } from "vitest";
import { isInboxMeetupTransition, isSectionChange, shouldShowHandoff } from "../lib/ui-transitions";

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

describe("moving between the bar's sections", () => {
  it("recognises a change from one section to another", () => {
    expect(isSectionChange("Chats", "Groups")).toBe(true);
    expect(isSectionChange("Groups", "Bizz")).toBe(true);
    expect(isSectionChange("Friends", "Chats")).toBe(true);
  });

  it("does not call a destination or a repeat a section change", () => {
    expect(isSectionChange("Meetups", "Chats")).toBe(false);
    expect(isSectionChange("You", "Bizz")).toBe(false);
    expect(isSectionChange("Friends", "Friends")).toBe(false);
  });
});

describe("the frosted handoff", () => {
  /*
   * Both directions of a move need the cover, or one of them flashes while the
   * other is smooth — which is exactly how this was before the rule was pulled
   * out and tested in both directions.
   */
  it("covers section moves in both directions", () => {
    expect(shouldShowHandoff("Chats", "Groups")).toBe(true);
    expect(shouldShowHandoff("Groups", "Chats")).toBe(true);
    expect(shouldShowHandoff("Friends", "Bizz")).toBe(true);
    expect(shouldShowHandoff("Bizz", "Friends")).toBe(true);
  });

  it("still covers the original inbox and meetup move", () => {
    expect(shouldShowHandoff("Chats", "Meetups")).toBe(true);
    expect(shouldShowHandoff("Meetups", "Chats")).toBe(true);
  });

  it("stays instant when nothing changed", () => {
    expect(shouldShowHandoff("Chats", "Chats")).toBe(false);
    expect(shouldShowHandoff("You", "You")).toBe(false);
  });
});
