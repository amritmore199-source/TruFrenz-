export type GuestAction =
  | "browse-friends"
  | "browse-meetups"
  | "open-chat"
  | "send-friend-request"
  | "join-meetup"
  | "create-meetup"
  | "share-location"
  | "edit-profile"
  | "open-safety-center";

/** Guests may look around, but every interaction needs an account. */
export const GUEST_ALLOWED_ACTIONS: readonly GuestAction[] = ["browse-friends", "browse-meetups", "open-safety-center"];

export function canGuestPerform(action: GuestAction): boolean {
  return GUEST_ALLOWED_ACTIONS.includes(action);
}

const UPSELL: Record<GuestAction, string> = {
  "browse-friends": "",
  "browse-meetups": "",
  "open-chat": "Create a free account to chat. Conversations open after a mutual yes.",
  "send-friend-request": "Sign up to send a friend request — it takes a phone or email code.",
  "join-meetup": "Create a free account to join this meetup.",
  "create-meetup": "Sign up to plan a meetup and invite accepted friends.",
  "share-location": "Sign up to share your approximate area with accepted friends.",
  "edit-profile": "Create a free account to set up your profile.",
  "open-safety-center": "",
};

/** Copy shown when a guest taps something that needs an account. */
export function guestUpsellMessage(action: GuestAction): string {
  return UPSELL[action] || "Create a free account to continue.";
}

/** Actions that require a real account, used to gate UI affordances. */
export function requiresAccount(action: GuestAction): boolean {
  return !canGuestPerform(action);
}
