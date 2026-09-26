import { describe, expect, it } from "vitest";

import { WELCOME_SLIDES, canStartAuth, clampSlideIndex, nextSlideIndex, previousSlideIndex } from "../lib/welcome-intro";
import {
  MAX_INTERESTS,
  ageFromDateOfBirth,
  firstProfileError,
  formatDateOfBirth,
  hasProfileErrors,
  parseDateOfBirth,
  toggleInterest,
  validateProfileDraft,
} from "../lib/onboarding-profile";
import { canGuestPerform, guestUpsellMessage, requiresAccount } from "../lib/guest-mode";
import { createGuestSession, createMemberSession, isGuestSession, parseSession, serializeSession, shouldShowWelcome } from "../lib/session";

const NOW = new Date("2026-09-26T00:00:00.000Z");

describe("welcome intro carousel", () => {
  it("ships the three requested intro slides", () => {
    expect(WELCOME_SLIDES).toHaveLength(3);
    expect(WELCOME_SLIDES.map((slide) => slide.title)).toEqual([
      "Find genuine, verified people nearby",
      "Chat, hangout, meetup — your way",
      "Your privacy, your control",
    ]);
  });

  it("clamps scroll offsets so the dots never leave the slide range", () => {
    expect(clampSlideIndex(-2)).toBe(0);
    expect(clampSlideIndex(1.4)).toBe(1);
    expect(clampSlideIndex(9)).toBe(2);
    expect(clampSlideIndex(Number.NaN)).toBe(0);
  });

  it("steps forward and backward without overrunning the ends", () => {
    expect(nextSlideIndex(0)).toBe(1);
    expect(nextSlideIndex(2)).toBe(2);
    expect(previousSlideIndex(2)).toBe(1);
    expect(previousSlideIndex(0)).toBe(0);
  });

  it("blocks sign up and log in until the terms are accepted", () => {
    expect(canStartAuth(false)).toBe(false);
    expect(canStartAuth(true)).toBe(true);
  });
});

describe("onboarding profile rules", () => {
  it("parses both supported date formats and rejects impossible dates", () => {
    expect(formatDateOfBirth(parseDateOfBirth("1996-04-18", NOW)!)).toBe("1996-04-18");
    expect(formatDateOfBirth(parseDateOfBirth("04/18/1996", NOW)!)).toBe("1996-04-18");
    expect(parseDateOfBirth("1996-02-31", NOW)).toBeNull();
    expect(parseDateOfBirth("next Tuesday", NOW)).toBeNull();
    expect(parseDateOfBirth("2030-01-01", NOW)).toBeNull();
  });

  it("computes age and enforces the adult-only rule", () => {
    expect(ageFromDateOfBirth(new Date("1996-04-18T00:00:00.000Z"), NOW)).toBe(30);
    const errors = validateProfileDraft({ name: "Maya", dateOfBirth: "2012-04-18", locality: "Japantown", interests: ["Hiking"] }, NOW);
    expect(errors.dateOfBirth).toContain("18 and over");
  });

  it("requires a name, date of birth, locality, and at least one interest", () => {
    const errors = validateProfileDraft({ name: "M", dateOfBirth: "", locality: "", interests: [] }, NOW);
    expect(hasProfileErrors(errors)).toBe(true);
    expect(firstProfileError(errors)).toBe("Add the name friends should call you.");
    expect(errors.interests).toBe("Pick at least one thing you enjoy.");
  });

  it("accepts a complete profile and refuses more than the interest cap", () => {
    const draft = { name: "Maya Chen", dateOfBirth: "1996-04-18", locality: "Pacific Heights", interests: ["Coffee walks", "Ceramics"] };
    expect(validateProfileDraft(draft, NOW)).toEqual({});
    let list: string[] = [];
    for (const value of ["a", "b", "c", "d", "e"]) list = toggleInterest(list, value);
    expect(list).toHaveLength(MAX_INTERESTS);
    expect(toggleInterest(list, "a")).toEqual(["b", "c", "d"]);
  });
});

describe("guest preview mode", () => {
  it("allows browsing but blocks every social action", () => {
    expect(canGuestPerform("browse-friends")).toBe(true);
    expect(canGuestPerform("browse-meetups")).toBe(true);
    expect(canGuestPerform("open-chat")).toBe(false);
    expect(requiresAccount("send-friend-request")).toBe(true);
    expect(requiresAccount("join-meetup")).toBe(true);
  });

  it("explains why the action needs an account", () => {
    expect(guestUpsellMessage("open-chat")).toContain("mutual yes");
    expect(guestUpsellMessage("edit-profile")).toContain("Create a free account");
  });
});

describe("stored session", () => {
  it("shows the welcome screen only before any session exists", () => {
    expect(shouldShowWelcome(null)).toBe(true);
    expect(shouldShowWelcome(createGuestSession(NOW))).toBe(false);
  });

  it("round-trips a member session and flags guests", () => {
    const member = createMemberSession({ name: "Maya Chen", locality: "Pacific Heights", now: NOW });
    const restored = parseSession(serializeSession(member));
    expect(restored?.mode).toBe("member");
    expect(restored?.name).toBe("Maya Chen");
    expect(isGuestSession(restored)).toBe(false);
    expect(isGuestSession(parseSession(serializeSession(createGuestSession(NOW))))).toBe(true);
  });

  it("ignores corrupted or unknown session payloads", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession("not json")).toBeNull();
    expect(parseSession(JSON.stringify({ mode: "admin" }))).toBeNull();
  });
});
