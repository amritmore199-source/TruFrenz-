/**
 * Bizz — what a member makes, does, or offers.
 *
 * The section has been an honest shell since it was added to the bar. This is
 * its first real tool: a member writes down what they do, and shares it into a
 * friendship as a card rather than as a paragraph of self-promotion.
 *
 * The design decision that shapes everything here: an offer is *addressed*. It
 * is not a listing, it is not a directory, and there is no way to blast one at
 * everybody. The member picks a person they have already both agreed with, and
 * the offer arrives in that conversation like anything else they might have
 * said. That keeps a circle from turning into a shop, which is the thing this
 * app exists to avoid — and it is why the rules below refuse a nameless offer or
 * an offer with no price stated rather than quietly filling in a default.
 *
 * Pure module: no React, no storage, no network, so the limits are testable.
 */

export const OFFER_WHAT_MAX = 60;
export const OFFER_DETAIL_MAX = 140;
export const OFFER_PRICE_MAX = 40;

/** An offer as the member wrote it. */
export type BizzOffer = {
  id: string;
  /** What they do, in their own words. "Sourdough, Saturdays" */
  what: string;
  /** The one line of detail: where, when, how to ask. */
  detail: string;
  /**
   * What it costs, as free text on purpose.
   *
   * "₹300 an hour", "Free first session", "Swap for bananas" — a currency field
   * would have been wrong for a section whose members are as likely to barter as
   * to charge, and requiring a number would have made the honest answer
   * impossible.
   */
  price: string;
};

/** What a member typed, before it is checked. */
export type BizzOfferDraft = {
  what: string;
  detail: string;
  price: string;
};

export const EMPTY_OFFER_DRAFT: BizzOfferDraft = { what: "", detail: "", price: "" };

/** Trim and collapse the whitespace in one field. */
export function cleanOfferField(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type OfferProblem = "no-what" | "no-price";

/**
 * Why this draft cannot be shared yet, or null when it can.
 *
 * Two fields are required and the reason is the same for both: an offer without
 * a subject cannot be answered, and an offer without a price makes the reader
 * ask a question the writer was avoiding. Everything else — the detail line, the
 * wording, the currency — is the member's business.
 */
export function offerProblem(draft: BizzOfferDraft): OfferProblem | null {
  if (!cleanOfferField(draft.what, OFFER_WHAT_MAX)) return "no-what";
  if (!cleanOfferField(draft.price, OFFER_PRICE_MAX)) return "no-price";
  return null;
}

/** The line a member reads when a draft cannot be shared yet. */
export function offerProblemCopy(problem: OfferProblem): string {
  return problem === "no-what"
    ? "Say what you offer — one short line is enough."
    : "Add what it costs, even if the answer is free. People need to know before they ask.";
}

/** Build a finished offer, or null when the draft is not ready. */
export function buildOffer(draft: BizzOfferDraft, id: string): BizzOffer | null {
  if (offerProblem(draft)) return null;
  return {
    id,
    what: cleanOfferField(draft.what, OFFER_WHAT_MAX),
    detail: cleanOfferField(draft.detail, OFFER_DETAIL_MAX),
    price: cleanOfferField(draft.price, OFFER_PRICE_MAX),
  };
}

/**
 * The line that travels with the message.
 *
 * This is what the other device sees, because the structured card is local — the
 * same arrangement plan cards already use. So it has to carry the whole offer on
 * its own: somebody reading it on a second device must still learn what is on
 * offer and what it costs, not just that an offer exists.
 */
export function offerSummary(offer: BizzOffer): string {
  const detail = offer.detail ? ` · ${offer.detail}` : "";
  return `💼 ${offer.what}${detail} · ${offer.price}`;
}

/** The one-line description used in the member's own list of offers. */
export function offerListLine(offer: BizzOffer): string {
  const detail = offer.detail ? `${offer.detail} · ` : "";
  return `${detail}${offer.price}`;
}

/**
 * Reads an offer out of stored or travelled data.
 *
 * Tolerant like every other record here: a malformed entry is dropped rather
 * than repaired into something the member did not write.
 */
export function readOffer(value: unknown): BizzOffer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = cleanOfferField(row.id, 64);
  const what = cleanOfferField(row.what, OFFER_WHAT_MAX);
  const price = cleanOfferField(row.price, OFFER_PRICE_MAX);
  if (!id || !what || !price) return null;
  return { id, what, detail: cleanOfferField(row.detail, OFFER_DETAIL_MAX), price };
}

/** Parses the stored list of a member's own offers. */
export function parseOffers(serialized: string | null | undefined): BizzOffer[] {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) return [];
    const offers: BizzOffer[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const offer = readOffer(entry);
      if (!offer || seen.has(offer.id)) continue;
      seen.add(offer.id);
      offers.push(offer);
    }
    // Most recent first, which is the order the member just created them in.
    return offers.reverse();
  } catch {
    return [];
  }
}

/** The most offers a member can keep. Enough for anyone real, bounded for storage. */
export const MAX_OFFERS = 12;

/** Add an offer to the list, newest first, dropping the oldest past the cap. */
export function addOffer(offers: BizzOffer[], offer: BizzOffer): BizzOffer[] {
  return [offer, ...offers.filter((item) => item.id !== offer.id)].slice(0, MAX_OFFERS);
}

/** Remove an offer. */
export function removeOffer(offers: BizzOffer[], id: string): BizzOffer[] {
  return offers.filter((offer) => offer.id !== id);
}

/**
 * The line shown where an offer is announced in a conversation.
 *
 * Named explicitly so the reader knows a card is coming and who sent it — an
 * unlabelled card that appears mid-chat reads as an advertisement.
 */
export function offerIntro(fromName: string): string {
  const name = cleanOfferField(fromName, 40);
  return name ? `${name} shared what they do` : "Shared from Bizz";
}