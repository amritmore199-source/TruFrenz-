import { describe, expect, it } from "vitest";

import {
  INVITE_BASE_FALLBACK,
  INVITE_PATH,
  buildInviteAppLink,
  buildInviteLink,
  inviteCode,
  inviteLinkIsLive,
  inviteReadinessNote,
  inviteSmsText,
} from "../lib/invite-link";

describe("the invite link", () => {
  /*
   * A bare domain told the app nothing: not who invited whom, not which screen
   * to open. The path and the code are what make the link traceable, which is
   * the basis of the referral month in the pricing plan.
   */
  it("is a real referral URL rather than a bare address", () => {
    const link = buildInviteLink("https://trufrenz.net", "member-42");
    expect(link).toMatch(new RegExp(`^https://trufrenz\\.net/${INVITE_PATH}/[a-z2-9]{8}$`));
    expect(link).not.toBe("https://trufrenz.net");
  });

  it("uses the same code for the same member every time", () => {
    expect(inviteCode("member-42")).toBe(inviteCode("member-42"));
    expect(inviteCode("42")).toBe(inviteCode(42));
    expect(inviteCode("member-42")).not.toBe(inviteCode("member-43"));
  });

  /*
   * These codes get read aloud and typed by hand, so the characters that are
   * easily confused with each other must not appear in them.
   */
  it("avoids the characters people misread when copying by hand", () => {
    for (const seed of ["a", "member-42", "9", "someone-else-entirely", "zzzz"]) {
      expect(inviteCode(seed)).not.toMatch(/[ilo01]/);
    }
  });

  it("does not collapse to the same code for similar names", () => {
    const codes = new Set(["maya", "sam", "noah", "asha", "maya chen", "maya-chen"].map(inviteCode));
    expect(codes.size).toBe(6);
  });

  it("returns nothing usable for an empty seed rather than a link with a hole in it", () => {
    expect(inviteCode("")).toBe("");
    expect(inviteCode("   ")).toBe("");
    expect(buildInviteLink("https://trufrenz.net", "")).toBe("https://trufrenz.net");
  });

  it("does not double the slash when the configured base trails one", () => {
    expect(buildInviteLink("https://trufrenz.net/", "member-42")).toBe(buildInviteLink("https://trufrenz.net", "member-42"));
  });

  it("falls back to the registered domain when nothing is configured", () => {
    expect(buildInviteLink("", "member-42").startsWith(INVITE_BASE_FALLBACK)).toBe(true);
  });

  /*
   * The app link travels alongside the web link, not instead of it: somebody who
   * does not have the app needs an address their phone can open, not a scheme.
   */
  it("also offers a link that opens the installed app", () => {
    const appLink = buildInviteAppLink("manuskindrednearby", "member-42");
    expect(appLink).toMatch(/^manuskindrednearby:\/\/i\?code=[a-z2-9]{8}$/);
    expect(appLink).toContain(inviteCode("member-42"));
  });

  /*
   * The scheme is generated from the bundle id at build time, so it differs
   * between builds and between a development and a store build. A hardcoded one
   * would have been wrong on the very first build — the shipped app answers to
   * `manuskindrednearby`, not `trufrenz` — and would break silently on the next.
   * So the value is taken from the live config, and an unusable one produces no
   * app link at all rather than a broken one.
   */
  it("reads the app's own scheme instead of assuming one", () => {
    expect(buildInviteAppLink("manuskindrednearby", "member-42")).toContain("manuskindrednearby://");
    expect(buildInviteAppLink(null, "member-42")).toBe("");
    expect(buildInviteAppLink("", "member-42")).toBe("");
    expect(buildInviteAppLink("not a scheme", "member-42")).toBe("");
    expect(buildInviteAppLink(["build.one", "build.two"], "member-42")).toContain("build.one://");
  });
});

describe("whether the link is worth sending", () => {
  /*
   * A domain is not a website. trufrenz.net is registered but nothing serves
   * it yet, so handing that link to a member sends their friend to a dead page.
   * The app says so instead of letting the invitation look broken.
   */
  it("reports the shipped default as staged rather than live", () => {
    expect(inviteLinkIsLive(INVITE_BASE_FALLBACK)).toBe(false);
    expect(inviteLinkIsLive("")).toBe(false);
    expect(inviteLinkIsLive(null)).toBe(false);
  });

  it("reports a configured address as live", () => {
    expect(inviteLinkIsLive("https://trufrenz.net/invite")).toBe(true);
    expect(inviteLinkIsLive("http://localhost:8081")).toBe(true);
  });

  it("still warns in the message a member reads, when the link is not ready", () => {
    expect(inviteReadinessNote(INVITE_BASE_FALLBACK)).toContain("isn't published yet");
    expect(inviteReadinessNote(INVITE_BASE_FALLBACK)).toContain("EXPO_PUBLIC_INVITE_URL");
    expect(inviteReadinessNote("https://trufrenz.net/invite")).toContain("live");
  });
});

describe("the drafted invitation", () => {
  it("names the sender, because an anonymous invite is exactly what a safety-first app should not send", () => {
    const text = inviteSmsText({ link: "https://trufrenz.net/i/abc23456", fromName: "Maya" });
    expect(text).toContain("Maya invited you to Trufrenz.");
    expect(text).toContain("https://trufrenz.net/i/abc23456");
  });

  it("says plainly that this is not a dating app", () => {
    expect(inviteSmsText({ link: "https://x.test/i/abc", fromName: "Sam" })).toMatch(/not dating/i);
  });

  /*
   * A display name with an emoji in it used to break the code generator: the
   * alphabet was indexed by `text[index]`, which walks UTF-16 code units, so
   * half a surrogate pair came back as `undefined`, `hash ^ undefined` stayed
   * undefined, and the code ended with the literal word "undefined".
   */
  it("handles a name containing an emoji, which used to produce the word undefined", () => {
    const code = inviteCode("Maya 🌻");
    expect(code).toMatch(/^[a-z2-9]{8}$/);
    expect(code).not.toContain("undefined");
    expect(inviteCode("🌻")).toMatch(/^[a-z2-9]{8}$/);
  });

  /*
   * A display name containing an emoji used to break the generator and produce
   * a code ending in the literal word "undefined".
   */
  it("handles a name containing an emoji", () => {
    const code = inviteCode("Maya 🌻");
    expect(code).toMatch(/^[a-z2-9]{8}$/);
    expect(code).not.toContain("undefined");
    expect(inviteCode("🌻")).toMatch(/^[a-z2-9]{8}$/);
  });

  it("copes with a member who has not set a name yet", () => {
    const text = inviteSmsText({ link: "https://x.test/i/abc", fromName: "  " });
    expect(text).toContain("You're invited to Trufrenz.");
    expect(text).not.toContain("invited you to Trufrenz.");
  });

  it("includes the app link only when there is one", () => {
    const withApp = inviteSmsText({ link: "l", fromName: "Maya", appLink: "trufrenz://i?code=abc" });
    const withoutApp = inviteSmsText({ link: "l", fromName: "Maya", appLink: null });
    expect(withApp).toContain("Already have it?");
    expect(withoutApp).not.toContain("Already have it?");
  });
});
