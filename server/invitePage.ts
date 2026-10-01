/**
 * The page a Trufrenz invitation opens.
 *
 * An invite link is the first thing a stranger ever sees of this app, and until
 * now it pointed at a domain with nothing behind it — the friend who tapped it
 * got a browser error, which is a poor advertisement for a product whose whole
 * promise is that it is safe and considered.
 *
 * This serves one small page for `/i/:code`. It is written as a plain HTML
 * string rather than a React route because it must render for someone who does
 * not have the app, on whatever browser they happen to be using, with no
 * JavaScript required and no bundle to download first. The page has one job:
 * say who invited them, say plainly what this app is not, and hand them the
 * right way in — the store if they are on a phone, the app if it is installed.
 *
 * Safety decisions that are deliberate:
 *  - The inviter's name is escaped before it reaches the HTML. It is member
 *    supplied text arriving from a URL, so it is treated as untrusted.
 *  - The store links are read from the environment. Until they are configured
 *    the page says the app is coming to the stores rather than showing a button
 *    that leads nowhere.
 *  - Nothing about the visitor is stored, and nothing is logged but the code.
 */

/** Escape text that is about to be placed inside HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A code coming out of a URL.
 *
 * Kept to the alphabet the app generates, so nothing else can be reflected into
 * the page. Anything that does not match is treated as absent rather than
 * rejected outright — the page still works, it just cannot name an inviter.
 */
export function readInviteCode(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return /^[a-z2-9]{8}$/.test(value) ? value : null;
}

/** A name coming out of a URL, trimmed to something a page can hold. */
export function readInviterName(raw: unknown): string | null {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;
  // Long enough for a real name, short enough that it cannot wreck the layout.
  return value.slice(0, 40);
}

/** Where to send someone who does not have the app yet. */
export type StoreLinks = { ios: string | null; android: string | null };

export function readStoreLinks(env: NodeJS.ProcessEnv = process.env): StoreLinks {
  const clean = (value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    return /^https:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
  };
  return {
    ios: clean(env.TRUFRENZ_IOS_STORE_URL),
    android: clean(env.TRUFRENZ_ANDROID_STORE_URL),
  };
}

/**
 * Whether the page has anywhere to send a visitor.
 *
 * Used by the invite screen in the app, so it can tell a member the truth about
 * their link before they send it rather than after their friend bounces.
 */
export function inviteLandingIsUsable(links: StoreLinks): boolean {
  return Boolean(links.ios || links.android);
}

/** The page. One self-contained document, no external requests. */
export function invitePageHtml(options: {
  inviterName: string | null;
  code: string | null;
  appScheme: string;
  storeLinks: StoreLinks;
}): string {
  const name = options.inviterName ? escapeHtml(options.inviterName) : null;
  const heading = name ? `${name} invited you to Trufrenz` : "You're invited to Trufrenz";
  const code = options.code ? escapeHtml(options.code) : "";
  const openLink = code ? escapeHtml(`${options.appScheme}://i?code=${code}`) : "";

  const storeButton = (href: string, label: string) =>
    `<a class="button primary" href="${escapeHtml(href)}">${label}</a>`;

  const storeButtons: string[] = [];
  if (options.storeLinks.android) storeButtons.push(storeButton(options.storeLinks.android, "Get it for Android"));
  if (options.storeLinks.ios) storeButtons.push(storeButton(options.storeLinks.ios, "Get it for iPhone"));

  /*
   * The store and the app link are different offers for different visitors, so
   * the page must not confuse them. Offering only "I already have Trufrenz" to
   * somebody who does not have it is the worst outcome — they tap it and nothing
   * happens — which is what this did whenever a code was present and no store was
   * configured.
   *
   * So the honest note appears whenever there is no store to send a newcomer to,
   * and the app link rides beneath it for the visitor who did install Trufrenz.
   * The app link is itself offered only when a code actually arrived, so nobody
   * is handed a scheme URL that opens the app on a blank screen.
   */
  const appLinkMarkup = openLink
    ? `<a class="button ghost" href="${openLink}">I already have Trufrenz</a>`
    : "";
  const noteMarkup = storeButtons.length
    ? ""
    : `<p class="note">Trufrenz is finishing its store release. Ask ${name ?? "whoever invited you"} to send you a link when it lands.</p>`;
  const action = `<div class="actions">${storeButtons.join("")}${appLinkMarkup}</div>${noteMarkup}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${heading}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #f4f1e6;
    background-image: radial-gradient(circle at 20% 10%, rgba(241, 222, 85, 0.28), transparent 46%),
                      radial-gradient(circle at 82% 78%, rgba(150, 196, 232, 0.30), transparent 50%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #2f2e29;
  }
  .card {
    width: 100%;
    max-width: 420px;
    border-radius: 24px;
    padding: 30px 24px 26px;
    background: rgba(255, 255, 255, 0.66);
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 18px 44px rgba(58, 76, 98, 0.16);
    backdrop-filter: blur(22px) saturate(150%);
    -webkit-backdrop-filter: blur(22px) saturate(150%);
    text-align: center;
  }
  .mark {
    width: 54px; height: 54px; margin: 0 auto 16px;
    border-radius: 18px; background: #f1de55;
    display: flex; align-items: center; justify-content: center;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.85), 0 6px 16px rgba(58,76,98,0.14);
  }
  h1 { font-size: 21px; line-height: 1.25; margin: 0 0 8px; letter-spacing: -0.4px; }
  .lede { font-size: 14px; line-height: 1.5; color: #56544d; margin: 0 0 20px; }
  .actions { display: flex; flex-direction: column; gap: 10px; }
  .button {
    display: block; padding: 14px 18px; border-radius: 999px;
    font-size: 15px; font-weight: 600; text-decoration: none;
    border: 1px solid transparent;
  }
  .primary { background: #f1de55; color: #33322c; }
  .ghost { background: rgba(255,255,255,0.55); color: #3f3e39; border-color: rgba(120,130,140,0.35); }
  .note { font-size: 13px; line-height: 1.5; color: #56544d; }
  .what { margin-top: 22px; padding-top: 18px; border-top: 1px solid rgba(120,130,140,0.18); }
  .what h2 { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: #6f6d64; margin: 0 0 10px; }
  .what ul { list-style: none; margin: 0; padding: 0; text-align: left; }
  .what li { font-size: 13.5px; line-height: 1.6; color: #45443e; padding-left: 18px; position: relative; }
  .what li::before { content: "•"; position: absolute; left: 4px; color: #b8a52f; }
  footer { margin-top: 20px; font-size: 11px; line-height: 1.6; color: #7b7973; }
  footer a { color: #7b7973; }
</style>
</head>
<body>
  <main class="card">
    <div class="mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#33322c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/></svg>
    </div>
    <h1>${heading}</h1>
    <p class="lede">A calm, safety-first app for finding real friends nearby — for hangouts and company, <strong>not dating</strong>.</p>
    ${action}
    <section class="what">
      <h2>What you are joining</h2>
      <ul>
        <li>Friendship and hangouts only. Never a dating app.</li>
        <li>Chat opens after you both agree — no cold messages.</li>
        <li>Your number stays private. Contacts are hashed on your phone.</li>
        <li>Verification is visible, so you know who you are meeting.</li>
      </ul>
    </section>
    <footer>
      Trufrenz · <a href="https://trufrenz.net">trufrenz.net</a><br />
      18 and over. ${code ? `Invite code ${code}.` : ""}
    </footer>
  </main>
</body>
</html>`;
}