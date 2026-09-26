export type SocialTab = "Chats" | "Friends" | "Meetups" | "You";

export function isInboxMeetupTransition(from: SocialTab, to: SocialTab): boolean {
  return (from === "Chats" && to === "Meetups") || (from === "Meetups" && to === "Chats");
}
