import type { MenuDestination } from "@/lib/sections";

/**
 * Every screen the handoff animation can move between.
 *
 * Meetups is no longer on the bar but still exists as a destination, and the
 * profile is reached from the avatar, so both stay in the set.
 */
export type SocialTab = MenuDestination;

/**
 * The original handoff: the inbox to the meetup feed and back.
 */
export function isInboxMeetupTransition(from: SocialTab, to: SocialTab): boolean {
  return (from === "Chats" && to === "Meetups") || (from === "Meetups" && to === "Chats");
}

/**
 * Whether the change is between two of the bar's sections.
 */
export function isSectionChange(from: SocialTab, to: SocialTab): boolean {
  const sections: SocialTab[] = ["Chats", "Groups", "Friends", "Bizz"];
  return from !== to && sections.includes(from) && sections.includes(to);
}

/**
 * Whether a move between screens should be covered by the frosted handoff.
 *
 * The animation was written for the one long transition the app had, and it
 * earned its place: both directions of that move swap a dense list for a mostly
 * empty one, and the moment of glass covers the change instead of letting the
 * screen appear to flash. Every move between the bar's sections is the same
 * kind of change, so the rule is now "something substantial changed", not a
 * list of specific names — which is how one direction of a move could end up
 * animated and the other not.
 *
 * Re-tapping the section already showing is not a transition and stays instant.
 */
export function shouldShowHandoff(from: SocialTab, to: SocialTab): boolean {
  if (from === to) return false;
  return isInboxMeetupTransition(from, to) || isSectionChange(from, to);
}
