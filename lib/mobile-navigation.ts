import type { AppSection, MenuDestination } from "@/lib/sections";

export type MobileBackAction =
  | "close-navigation-menu"
  | "close-action-menu"
  | "close-quick-replies"
  | "close-profile"
  | "close-meetup-invite"
  | "close-selfie-verification"
  | "close-verification-prompt"
  | "close-composer"
  | "close-contact-search"
  | "step-back-signup"
  | "close-signup"
  | "dismiss-notification"
  | "close-thread"
  | "go-to-chats"
  | "exit-app";

/**
 * Where the member currently is.
 *
 * The bar carries four sections, and Meetups and the profile are destinations
 * reached from the header, so the active screen is any of the six.
 */
export type ActiveDestination = MenuDestination;

export type MobileBackState = {
  navigationMenuOpen: boolean;
  actionMenuOpen: boolean;
  quickRepliesOpen: boolean;
  profileOpen: boolean;
  meetupInviteOpen: boolean;
  selfieVerificationOpen: boolean;
  verificationPromptOpen: boolean;
  composerOpen: boolean;
  /**
   * The contact lookup inside the chat search box. It is an overlay on the
   * search box, so it closes before anything beneath it.
   */
  contactSearchOpen: boolean;
  signupOpen: boolean;
  signupCanGoBack: boolean;
  notificationOpen: boolean;
  threadOpen: boolean;
  activeTab: ActiveDestination;
};

export function resolveMobileBackAction(state: MobileBackState): MobileBackAction {
  if (state.navigationMenuOpen) return "close-navigation-menu";
  if (state.actionMenuOpen) return "close-action-menu";
  if (state.quickRepliesOpen) return "close-quick-replies";
  if (state.profileOpen) return "close-profile";
  if (state.meetupInviteOpen) return "close-meetup-invite";
  if (state.selfieVerificationOpen) return "close-selfie-verification";
  if (state.verificationPromptOpen) return "close-verification-prompt";
  if (state.composerOpen) return "close-composer";
  if (state.contactSearchOpen) return "close-contact-search";
  if (state.signupOpen && state.signupCanGoBack) return "step-back-signup";
  if (state.signupOpen) return "close-signup";
  if (state.notificationOpen) return "dismiss-notification";
  if (state.threadOpen) return "close-thread";
  if (state.activeTab !== "Chats") return "go-to-chats";
  return "exit-app";
}

/** The section a back press lands on: always the message list. */
export const BACK_HOME_SECTION: AppSection = "Chats";