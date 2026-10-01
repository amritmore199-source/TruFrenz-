import { describe, expect, it } from "vitest";

import {
  BOTTOM_SECTION_IDS,
  BOTTOM_SECTIONS,
  MENU_DESTINATIONS,
  sectionDefinition,
  sectionForDestination,
  shouldCloseThreadForSection,
} from "../lib/sections";

describe("the bottom bar's sections", () => {
  it("carries exactly the four sections, in order", () => {
    expect([...BOTTOM_SECTION_IDS]).toEqual(["Chats", "Groups", "Friends", "Bizz"]);
  });

  it("labels the message section Chat and the business section Bizz", () => {
    expect(sectionDefinition("Chats").label).toBe("Chat");
    expect(sectionDefinition("Bizz").label).toBe("Bizz");
  });

  it("gives every section a distinct icon, accent and label", () => {
    const icons = BOTTOM_SECTIONS.map((section) => section.icon);
    const accents = BOTTOM_SECTIONS.map((section) => section.accent);
    const labels = BOTTOM_SECTIONS.map((section) => section.label);
    expect(new Set(icons).size).toBe(icons.length);
    expect(new Set(accents).size).toBe(accents.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("describes each section well enough to fill an accessibility label", () => {
    for (const section of BOTTOM_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.purpose.length).toBeGreaterThan(12);
    }
  });

  /*
   * Meetups and the profile left the bar but must stay reachable. If this ever
   * shrinks to the four sections, those two screens become unreachable from the
   * menu, which is the only place that lists the whole app.
   */
  it("keeps Meetups and the profile reachable from the menu", () => {
    const ids = MENU_DESTINATIONS.map((destination) => destination.id);
    expect(ids).toContain("Meetups");
    expect(ids).toContain("You");
    for (const section of BOTTOM_SECTION_IDS) expect(ids).toContain(section);
    expect(ids[ids.length - 1]).toBe("You");
  });

  it("prints the profile as Profile rather than You in the menu", () => {
    expect(MENU_DESTINATIONS.find((destination) => destination.id === "You")?.label).toBe("Profile");
  });
});

describe("which bar entry is lit", () => {
  it("lights the matching section", () => {
    expect(sectionForDestination("Groups")).toBe("Groups");
    expect(sectionForDestination("Bizz")).toBe("Bizz");
  });

  it("lights nothing for the two screens that are not on the bar", () => {
    expect(sectionForDestination("Meetups")).toBeNull();
    expect(sectionForDestination("You")).toBeNull();
  });
});

describe("switching sections", () => {
  /*
   * A member reading a conversation who taps Groups and comes back should find
   * the thread as they left it. Every other section is a fresh context.
   */
  it("keeps an open conversation only when returning to Chat", () => {
    expect(shouldCloseThreadForSection("Chats")).toBe(false);
    for (const section of ["Groups", "Friends", "Bizz"] as const) {
      expect(shouldCloseThreadForSection(section)).toBe(true);
    }
  });
});