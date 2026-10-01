import { describe, expect, it } from "vitest";

import {
  EMPTY_OFFER_DRAFT,
  MAX_OFFERS,
  addOffer,
  buildOffer,
  offerIntro,
  offerListLine,
  offerProblem,
  offerProblemCopy,
  offerSummary,
  parseOffers,
  readOffer,
  removeOffer,
  type BizzOffer,
} from "../lib/bizz-offers";

const draft = (over: Partial<typeof EMPTY_OFFER_DRAFT> = {}) => ({
  what: "Sourdough, Saturdays",
  detail: "Order by Friday, collect from Indiranagar",
  price: "₹300 a loaf",
  ...over,
});

describe("what makes an offer shareable", () => {
  /*
   * An offer with no subject cannot be answered — the reader has no idea what
   * they would be accepting.
   */
  it("refuses an offer that does not say what is offered", () => {
    expect(offerProblem(draft({ what: "" }))).toBe("no-what");
    expect(offerProblem(draft({ what: "   " }))).toBe("no-what");
    expect(offerProblem(draft({ what: "\n\t " }))).toBe("no-what");
  });

  /*
   * A price is required on purpose. Leaving it out does not make the offer
   * friendlier; it just moves the question into the chat, where the person who
   * asked feels awkward for asking.
   */
  it("refuses an offer with no price, so nobody has to ask", () => {
    expect(offerProblem(draft({ price: "" }))).toBe("no-price");
    expect(offerProblem(draft({ price: "   " }))).toBe("no-price");
  });

  it("accepts a free offer, because free is a price", () => {
    expect(offerProblem(draft({ price: "Free" }))).toBe(null);
    expect(offerProblem(draft({ price: "Free first class" }))).toBe(null);
    expect(offerProblem(draft({ price: "Swap welcome" }))).toBe(null);
    expect(offerProblem(draft({ price: "0" }))).toBe(null);
  });

  it("treats the detail line as optional", () => {
    expect(offerProblem({ what: "Maths tutoring", detail: "", price: "₹400 an hour" })).toBe(null);
  });

  it("explains the problem in words a member can act on", () => {
    expect(offerProblemCopy("no-what")).toContain("Say what you offer");
    expect(offerProblemCopy("no-price")).toContain("free");
    // Neither line may read as a telling-off.
    for (const copy of [offerProblemCopy("no-what"), offerProblemCopy("no-price")]) {
      expect(copy).not.toMatch(/invalid|error|required field/i);
    }
  });
});

describe("building an offer", () => {
  it("returns null rather than a half-formed offer", () => {
    expect(buildOffer(draft({ what: "" }), "o1")).toBe(null);
    expect(buildOffer(draft({ price: "" }), "o1")).toBe(null);
  });

  it("trims and collapses whitespace so the card does not render a ragged line", () => {
    const offer = buildOffer(draft({ what: "  Sourdough,   Saturdays  ", price: " ₹300   a loaf " }), "o1");
    expect(offer?.what).toBe("Sourdough, Saturdays");
    expect(offer?.price).toBe("₹300 a loaf");
  });

  it("caps each field rather than refusing the offer outright", () => {
    const offer = buildOffer(draft({ what: "x".repeat(400), detail: "y".repeat(400), price: "z".repeat(400) }), "o1");
    expect(offer?.what.length).toBe(60);
    expect(offer?.detail.length).toBe(140);
    expect(offer?.price.length).toBe(40);
  });
});

describe("the line that travels", () => {
  /*
   * The card is local to the sending device, so this line is the only thing a
   * second device receives. It has to carry the whole offer — if it only said
   * "an offer", the recipient would have to ask what.
   */
  it("carries what, the detail, and the price on its own", () => {
    const offer = buildOffer(draft(), "o1")!;
    const summary = offerSummary(offer);
    expect(summary).toContain("Sourdough, Saturdays");
    expect(summary).toContain("Order by Friday");
    expect(summary).toContain("₹300 a loaf");
  });

  it("drops the separator when there is no detail, rather than leaving a gap", () => {
    const offer = buildOffer({ what: "Maths tutoring", detail: "", price: "₹400 an hour" }, "o1")!;
    expect(offerSummary(offer)).toBe("💼 Maths tutoring · ₹400 an hour");
  });

  it("does not double up the separator on the list line either", () => {
    expect(offerListLine(buildOffer({ what: "A", detail: "", price: "B" }, "o1")!)).toBe("B");
    expect(offerListLine(buildOffer({ what: "A", detail: "D", price: "B" }, "o1")!)).toBe("D · B");
  });

  /*
   * A card appearing mid-conversation with no label reads as an advertisement.
   */
  it("names the sender in the line that announces it", () => {
    expect(offerIntro("Maya")).toContain("Maya");
    expect(offerIntro("  ")).toBe("Shared from Bizz");
  });
});

describe("keeping a member's own offers", () => {
  const offer = (id: string): BizzOffer => ({ id, what: `Offer ${id}`, detail: "", price: "Free" });

  it("puts the newest first, which is the order they were thought of in", () => {
    const list = addOffer(addOffer([], offer("a")), offer("b"));
    expect(list.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("does not allow the same offer twice", () => {
    const list = addOffer(addOffer([], offer("a")), offer("a"));
    expect(list).toHaveLength(1);
  });

  it("stays bounded, dropping the oldest once the cap is reached", () => {
    let list: BizzOffer[] = [];
    for (let index = 0; index < MAX_OFFERS + 5; index += 1) list = addOffer(list, offer(`o${index}`));
    expect(list).toHaveLength(MAX_OFFERS);
    expect(list[0].id).toBe(`o${MAX_OFFERS + 4}`);
    expect(list.some((item) => item.id === "o0")).toBe(false);
  });

  it("removes one without disturbing the rest", () => {
    const list = removeOffer([offer("a"), offer("b"), offer("c")], "b");
    expect(list.map((item) => item.id)).toEqual(["a", "c"]);
  });
});

describe("reading offers back", () => {
  it("drops a record it cannot trust instead of repairing it into a guess", () => {
    expect(readOffer(null)).toBe(null);
    expect(readOffer("nope")).toBe(null);
    expect(readOffer({ id: "a" })).toBe(null);
    expect(readOffer({ id: "a", what: "x", price: "" })).toBe(null);
    expect(readOffer({ what: "x", price: "y" })).toBe(null);
  });

  it("keeps the newest first when reading from storage", () => {
    const stored = JSON.stringify([
      { id: "a", what: "Older", detail: "", price: "Free" },
      { id: "b", what: "Newer", detail: "", price: "Free" },
    ]);
    expect(parseOffers(stored).map((offer) => offer.id)).toEqual(["b", "a"]);
  });

  it("survives storage that is empty, corrupt, or the wrong shape", () => {
    expect(parseOffers(null)).toEqual([]);
    expect(parseOffers("")).toEqual([]);
    expect(parseOffers("{")).toEqual([]);
    expect(parseOffers("{}")).toEqual([]);
    expect(parseOffers("[]")).toEqual([]);
    expect(parseOffers('[{"id":"a"}]')).toEqual([]);
  });

  it("drops a duplicate id rather than showing the offer twice", () => {
    const stored = JSON.stringify([
      { id: "a", what: "One", detail: "", price: "Free" },
      { id: "a", what: "Again", detail: "", price: "Free" },
    ]);
    expect(parseOffers(stored)).toHaveLength(1);
  });
});