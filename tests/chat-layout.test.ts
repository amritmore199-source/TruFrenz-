import { describe, expect, it } from "vitest";

import {
  CHAT_ROW_ACTION_SIZE,
  chatRowRevealWidth,
  chatRowSwipeThreshold,
  composerKeyboardLift,
  shouldHideTabBarForKeyboard,
} from "../lib/chat-layout";

describe("composer keyboard lift", () => {
  it("keeps the composer in place when the keyboard is closed", () => {
    expect(composerKeyboardLift(0, 34)).toBe(0);
  });

  it("lifts by the keyboard height minus the bottom inset already applied", () => {
    // A 300pt keyboard on a device with a 34pt home indicator: the root view has
    // already inset by 34, so the composer only needs to rise 266.
    expect(composerKeyboardLift(300, 34)).toBe(266);
  });

  it("handles a device with no bottom inset", () => {
    expect(composerKeyboardLift(280, 0)).toBe(280);
  });

  it("never lifts further than the keyboard needs", () => {
    // If the inset somehow exceeds the keyboard height the lift clamps to zero
    // rather than pulling the composer upward off screen.
    expect(composerKeyboardLift(20, 34)).toBe(0);
  });

  it("ignores malformed keyboard measurements", () => {
    expect(composerKeyboardLift(Number.NaN, 34)).toBe(0);
    expect(composerKeyboardLift(-50, 34)).toBe(0);
    expect(composerKeyboardLift(300, Number.NaN)).toBe(300);
  });
});

describe("bottom bar behaviour while typing", () => {
  it("steps aside only when a conversation is open", () => {
    expect(shouldHideTabBarForKeyboard({ keyboardHeight: 300, hasOpenChat: true })).toBe(true);
  });

  it("stays visible in the list views so navigation is never lost", () => {
    expect(shouldHideTabBarForKeyboard({ keyboardHeight: 300, hasOpenChat: false })).toBe(false);
  });

  it("stays visible when no keyboard is showing", () => {
    expect(shouldHideTabBarForKeyboard({ keyboardHeight: 0, hasOpenChat: true })).toBe(false);
  });
});

describe("conversation row swipe actions", () => {
  it("reveals both corner buttons", () => {
    expect(chatRowRevealWidth()).toBe(CHAT_ROW_ACTION_SIZE * 2 + 8);
  });

  it("keeps the actions compact so the conversation preview keeps the row", () => {
    // Two ~46pt buttons plus a small gutter must stay well under a third of a
    // 390pt phone width.
    expect(chatRowRevealWidth()).toBeLessThan(390 / 3);
  });

  it("commits on a swipe shorter than the full reveal", () => {
    const threshold = chatRowSwipeThreshold();
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThan(chatRowRevealWidth());
  });
});