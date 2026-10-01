/**
 * The five sections of the bottom bar.
 *
 * The bar has been through two shapes. It began as Chats, Friends, Meetups and
 * You. Meetups and You then left it, because meetups are planned inside a
 * conversation and a member's own profile is reached from the avatar in the top
 * bar, and Groups took the freed room — leaving Chat, Groups, Friends, Bizz.
 *
 * Friends has now gone the same way as Meetups, but for a stronger reason than
 * "rarely visited": every job it did is really a job about *people you talk to*.
 * Searching for someone, answering a request they sent you, following up a
 * request you sent, and finding someone from your own phone contacts are all
 * steps towards opening a conversation, and they were being performed one
 * screen away from the conversations they produce. The member had to know to
 * leave Chat and come back. Those features now live in Chats, where the search
 * box finds a friend the same way it finds a thread.
 *
 * The bar therefore shows, left to right: Chats, Groups, Hangouts, Bizz,
 * Profile. Chats and Groups are the two places conversations live. Hangouts is
 * the plans surface. Bizz is the business section, still a shell. Profile holds
 * the member's identity, verification and every setting — it replaces the old
 * "You" destination and, unlike it, earns a permanent place so a member can
 * always reach their settings without hunting for an avatar.
 *
 * Five entries is the ceiling for this bar: the labels sit under a 19pt icon in
 * a fifth of the width, and a sixth would start truncating on a 320pt screen.
 *
 * This module is pure so the ordering, labels and accents can be pinned by
 * tests rather than drifting apart from the bar that renders them.
 */

/** A section that earns a place on the bottom bar. */
export type AppSection = "Chats" | "Groups" | "Hangouts" | "Bizz" | "Profile";

/** Where the bar's glass weight lookup lands for each section. */
export type SectionAccent = "chats" | "groups" | "hangouts" | "bizz" | "profile";

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
 * The bar's order is deliberate: talking first, then the circles people talk
 * in, then the plans those conversations produce, then the business section,
 * and finally the member's own corner.
 */
export const BOTTOM_SECTIONS: readonly SectionDefinition[] = [
  {
    id: "Chats",
    label: "Chats",
    title: "Chats",
    icon: "forum",
    purpose:
      "Your conversations, your friends and their requests, and people you know from your own phone.",
    accent: "chats",
  },
  {
    id: "Groups",
    label: "Groups",
    title: "Groups",
    icon: "groups",
    purpose: "Every circle you belong to, active and closed.",
    accent: "groups",
  },
  {
    id: "Hangouts",
    label: "Hangouts",
    title: "Hangouts",
    icon: "event-available",
    purpose: "Plans with your friends, proposed and confirmed.",
    accent: "hangouts",
  },
  {
    id: "Bizz",
    label: "Bizz",
    title: "Bizz",
    icon: "storefront",
    purpose: "Business tools, short and simple. Opening soon.",
    accent: "bizz",
  },
  {
    id: "Profile",
    label: "Profile",
    title: "Profile",
    icon: "person-outline",
    purpose: "Who you are here, how you are verified, and every setting.",
    accent: "profile",
  },
] as const;

/** The section ids in bar order. */
export const BOTTOM_SECTION_IDS: readonly AppSection[] = BOTTOM_SECTIONS.map((section) => section.id);

/**
 * The section the app opens on and falls back to.
 *
 * Named rather than written as a bare "Chats" at each call site, so the default
 * cannot drift from the bar's own order.
 */
export const DEFAULT_SECTION: AppSection = "Chats";

export function sectionDefinition(id: AppSection): SectionDefinition {
  return BOTTOM_SECTIONS.find((section) => section.id === id) ?? BOTTOM_SECTIONS[0];
}

/**
 * Destinations that are reachable but are not sections.
 *
 * Only one is left: the plan feed. It is the same surface the Hangouts section
 * shows, kept reachable by name so links written against the old destination
 * still resolve. Every other former destination is now a section.
 */
export type MenuDestination = AppSection | "Meetups";

export const MENU_DESTINATIONS: readonly { id: MenuDestination; label: string; icon: string }[] =
  [
    ...BOTTOM_SECTIONS.map((section) => ({
      id: section.id as MenuDestination,
      label: section.title,
      icon: section.icon,
    })),
    /*
     * The plan feed. It has no bar entry of its own — it is shown by Hangouts,
     * which is also what lights up while it is open — but it still has to be
     * listable here, because this is the only place that lists the whole app.
     */
    { id: "Meetups" as MenuDestination, label: "Plans", icon: "event-note" },
  ];

/**
 * Which bar entry a destination lights up.
 *
 * The plan feed is shown by Hangouts, so it lights that entry. Meeting a
 * destination with no entry returns null, which is the honest answer: a bar
 * with nothing lit beats the wrong thing lit.
 */
export function sectionForDestination(destination: MenuDestination): AppSection | null {
  return destination === "Meetups" ? "Hangouts" : destination;
}

/**
 * Whether arriving at a section should close an open conversation.
 *
 * Chats keeps the thread open so a member can flick to another section and back
 * without losing their place; every other section is a fresh context.
 */
export function shouldCloseThreadForSection(section: AppSection): boolean {
  return section !== "Chats";
}
