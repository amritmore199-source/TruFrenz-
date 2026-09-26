import { describe, expect, it } from "vitest";
import { resolveMobileBackAction, type MobileBackState } from "../lib/mobile-navigation";

const baseState: MobileBackState = {
  navigationMenuOpen: false,
  actionMenuOpen: false,
  quickRepliesOpen: false,
  profileOpen: false,
  meetupInviteOpen: false,
  selfieVerificationOpen: false,
  verificationPromptOpen: false,
  composerOpen: false,
  signupOpen: false,
  signupCanGoBack: false,
  notificationOpen: false,
  threadOpen: false,
  activeTab: "Chats",
};

describe("mobile back navigation", () => {
  it("closes the topmost navigation overlay first", () => {
    expect(resolveMobileBackAction({
      ...baseState,
      navigationMenuOpen: true,
      actionMenuOpen: true,
      threadOpen: true,
    })).toBe("close-navigation-menu");
  });

  it("steps backward inside signup before closing the signup sheet", () => {
    expect(resolveMobileBackAction({ ...baseState, signupOpen: true, signupCanGoBack: true })).toBe("step-back-signup");
    expect(resolveMobileBackAction({ ...baseState, signupOpen: true })).toBe("close-signup");
  });

  it("returns from a conversation to the chat inbox", () => {
    expect(resolveMobileBackAction({ ...baseState, threadOpen: true })).toBe("close-thread");
  });

  it("returns secondary tabs to Chats before allowing the app to exit", () => {
    expect(resolveMobileBackAction({ ...baseState, activeTab: "Meetups" })).toBe("go-to-chats");
    expect(resolveMobileBackAction(baseState)).toBe("exit-app");
  });
});
