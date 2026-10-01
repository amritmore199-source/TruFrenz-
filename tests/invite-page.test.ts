import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  inviteLandingIsUsable,
  invitePageHtml,
  readInviteCode,
  readInviterName,
  readStoreLinks,
} from "../server/invitePage";
import {
  normalizeReferralCode,
  shouldAttributeReferral,
} from "../server/referralService";
import { inviteCode } from "../lib/invite-link";

const render = (over: Partial<Parameters<typeof invitePageHtml>[0]> = {}) =>
  invitePageHtml({
    inviterName: "Maya",
    code: "abc23456",
    appScheme: "manuskindrednearby",
    storeLinks: { ios: null, android: null },
    ...over,
  });

describe("the invitation page", () => {
  it("names the sender, which is the whole point of a personal link", () => {
    expect(render()).toContain("Maya invited you to Trufrenz");
  });

  it("still works when the sender is unknown", () => {
    const page = render({ inviterName: null });
    expect(page).toContain("You're invited to Trufrenz");
    expect(page).not.toContain("null");
  });

  /*
   * An invite link is the first thing a stranger sees of this app, and the
   * product's central promise is that it is not a dating service. Saying so on
   * that first screen is the cheapest place to say it.
   */
  it("says plainly that this is not a dating app", () => {
    expect(render()).toMatch(/not dating/i);
  });

  it("repeats the safety promises somebody is agreeing to", () => {
    const page = render();
    expect(page).toContain("Chat opens after you both agree");
    expect(page).toContain("number stays private");
    expect(page).toContain("Friendship and hangouts only");
  });

  it("states the age rule, because joining is a commitment", () => {
    expect(render()).toContain("18 and over");
  });

  /*
   * Store routes are not configured yet. A button that leads nowhere is worse
   * than an honest sentence, so the page says what is true instead.
   */
  /*
   * The worst version of this page offered only "I already have Trufrenz" to
   * somebody who had never installed it: they tap it and nothing happens. So the
   * honest note appears whenever there is no store to send a newcomer to, and
   * the app link rides beneath it for the visitor who did install the app.
   */
  it("tells a visitor without the app where things stand, rather than only offering the app they lack", () => {
    const page = render();
    expect(page).not.toContain("Get it for Android");
    expect(page).not.toContain("Get it for iPhone");
    expect(page).toContain("finishing its store release");
    expect(page).toContain("I already have Trufrenz");
  });

  it("drops the note once a store actually exists", () => {
    const page = render({ storeLinks: { ios: "https://apps.apple.com/x", android: null } });
    expect(page).not.toContain("finishing its store release");
    expect(page).toContain("Get it for iPhone");
  });

  it("offers the exact store when one is configured", () => {
    const page = render({
      storeLinks: { ios: null, android: "https://play.google.com/store/apps/details?id=x" },
    });
    expect(page).toContain("Get it for Android");
    expect(page).toContain("https://play.google.com/store/apps/details?id=x");
    expect(page).not.toContain("Get it for iPhone");
  });

  /*
   * The scheme link opens the app the visitor already has. It is offered only
   * when a code actually arrived, so nobody is handed a scheme URL that opens a
   * blank screen.
   */
  it("offers to open the app only when there is a code to carry", () => {
    expect(render()).toContain("manuskindrednearby://i?code=abc23456");
    expect(render({ code: null })).not.toContain("I already have Trufrenz");
  });

  it("states the invite code, so a link can be compared with a spoken one", () => {
    expect(render()).toContain("Invite code abc23456");
    expect(render({ code: null })).not.toContain("Invite code");
  });

  it("is a whole document that needs nothing from the network", () => {
    const page = render();
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("</html>");
    // No scripts, no remote fonts, no remote images: the page renders for
    // somebody on a slow phone with no extra request.
    expect(page).not.toMatch(/<script/i);
    expect(page).not.toMatch(/https?:\/\/[^"]*\.(js|css|png|jpg|woff)/i);
  });
});

describe("what a stranger can put into the page", () => {
  /*
   * The inviter's name arrives from a URL and is member supplied, so it is
   * escaped before it reaches the markup.
   */
  it("escapes the inviter's name rather than trusting it", () => {
    const page = render({ inviterName: '<script>alert(1)</script>' });
    expect(page).not.toContain("<script>alert(1)</script>");
    expect(page).toContain("&lt;script&gt;");
  });

  it("escapes every character that could break out of the markup", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    expect(escapeHtml("O'Brien & sons")).toBe("O&#39;Brien &amp; sons");
  });

  /*
   * The code is generated by the app, so anything that is not the shape the app
   * produces is treated as absent rather than reflected into the page.
   */
  it("accepts only codes the app could have produced", () => {
    expect(readInviteCode("abc23456")).toBe("abc23456");
    expect(readInviteCode("ABC23456")).toBe("abc23456");
    expect(readInviteCode("<script>")).toBe(null);
    expect(readInviteCode("abc2345")).toBe(null);
    expect(readInviteCode("abc234567")).toBe(null);
    expect(readInviteCode("abc23450")).toBe(null); // 0 and 1 are not in the alphabet
    expect(readInviteCode(null)).toBe(null);
    expect(readInviteCode(["a", "b"])).toBe(null);
  });

  it("keeps a name to something a page can hold", () => {
    expect(readInviterName("  Maya   Chen  ")).toBe("Maya Chen");
    expect(readInviterName("x".repeat(200))!.length).toBe(40);
    expect(readInviterName("   ")).toBe(null);
  });

  it("ignores a store link that is not an https address", () => {
    const links = readStoreLinks({
      TRUFRENZ_IOS_STORE_URL: "javascript:alert(1)",
      TRUFRENZ_ANDROID_STORE_URL: "https://play.google.com/x",
    } as unknown as NodeJS.ProcessEnv);
    expect(links.ios).toBe(null);
    expect(links.android).toBe("https://play.google.com/x");
  });

  it("reports whether the page has anywhere to send a visitor", () => {
    expect(inviteLandingIsUsable({ ios: null, android: null })).toBe(false);
    expect(inviteLandingIsUsable({ ios: "https://x.test", android: null })).toBe(true);
  });
});

describe("who gets credited for an invitation", () => {
  const member = (id: number, over: { referredByCode?: string | null } = {}) => ({
    id,
    referredByCode: over.referredByCode ?? null,
    referredAt: null,
  });

  it("credits the sender when everything lines up", () => {
    expect(
      shouldAttributeReferral({ code: "abc23456", member: member(2), inviterId: 1 }),
    ).toBe(true);
  });

  /*
   * Attributing somebody twice would let a reward be moved by sharing a link
   * more widely, so the first invitation is the one that stands.
   */
  it("refuses to reassign somebody who was already invited", () => {
    expect(
      shouldAttributeReferral({ code: "abc23456", member: member(2, { referredByCode: "zzz23456" }), inviterId: 1 }),
    ).toBe(false);
  });

  /*
   * Self-referral is the first thing anybody tries, and the cheapest to stop.
   */
  it("refuses to let a member invite themselves", () => {
    expect(shouldAttributeReferral({ code: inviteCode(7), member: member(7), inviterId: 7 })).toBe(false);
  });

  it("refuses a code that belongs to nobody, or to a shape the app cannot produce", () => {
    expect(shouldAttributeReferral({ code: "abc23456", member: member(2), inviterId: null })).toBe(false);
    expect(shouldAttributeReferral({ code: null, member: member(2), inviterId: 1 })).toBe(false);
    expect(shouldAttributeReferral({ code: "nope", member: member(2), inviterId: 1 })).toBe(false);
  });

  it("normalises a code the way the link does, so case cannot break attribution", () => {
    expect(normalizeReferralCode("ABC23456")).toBe("abc23456");
    expect(normalizeReferralCode(" abc23456 ")).toBe("abc23456");
    expect(normalizeReferralCode("bad")).toBe(null);
    expect(normalizeReferralCode(undefined)).toBe(null);
  });

  /*
   * The code is derived from the account, never stored, so a resolved code must
   * agree with what the link generator produces for the same member.
   */
  it("matches the code the sender's own link would carry", () => {
    expect(normalizeReferralCode(inviteCode(42))).toBe(inviteCode(42));
  });
});