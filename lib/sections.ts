/**
 * The four sections of the bottom bar.
 *
 * The bar used to carry Chats, Friends, Meetups and You. Meetups and You are
 * destinations rather than sections: meetups are planned inside a conversation
 * and surfaced from the chat header, and the member's own profile and settings
 * are reached from the avatar in the top bar. Keeping them on the bar spent a
 * quarter of it on places a member visits rarely, and left no room for Groups,
 * which is where the circles people create actually live.
 *
 * The bar therefore shows, left to right: Chat, Groups, Friends, Bizz.
 *
 * This module is pure so the ordering, labels and accents can be pinned by
 * tests rather than drifting apart from the bar that renders them.
 */

/** A section that earns a place on the bottom bar. */
export type AppSection = "Chats" | "Groups" | "Friends" | "Bizz";

/** Where the bar's glass weight lookup lands for each section. */
export type SectionAccent = "chats" | "groups" | "friends" | "bizz";

export type SectionDefinition = {
  id: AppSection;
  /** What the bar prints. Short: the labels sit under a 19pt icon. */
  label: string;
  /** Longer name for accessibility and the swipe-through menu. */
  title: string;
  /** Material icon name, resolved by the caller against the icon map. */
  icon: string;
  /** One line explaining what the section is for. */
  purpose: string;
  accent: SectionAccent;
};

/**
 * The bar's order is deliberate: talking first, the circles people talk in
 * second, the people themselves third, and the work-in-progress business
 * section last so it never pushes the everyday sections off a small screen.
 */
export const BOTTOM_SECTIONS: readonly SectionDefinition[] = [
  {
    id: "Chats",
    label: "Chat",
    title: "Chat",
    icon: "forum",
    purpose: "Live messages with your accepted friends, and the groups you make.",
    accent: "chats",
  },
  {
    id: "Groups",
    label: "Groups",
    icon: "groups",
    title: "Groups",
    purpose: "Every circle you belong to, active and closed.",
    accent: "groups",
  },
  {
    id: "Friends",
    label: "Friends",
    icon: "diversity-3",
    title: "Friends",
    purpose: "Find friends, answer requests, and follow the ones you sent.",
    accent: "friends",
  },
  {
    id: "Bizz",
    label: "Bizz",
    icon: "storefront",
    title: "Bizz",
    purpose: "Business tools, short and simple. Opening soon.",
    accent: "bizz",
  },
] as const;

/** The section ids in bar order. */
export const BOTTOM_SECTION_IDS: readonly AppSection[] = BOTTOM_SECTIONS.map((section) => section.id);

export function sectionDefinition(id: AppSection): SectionDefinition {
  return BOTTOM_SECTIONS.find((section) => section.id === id) ?? BOTTOM_SECTIONS[0];
}

/**
 * Destinations that are reachable but are not sections: the member's own
 * profile and settings, and the meetup feed.
 *
 * They stay in the swipe-through menu so no screen becomes unreachable when it
 * leaves the bar. `label` is what the menu prints, which is why "You" reads as
 * "Profile".
 */
export type MenuDestination = AppSection | "Meetups" | "You";

export const MENU_DESTINATIONS: readonly { id: MenuDestination; label: string; icon: string }[] = [
  ...BOTTOM_SECTIONS.map((section) => ({ id: section.id as MenuDestination, label: section.title, icon: section.icon })),
  { id: "Meetups", label: "Meetups", icon: "event-available" },
  { id: "You", label: "Profile", icon: "person-outline" },
];

/**
 * Which bar entry a destination lights up.
 *
 * Meetups and the profile are not on the bar, so nothing lights up while they
 * are showing — better a bar with no active entry than the wrong one lit.
 */
export function sectionForDestination(destination: MenuDestination): AppSection | null {
  return destination === "Meetups" || destination === "You" ? null : destination;
}

/**
 * Whether arriving at a section should close an open conversation.
 *
 * Chat keeps the thread open so a member can flick to another section and back
 * without losing their place; every other section is a fresh context.
 */
export function shouldCloseThreadForSection(section: AppSection): boolean {
  return section !== "Chats";
}