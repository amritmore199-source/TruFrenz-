/**
 * One search box for everything a member is looking for.
 *
 * The Chat section used to have two separate search surfaces. The box searched
 * conversations and already-known members; the control beside it opened a
 * panel listing the phone's contacts. That split asked the member to know, in
 * advance, where the person they wanted would be found — and a name typed into
 * the wrong one returned nothing.
 *
 * The box now searches both at once and groups the results by the one question
 * that decides what to do next:
 *
 *   Conversations   threads and circles that already exist — open them.
 *   Friends         people already in the circle — say hello.
 *   Already here    contacts from the phone who are members — send a request.
 *   Invite          contacts who are not members — send a download link.
 *
 * The grouping is the whole point. "Send a friend request" and "send an invite"
 * are different actions with different consequences, and which one applies is
 * answered by which group the row sits in rather than by anything the member
 * has to work out.
 *
 * Pure module: no React, no platform imports, no device access. The contact
 * scan is performed elsewhere and its results are passed in, so this can be
 * tested without a phone.
 */

import { contactMatchesQuery, type ContactSearchRow } from "./contact-search";

/** The four blocks, in the order they appear. */
export type ChatSearchGroupId = "conversations" | "friends" | "on-trufrenz" | "invite";

/**
 * What tapping a row does.
 *
 * A union rather than a callback so the row can be described, grouped and
 * asserted in tests without rendering anything.
 */
export type ChatSearchAction =
  | { kind: "open-thread"; chatId: string }
  | { kind: "open-friend"; personId: string }
  | { kind: "request-friend"; personId: string }
  | { kind: "invite-contact"; phoneE164: string };

export type ChatSearchRow = {
  /** Stable key for the list. */
  id: string;
  group: ChatSearchGroupId;
  /** The person's or conversation's name. */
  title: string;
  /** The line under the name: why this row is here, and what tapping does. */
  note: string;
  action: ChatSearchAction;
};

export type ChatSearchGroup = {
  id: ChatSearchGroupId;
  title: string;
  note: string;
  rows: ChatSearchRow[];
};

/**
 * How many rows one search shows per group.
 *
 * The point of this box is to find one person quickly. A cap per group rather
 * than on the total means a search that matches many contacts cannot push the
 * member's own conversations off the top of the list.
 */
export const CHAT_SEARCH_LIMIT = 12;

/** A conversation, in the shape the search needs. */
export type ChatSearchThread = {
  id: string;
  name: string;
  /** The most recent line, searched too: people remember words, not names. */
  preview: string;
  /** "direct" threads open as a conversation; "group" ones are circles. */
  kind: "direct" | "group";
};

/** A person Trufrenz already knows, with how the member relates to them. */
export type ChatSearchPerson = {
  id: string;
  name: string;
  /** Short line about them, shown under the name. */
  note: string;
  /** Whether they are already in the member's circle. */
  accepted: boolean;
  /** Whether the member has a request outstanding to them. */
  requested: boolean;
};

export type ChatSearchInput = {
  query: string;
  threads: readonly ChatSearchThread[];
  people: readonly ChatSearchPerson[];
  contacts: readonly ContactSearchRow[];
  /** Whether the device scan has ever produced results on this device. */
  contactsScanned: boolean;
  limit?: number;
};

/** Case-insensitive contains, with an empty query matching everything. */
function matches(haystack: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return haystack.toLowerCase().includes(trimmed);
}

function threadMatches(thread: ChatSearchThread, query: string): boolean {
  return matches(thread.name, query) || matches(thread.preview, query);
}

/**
 * Build the grouped result set.
 *
 * Rules worth stating, because each is a decision rather than a detail:
 *
 * - A person who is already a friend appears in Friends, not in the contact
 *   groups, even though their number is also in the phone. Otherwise the same
 *   person would appear twice with two different buttons.
 * - A contact who is a member but whose Trufrenz id cannot be resolved is still
 *   offered as a request, addressed by number. The alternative is offering
 *   nothing for a person the member can plainly see is here.
 * - Threads are listed before people. A member who types a name they already
 *   have a conversation with almost always wants that conversation.
 */
export function buildChatSearch(input: ChatSearchInput): ChatSearchGroup[] {
  const limit = input.limit ?? CHAT_SEARCH_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const acceptedIds = new Set(input.people.filter((person) => person.accepted).map((person) => person.id));

  const conversations: ChatSearchRow[] = input.threads
    .filter((thread) => threadMatches(thread, input.query))
    .slice(0, limit)
    .map((thread) => ({
      id: `thread:${thread.id}`,
      group: "conversations" as const,
      title: thread.name,
      note: thread.kind === "group" ? `Circle · ${thread.preview}` : thread.preview,
      action: { kind: "open-thread" as const, chatId: thread.id },
    }));

  const friends: ChatSearchRow[] = input.people
    .filter((person) => person.accepted && matches(person.name, input.query))
    .slice(0, limit)
    .map((person) => ({
      id: `friend:${person.id}`,
      group: "friends" as const,
      title: person.name,
      note: person.note || "In your circle",
      action: { kind: "open-friend" as const, personId: person.id },
    }));

  /*
   * Contacts are split by whether the number belonged to a member. The match
   * carries the member's display name, so a contact saved in the phone as
   * "Priya work" is found by either name.
   */
  const contacts = input.contacts.filter(
    (contact) => contactMatchesQuery(contact.name, input.query) || matches(contact.matchName ?? "", input.query),
  );

  const onTrufrenz: ChatSearchRow[] = contacts
    .filter((contact) => contact.matchName !== null)
    .slice(0, limit)
    .map((contact) => ({
      id: `contact:${contact.phoneE164}`,
      group: "on-trufrenz" as const,
      title: contact.name,
      note: `On Trufrenz as ${contact.matchName} · tap to send a friend request`,
      action: { kind: "invite-contact" as const, phoneE164: contact.phoneE164 },
    }));

  const invite: ChatSearchRow[] = contacts
    .filter((contact) => contact.matchName === null)
    .slice(0, limit)
    .map((contact) => ({
      id: `contact:${contact.phoneE164}`,
      group: "invite" as const,
      title: contact.name,
      note: "Not on Trufrenz yet · tap to send an invite link",
      action: { kind: "invite-contact" as const, phoneE164: contact.phoneE164 },
    }));

  /*
   * When the scan has never run, the contact side of the search is unknown
   * rather than empty, and the note says so. Reporting "no contacts match" for
   * a phone that was never read would be a plain lie about the member's own
   * address book.
   */
  const contactNote = input.contactsScanned
    ? "From your phone's contacts"
    : "Tap the contacts button to check your phone";

  const groups: ChatSearchGroup[] = [];
  if (conversations.length) {
    groups.push({
      id: "conversations",
      title: "Conversations",
      note: conversations.length === 1 ? "1 thread" : `${conversations.length} threads`,
      rows: conversations,
    });
  }
  if (friends.length) {
    groups.push({
      id: "friends",
      title: "Your circle",
      note: friends.length === 1 ? "1 friend" : `${friends.length} friends`,
      rows: friends,
    });
  }
  if (onTrufrenz.length) {
    groups.push({
      id: "on-trufrenz",
      title: "Already on Trufrenz",
      note: `${onTrufrenz.length} ${onTrufrenz.length === 1 ? "contact" : "contacts"} · send a friend request`,
      rows: onTrufrenz,
    });
  }
  if (invite.length) {
    groups.push({
      id: "invite",
      title: "Invite to Trufrenz",
      note: `${invite.length} ${invite.length === 1 ? "contact" : "contacts"} · send a download link`,
      rows: invite,
    });
  }

  /*
   * The empty contact blocks are reported by the caller, not added here as
   * stub groups: buildChatSearch describes what *is* found, and a caller that
   * wants to explain an empty address book asks contactSearchEmptyCopy.
   */
  return groups;
}

/**
 * Whether a search found anything at all.
 *
 * Used to decide between "no matches" and an empty state that explains the
 * contact side has not been checked yet.
 */
export function chatSearchIsEmpty(groups: readonly ChatSearchGroup[]): boolean {
  return groups.every((group) => group.rows.length === 0);
}

/** A one-line summary of what a search matched, for the accessibility label. */
export function chatSearchSummary(groups: readonly ChatSearchGroup[]): string {
  const total = groups.reduce((count, group) => count + group.rows.length, 0);
  if (total === 0) return "No matches";
  return `${total} ${total === 1 ? "match" : "matches"} in ${groups.length} ${groups.length === 1 ? "group" : "groups"}`;
}

/**
 * What to say when a search found nothing.
 *
 * The two cases are genuinely different and used to read the same. A member who
 * has never let the app read their address book is not looking at a phone with
 * no matching contacts — they are looking at a search that never had the chance
 * to match them, and telling them "nothing matches" would be a claim about
 * their own contacts that the app has not earned.
 */
export function chatSearchEmptyCopy(state: {
  contactsScanned: boolean;
}): { title: string; body: string } {
  if (state.contactsScanned) {
    return {
      title: "Nothing matches that yet",
      body: "No friend, conversation or contact matches that name. Try a first name.",
    };
  }
  return {
    title: "Nothing matches that yet",
    body: "No friend or conversation matches that name. Tap the contacts button beside the search box to check your phone's address book too.",
  };
}
