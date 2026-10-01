import { describe, expect, it } from "vitest";
import { BACK_HOME_SECTION, resolveMobileBackAction, type MobileBackState } from "../lib/mobile-navigation";

const baseState: MobileBackState = {
  navigationMenuOpen: false,
  actionMenuOpen: false,
  quickRepliesOpen: false,
  profileOpen: false,
  meetupInviteOpen: false,
  selfieVerificationOpen: false,
  verificationPromptOpen: false,
  composerOpen: false,
  contactSearchOpen: false,
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

  /*
   * The contact lookup is the innermost layer of the chat section: it sits
   * under the sheet stack but over the list, so a back press must close it
   * rather than leaving the section or the app.
   */
  it("closes the contact lookup before anything beneath it", () => {
    expect(resolveMobileBackAction({ ...baseState, contactSearchOpen: true })).toBe("close-contact-search");
    expect(resolveMobileBackAction({ ...baseState, contactSearchOpen: true, threadOpen: true })).toBe("close-contact-search");
  });

  it("returns every other section to Chat before allowing the app to exit", () => {
    for (const section of ["Groups", "Hangouts", "Bizz", "Profile", "Meetups"] as const) {
      expect(resolveMobileBackAction({ ...baseState, activeTab: section })).toBe("go-to-chats");
    }
    expect(resolveMobileBackAction(baseState)).toBe("exit-app");
  });

  it("treats Chat as home, so back from Chat leaves the app", () => {
    expect(BACK_HOME_SECTION).toBe("Chats");
  });
});