import { describe, expect, it } from "vitest";

import {
  BOTTOM_SECTION_IDS,
  BOTTOM_SECTIONS,
  DEFAULT_SECTION,
  MENU_DESTINATIONS,
  sectionDefinition,
  sectionForDestination,
  shouldCloseThreadForSection,
} from "../lib/sections";

describe("the bottom bar's sections", () => {
  it("carries exactly the five sections, in order", () => {
    expect([...BOTTOM_SECTION_IDS]).toEqual(["Chats", "Groups", "Hangouts", "Bizz", "Profile"]);
  });

  it("labels each entry the way the bar prints it", () => {
    expect(sectionDefinition("Chats").label).toBe("Chats");
    expect(sectionDefinition("Hangouts").label).toBe("Hangouts");
    expect(sectionDefinition("Bizz").label).toBe("Bizz");
    expect(sectionDefinition("Profile").label).toBe("Profile");
  });

  it("opens on Chats, which is also the bar's first entry", () => {
    expect(DEFAULT_SECTION).toBe("Chats");
    expect(BOTTOM_SECTION_IDS[0]).toBe(DEFAULT_SECTION);
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
   * Five is the ceiling. The labels sit under a 19pt icon in a fifth of the
   * width, so a sixth entry starts truncating on a 320pt screen — the width of
   * an older budget Android, which is the device this bar has to survive.
   */
  it("keeps the bar at five entries or fewer", () => {
    expect(BOTTOM_SECTIONS.length).toBeLessThanOrEqual(5);
  });

  /*
   * Every section is on the bar, so the only destination the menu has to add is
   * the plan feed, which is reached from the chat header.
   */
  it("lists every section plus the plan feed in the menu", () => {
    const ids = MENU_DESTINATIONS.map((destination) => destination.id);
    for (const section of BOTTOM_SECTION_IDS) expect(ids).toContain(section);
    expect(ids).toContain("Meetups");
    expect(MENU_DESTINATIONS.length).toBe(BOTTOM_SECTIONS.length + 1);
  });

  /*
   * The section that used to hold friends, requests and the address book is
   * gone, and its features are in Chats. This guards the removal itself: if a
   * Friends section is ever reintroduced by accident, the bar would silently
   * carry six entries and truncate.
   */
  it("has no separate Friends section", () => {
    expect(BOTTOM_SECTION_IDS).not.toContain("Friends" as never);
  });
});

describe("which bar entry is lit", () => {
  it("lights the matching section", () => {
    expect(sectionForDestination("Groups")).toBe("Groups");
    expect(sectionForDestination("Bizz")).toBe("Bizz");
    expect(sectionForDestination("Profile")).toBe("Profile");
  });

  /*
   * The plan feed is shown by Hangouts, so it lights that entry. Before this,
   * a member reading plans from the chat header saw a bar with nothing lit.
   */
  it("lights Hangouts while the plan feed is showing", () => {
    expect(sectionForDestination("Meetups")).toBe("Hangouts");
  });
});

describe("switching sections", () => {
  /*
   * A member reading a conversation who taps Groups and comes back should find
   * the thread as they left it. Every other section is a fresh context.
   */
  it("keeps an open conversation only when returning to Chats", () => {
    expect(shouldCloseThreadForSection("Chats")).toBe(false);
    for (const section of ["Groups", "Hangouts", "Bizz", "Profile"] as const) {
      expect(shouldCloseThreadForSection(section)).toBe(true);
    }
  });
});