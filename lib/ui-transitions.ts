import { BOTTOM_SECTION_IDS, type MenuDestination } from "./sections";

/**
 * Every screen the handoff animation can move between.
 *
 * The plan feed is no longer on the bar but still exists as a destination, so it
 * stays in the set; every other destination is a bar section.
 */
export type SocialTab = MenuDestination;

/**
 * The original handoff: the inbox to the plan feed and back.
 *
 * It still matters because the plan feed is not a bar entry, so the move is not
 * caught by the section rule below.
 */
export function isInboxMeetupTransition(from: SocialTab, to: SocialTab): boolean {
  return (from === "Chats" && to === "Meetups") || (from === "Meetups" && to === "Chats");
}

/**
 * Whether the change is between two of the bar's sections.
 *
 * Read from the section model rather than repeating its names here: this list
 * was hand-written, and when the bar changed it silently stopped matching the
 * bar it was describing.
 */
export function isSectionChange(from: SocialTab, to: SocialTab): boolean {
  if (from === to) return false;
  const sections: readonly SocialTab[] = BOTTOM_SECTION_IDS;
  return sections.includes(from) && sections.includes(to);
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
