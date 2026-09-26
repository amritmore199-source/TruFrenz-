export type PublicMeetupVenue = {
  id: string;
  name: string;
  neighborhood: string;
  note: string;
  icon: "local-cafe" | "park" | "local-library" | "storefront";
};

export const publicMeetupVenues: readonly PublicMeetupVenue[] = [
  { id: "juniper", name: "Juniper Café", neighborhood: "Pacific Heights", note: "Busy daytime café", icon: "local-cafe" },
  { id: "alta", name: "Alta Plaza Park", neighborhood: "Pacific Heights", note: "Popular public park", icon: "park" },
  { id: "green-apple", name: "Green Apple Books", neighborhood: "Inner Richmond", note: "Neighborhood bookshop", icon: "local-library" },
  { id: "ferry", name: "Ferry Building Marketplace", neighborhood: "Embarcadero", note: "Public market with plenty of people", icon: "storefront" },
] as const;

export type MeetupInviteDraft = {
  title: string;
  venue: PublicMeetupVenue;
  when: string;
};

export function buildMeetupInviteDraft(title: string, venue: PublicMeetupVenue, when: string): MeetupInviteDraft | null {
  const cleanTitle = title.trim();
  const cleanWhen = when.trim();
  if (!cleanTitle || !cleanWhen || !venue.name.trim() || !venue.neighborhood.trim()) return null;
  return { title: cleanTitle, venue, when: cleanWhen };
}

export function formatMeetupInvite(draft: MeetupInviteDraft): string {
  return `Meetup invite · ${draft.title}\n📍 ${draft.venue.name} · ${draft.venue.neighborhood}\n🕒 ${draft.when}\nNo pressure—let me know if you’d like to join.`;
}
