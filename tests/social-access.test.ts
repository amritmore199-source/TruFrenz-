import { describe, expect, it } from "vitest";
import { canOpenChat, canRequestFriendship, canUsePremiumFeature } from "../lib/social-access";

describe("friendship and chat access", () => {
  it("requires stronger verification to send an initial friend request", () => {
    expect(canRequestFriendship("id-selfie")).toBe(true);
    expect(canRequestFriendship("phone-only")).toBe(false);
  });

  it("opens a direct chat only after the friendship is accepted", () => {
    expect(canOpenChat(false)).toBe(false);
    expect(canOpenChat(true)).toBe(true);
    expect(canOpenChat(false, true)).toBe(true);
  });

  it("gates live map and voice/video calling behind paid access", () => {
    for (const feature of ["live-map", "voice-call", "video-call"] as const) {
      expect(canUsePremiumFeature(feature, false)).toBe(false);
      expect(canUsePremiumFeature(feature, true)).toBe(true);
    }
  });
});
