import { describe, expect, it } from "vitest";
import { isInboxMeetupTransition, isSectionChange, shouldShowHandoff } from "../lib/ui-transitions";

describe("inbox and meetup transition routing", () => {
  it("animates in both directions between chats and meetups", () => {
    expect(isInboxMeetupTransition("Chats", "Meetups")).toBe(true);
    expect(isInboxMeetupTransition("Meetups", "Chats")).toBe(true);
  });

  it("does not show the handoff animation for unrelated tabs", () => {
    expect(isInboxMeetupTransition("Chats", "Groups")).toBe(false);
    expect(isInboxMeetupTransition("Profile", "Meetups")).toBe(false);
  });
});

describe("moving between the bar's sections", () => {
  it("recognises a change from one section to another", () => {
    expect(isSectionChange("Chats", "Groups")).toBe(true);
    expect(isSectionChange("Groups", "Bizz")).toBe(true);
    expect(isSectionChange("Hangouts", "Chats")).toBe(true);
  });

  it("does not call a destination or a repeat a section change", () => {
    /*
     * The plan feed is the only destination that is not a bar entry, so it is
     * the one that must not count as a section move in either direction. Every
     * other destination is a section now, including the profile, which moved
     * from the header onto the bar.
     */
    expect(isSectionChange("Meetups", "Chats")).toBe(false);
    expect(isSectionChange("Chats", "Meetups")).toBe(false);
    expect(isSectionChange("Profile", "Profile")).toBe(false);
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
    expect(shouldShowHandoff("Hangouts", "Bizz")).toBe(true);
    expect(shouldShowHandoff("Bizz", "Hangouts")).toBe(true);
  });

  it("still covers the original inbox and meetup move", () => {
    expect(shouldShowHandoff("Chats", "Meetups")).toBe(true);
    expect(shouldShowHandoff("Meetups", "Chats")).toBe(true);
  });

  it("stays instant when nothing changed", () => {
    expect(shouldShowHandoff("Chats", "Chats")).toBe(false);
    expect(shouldShowHandoff("Profile", "Profile")).toBe(false);
  });
});
