export type MobileBackAction =
  | "close-navigation-menu"
  | "close-action-menu"
  | "close-quick-replies"
  | "close-profile"
  | "close-meetup-invite"
  | "close-selfie-verification"
  | "close-verification-prompt"
  | "close-composer"
  | "step-back-signup"
  | "close-signup"
  | "dismiss-notification"
  | "close-thread"
  | "go-to-chats"
  | "exit-app";

export type MobileBackState = {
  navigationMenuOpen: boolean;
  actionMenuOpen: boolean;
  quickRepliesOpen: boolean;
  profileOpen: boolean;
  meetupInviteOpen: boolean;
  selfieVerificationOpen: boolean;
  verificationPromptOpen: boolean;
  composerOpen: boolean;
  signupOpen: boolean;
  signupCanGoBack: boolean;
  notificationOpen: boolean;
  threadOpen: boolean;
  activeTab: "Chats" | "Friends" | "Meetups" | "You";
};

export const NAVIGATION_POPUP_POSITION = {
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: 20,
  paddingVertical: 28,
} as const;

export function resolveMobileBackAction(state: MobileBackState): MobileBackAction {
  if (state.navigationMenuOpen) return "close-navigation-menu";
  if (state.actionMenuOpen) return "close-action-menu";
  if (state.quickRepliesOpen) return "close-quick-replies";
  if (state.profileOpen) return "close-profile";
  if (state.meetupInviteOpen) return "close-meetup-invite";
  if (state.selfieVerificationOpen) return "close-selfie-verification";
  if (state.verificationPromptOpen) return "close-verification-prompt";
  if (state.composerOpen) return "close-composer";
  if (state.signupOpen && state.signupCanGoBack) return "step-back-signup";
  if (state.signupOpen) return "close-signup";
  if (state.notificationOpen) return "dismiss-notification";
  if (state.threadOpen) return "close-thread";
  if (state.activeTab !== "Chats") return "go-to-chats";
  return "exit-app";
}
