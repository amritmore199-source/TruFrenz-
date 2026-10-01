/**
 * Searching the device's own contact list from the search box.
 *
 * The chat search box could only search what Trufrenz already knew: a
 * conversation, or a member who had appeared in suggestions. The person a
 * member actually wants to find is often someone they have in their phone but
 * who has no conversation yet — so the control beside the search field now
 * looks through the device's contacts as well, and says which of them are
 * already here.
 *
 * Everything stays on the device: this module only filters, groups and labels
 * what the contact scan already produced. Matching against Trufrenz members is
 * done server-side by hashed number elsewhere; nothing here sends names.
 */

export type ContactSearchRow = {
  /** The deduped, E.164 number the row is keyed by. */
  phoneE164: string;
  name: string;
  /** The Trufrenz member this contact matched, when they are already here. */
  matchName: string | null;
  /**
   * The tier the match reported. "none" is a real value rather than a missing
   * one: the scan can find an account whose owner never verified anything, and
   * saying "account found" is more honest than promoting it to "verified".
   */
  matchTier: "none" | "phone" | "id_selfie" | null;
};

export type ContactSearchGroup = {
  id: "on-trufrenz" | "invite";
  title: string;
  note: string;
  rows: ContactSearchRow[];
};

/**
 * How many rows one search shows.
 *
 * The point of this control is to find one person quickly, not to browse an
 * address book, so the list stays short enough to read without scrolling far.
 */
export const CONTACT_SEARCH_LIMIT = 24;

/** Case-insensitive match on the contact's name. An empty query matches all. */
export function contactMatchesQuery(name: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return name.toLowerCase().includes(trimmed);
}

/**
 * Filter the scanned contacts by name.
 *
 * Order is preserved: the scan already sorts by name, and re-sorting here would
 * make a member's own contacts disagree with their phone's order.
 */
export function filterContacts(
  contacts: readonly ContactSearchRow[],
  query: string,
  limit: number = CONTACT_SEARCH_LIMIT,
): ContactSearchRow[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const matched = contacts.filter((contact) => contactMatchesQuery(contact.name, query));
  return matched.slice(0, limit);
}

/**
 * Split results into the two questions a member is asking: who is already on
 * Trufrenz, and who to invite.
 *
 * Grouping rather than sorting is deliberate. "Is Priya on Trufrenz?" is
 * answered by which block the row sits in, which a member reads without
 * comparing anything.
 */
export function groupContactResults(rows: readonly ContactSearchRow[]): ContactSearchGroup[] {
  const onTrufrenz = rows.filter((row) => row.matchName !== null);
  const others = rows.filter((row) => row.matchName === null);
  const groups: ContactSearchGroup[] = [];
  if (onTrufrenz.length) {
    groups.push({
      id: "on-trufrenz",
      title: "Already on Trufrenz",
      note: onTrufrenz.length === 1 ? "1 contact is a member here" : `${onTrufrenz.length} contacts are members here`,
      rows: onTrufrenz,
    });
  }
  if (others.length) {
    groups.push({
      id: "invite",
      title: "Invite to Trufrenz",
      note: "Not here yet. Select the ones to send a link to.",
      rows: others,
    });
  }
  return groups;
}

/** The line under a contact's name. */
export function contactRowNote(row: ContactSearchRow): string {
  if (!row.matchName) return "Not on Trufrenz yet";
  const tier = row.matchTier === "id_selfie" ? "ID + selfie verified" : row.matchTier === "phone" ? "Phone verified" : "Account found";
  return `On Trufrenz as ${row.matchName} · ${tier}`;
}

/** Whether a result set has anything worth showing. */
export function contactSearchEmptyCopy(state: {
  scanning: boolean;
  scanned: boolean;
  query: string;
  contactsScanned: number;
}): { title: string; body: string } {
  if (state.scanning) {
    return { title: "Looking through your contacts", body: "Numbers are hashed on this device before anything is compared." };
  }
  if (!state.scanned) {
    return { title: "Search your phone's contacts", body: "Tap to check which of your contacts are already on Trufrenz. Names and numbers never leave this device." };
  }
  if (state.contactsScanned === 0) {
    return { title: "No contacts to search", body: "No usable numbers were found on this device. Contacts without a mobile number are skipped." };
  }
  return { title: "No contact matches that name", body: "Try a first name, or clear the box to see everyone who was checked." };
}
