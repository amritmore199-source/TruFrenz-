import { describe, expect, it } from "vitest";

import {
  IOS_SETTINGS_SCHEME,
  PLAY_MARKET_SCHEME,
  noticeIsCancelledRenewal,
  noticeIsCompGrant,
  noticeOffersStoreLink,
  storeManageActionLabel,
  storeManageLink,
  storeManageStepsText,
} from "../lib/store-links";

const APP = { androidPackage: "app.trufrenz", iosBundleId: "app.trufrenz" };

describe("store management deep links", () => {
  it("opens the Play app's own page for the app on Android", () => {
    const link = storeManageLink("android", APP);
    expect(link.supported).toBe(true);
    expect(link.urls[0]).toBe(`${PLAY_MARKET_SCHEME}?id=app.trufrenz`);
    // The web form is the fallback, not the first choice: it opens a browser on
    // some devices instead of the installed Play app.
    expect(link.urls[1]).toBe("https://play.google.com/store/apps/details?id=app.trufrenz");
    expect(link.urls[0].startsWith("market://")).toBe(true);
  });

  it("opens the system Settings page on iOS, not the App Store", () => {
    const link = storeManageLink("ios", APP);
    expect(link.supported).toBe(true);
    // Auto-renew is switched off in Settings. Sending someone to the App Store
    // listing would be the wrong destination for the action the copy asks for.
    expect(link.urls).toEqual([IOS_SETTINGS_SCHEME]);
    expect(link.urls).not.toContain("itms-apps://itunes.apple.com/app/id");
  });

  it("names the section to look for, since Settings can open at its root", () => {
    expect(storeManageLink("ios", APP).sectionHint).toBe("Subscriptions");
    expect(storeManageLink("android", APP).sectionHint).toBe("Subscriptions");
  });

  it("offers nothing on web, where there is no store to manage", () => {
    for (const platform of ["web", "macos", "windows"]) {
      const link = storeManageLink(platform, APP);
      expect(link.supported).toBe(false);
      expect(link.urls).toEqual([]);
    }
  });

  it("refuses to build a link without a package or bundle id", () => {
    // A guessed package id would open the wrong app's page, or nothing.
    expect(storeManageLink("android", { androidPackage: null, iosBundleId: "app.trufrenz" }).supported).toBe(false);
    expect(storeManageLink("android", { androidPackage: "   ", iosBundleId: "app.trufrenz" }).supported).toBe(false);
    expect(storeManageLink("ios", { androidPackage: "app.trufrenz", iosBundleId: undefined as unknown as string }).supported).toBe(false);
  });

  it("trims ids, since they often arrive from config with whitespace", () => {
    const link = storeManageLink("android", { androidPackage: " app.trufrenz ", iosBundleId: null });
    expect(link.urls[0]).toBe(`${PLAY_MARKET_SCHEME}?id=app.trufrenz`);
  });

  it("labels the button after where the tap actually lands", () => {
    expect(storeManageActionLabel("android")).toContain("Google Play");
    // iOS lands in Settings, so the label must not say "App Store".
    expect(storeManageActionLabel("ios")).toContain("Settings");
    expect(storeManageActionLabel("ios")).not.toContain("App Store");
  });

  it("always provides written steps as the fallback", () => {
    // The steps are shown beside the link, not only after it fails, because an
    // already-open Settings app needs them too.
    for (const platform of ["android", "ios", "web"]) {
      const steps = storeManageStepsText(platform);
      expect(steps.length).toBeGreaterThan(20);
      expect(steps).toContain("Trufrenz");
    }
    expect(storeManageStepsText("ios")).toContain("Subscriptions");
    expect(storeManageStepsText("android")).toContain("Play");
  });
});

describe("which notices offer a store button", () => {
  it("offers one on renewal and expiry notices", () => {
    expect(noticeOffersStoreLink("subscription_renewal")).toBe(true);
    expect(noticeOffersStoreLink("subscription_expired")).toBe(true);
  });

  it("offers none on safety notices", () => {
    for (const kind of ["warning", "suspension", "ban", "verification_approved", "announcement", "refund"]) {
      expect(noticeOffersStoreLink(kind)).toBe(false);
    }
  });

  it("distinguishes a cancelled plan from an auto-renewing one", () => {
    const cancelled =
      "Your Quarterly plan runs out on 30 Sept 2026 and it will not renew, so Premium stops then.";
    const renewing =
      "Your Quarterly plan renews on 30 Sept 2026 for ₹139. There is nothing you need to do — Premium stays on.";
    expect(noticeIsCancelledRenewal(cancelled)).toBe(true);
    expect(noticeIsCancelledRenewal(renewing)).toBe(false);
  });

  it("fails safe when a body does not match either wording", () => {
    // An unrecognised body means no button, rather than a button on a notice
    // that said "nothing you need to do" — which is how a helpful tip becomes a
    // cancelled subscription.
    expect(noticeIsCancelledRenewal("")).toBe(false);
    expect(noticeIsCancelledRenewal("Something else entirely.")).toBe(false);
  });
});


describe("comp notices never offer a store link", () => {
  it("refuses a link on any notice whose body is a comp grant", () => {
    // A comp was never sold: there is no purchase to manage and no renewal to
    // switch, so a store button would send the member hunting for a charge that
    // was never made.
    const compBody =
      "The Trufrenz Premium granted to your account ends on 10 Oct 2026. This was a gift from our support team, " +
      "so nothing is charged and there is nothing to cancel.";
    expect(noticeOffersStoreLink("subscription_renewal", compBody)).toBe(false);
    expect(noticeOffersStoreLink("subscription_expired", compBody)).toBe(false);
  });

  it("recognises the ending notice's wording too", () => {
    expect(
      noticeIsCompGrant(
        "The Trufrenz Premium we granted your account ended on 10 Oct 2026. You are back on the free plan.",
      ),
    ).toBe(true);
  });

  it("still offers a link on an ordinary paid notice", () => {
    const cancelled =
      "Your Quarterly plan runs out on 10 Oct 2026 and it will not renew, so Premium stops then.";
    expect(noticeOffersStoreLink("subscription_renewal", cancelled)).toBe(true);
    expect(noticeOffersStoreLink("subscription_expired", "Your Quarterly plan ended on 10 Oct 2026.")).toBe(true);
  });

  it("keeps refusing a link on a courtesy renewal tip", () => {
    // The pre-existing rule: a "nothing you need to do" notice must not carry a
    // cancel button. Adding comp detection must not have loosened it.
    const courtesy = "Your Quarterly plan renews on 10 Oct 2026 for ₹139. There is nothing you need to do.";
    expect(noticeOffersStoreLink("subscription_renewal", courtesy)).toBe(true);
    expect(noticeIsCancelledRenewal(courtesy)).toBe(false);
    expect(noticeOffersStoreLink("announcement", courtesy)).toBe(false);
  });

  it("treats a missing body as not-a-comp", () => {
    expect(noticeIsCompGrant("")).toBe(false);
    expect(noticeOffersStoreLink("subscription_expired")).toBe(true);
  });
});
