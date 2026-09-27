/**
 * Store deep links.
 *
 * A renewal notice that says "turn auto-renew back on in your store account" is
 * only useful if the member can actually get there. Two taps through Settings is
 * where good intentions die, so every place the app tells someone to manage
 * their subscription offers a link that opens the right screen directly.
 *
 * The tenant differs by platform and is not interchangeable:
 *
 * - Google Play subscriptions live in the Play app, under
 *   `market://details?id=<pkg>` — the `https://play.google.com/store/apps/...`
 *   web form opens a browser on some devices instead of the installed app.
 * - Apple subscriptions live in Settings, not the App Store app, so the correct
 *   target is the system Settings deep link. It is not
 *   substituteable either: `itms-apps://` would open the App Store listing,
 *   which is not where auto-renew is switched off.
 *
 * Note the honest limitation below: iOS only honours the Settings link while the
 * member subscribes to *this* app, so the copy never promises the screen will be
 * the subscriptions page — it says it will open the store, and names the section
 * to look for.
 */

/** The app's own subscriptions screen inside Google Play. */
export const PLAY_MARKET_SCHEME = "market://details";
/** Apple's per-app settings page, reached through the system Settings app. */
export const IOS_SETTINGS_SCHEME = "app-settings:";

/**
 * The package or bundle id the store knows this app by.
 *
 * Read from Expo's config at call time. It is passed in rather than imported so
 * this module stays pure and testable, and so a caller reading it lazily does not
 * pay for a config load on every render.
 */
export type StoreAppId = {
  /** From `Constants.expoConfig.android.package`. */
  androidPackage: string | null;
  /** From `Constants.expoConfig.ios.bundleIdentifier`. */
  iosBundleId: string | null;
};

export type StoreManageLink = {
  /** Whether this platform has a deep link at all. Web has none. */
  supported: boolean;
  /**
   * Ordered candidates. The caller tries each until one opens, because an
   * installed-app scheme can fail on a device that lacks the app or has the
   * link disabled, and falling back to the web form is better than a dead tap.
   */
  urls: string[];
  /** What the member should look for once the store opens. */
  sectionHint: string;
};

/** Build the manage-subscription link for a platform. */
export function storeManageLink(platform: string, appId: StoreAppId): StoreManageLink {
  if (platform === "android") {
    const pkg = appId.androidPackage?.trim();
    if (!pkg) return unsupportedLink();
    return {
      supported: true,
      // The web form last: it opens a browser on some devices, which is still
      // better than nothing, but the Play app is the expected path.
      urls: [`${PLAY_MARKET_SCHEME}?id=${pkg}`, `https://play.google.com/store/apps/details?id=${pkg}`],
      sectionHint: "Subscriptions",
    };
  }

  if (platform === "ios") {
    if (!appId.iosBundleId?.trim()) return unsupportedLink();
    return {
      supported: true,
      urls: [IOS_SETTINGS_SCHEME],
      sectionHint: "Subscriptions",
    };
  }

  // Web preview and anything else: there is no store to manage, so the app must
  // not render a button that cannot work.
  return unsupportedLink();
}

function unsupportedLink(): StoreManageLink {
  return { supported: false, urls: [], sectionHint: "" };
}

/**
 * Copy for the button, per platform.
 *
 * Named after where the tap lands rather than after the store, so the member is
 * not surprised: on iOS the destination is Settings, not the App Store.
 */
export function storeManageActionLabel(platform: string): string {
  if (platform === "android") return "Open Google Play subscriptions";
  if (platform === "ios") return "Open my subscriptions in Settings";
  return "Manage in your store account";
}

/**
 * The step-by-step fallback, for when the link cannot open — on a device without
 * the store app, or if the platform ever refuses the scheme.
 *
 * This is deliberately always shown next to the link rather than only on failure:
 * a member who is already in Settings can follow it, and one whose tap failed
 * does not need a second guess.
 */
export function storeManageStepsText(platform: string): string {
  if (platform === "android") {
    return "Google Play app → tap your profile picture → Payments & subscriptions → Subscriptions → Trufrenz";
  }
  if (platform === "ios") {
    return "Settings → tap your name → Subscriptions → Trufrenz";
  }
  return "Open your store account on your phone to manage the Trufrenz subscription.";
}

/**
 * Whether this notice is about a complimentary grant rather than a purchase.
 *
 * Recognised from the wording, because a notice carries no channel column — the
 * body is the only place the distinction is recorded. That is imperfect, so the
 * consequence of a miss is deliberately benign: a comp notice that fails to match
 * shows the ordinary renewal copy without a store link, which is less specific
 * rather than wrong. The phrases checked are ones the comp copy always contains
 * and the store copy never does.
 */
export function noticeIsCompGrant(body: string): boolean {
  return body.includes("granted to your account") || body.includes("we granted your account");
}

/**
 * Which notices should offer a store link.
 *
 * Only the ones where the member has something to *do* in the store. A courtesy
 * "your plan renews in 3 days — nothing you need to do" notice must not carry a
 * manage button; sending someone to turn off a renewal that is already on is how
 * a helpful tip becomes a cancelled subscription. The expired notice does offer
 * one, because renewing is exactly what it invites.
 *
 * A comp never does, on any notice: there is no purchase behind it to manage and
 * no renewal to switch, so the button would send the member hunting for a charge
 * that was never made. The body is consulted for that, since it is where the
 * distinction lives.
 */
export function noticeOffersStoreLink(kind: string, body = ""): boolean {
  if (noticeIsCompGrant(body)) return false;
  return kind === "subscription_renewal" || kind === "subscription_expired";
}

export function noticeIsCancelledRenewal(body: string): boolean {
  return body.includes("it will not renew");
}
