/**
 * Serving the invitation page.
 *
 * Split from `invitePage.ts`, which is pure HTML with no imports of its own, so
 * the page's markup can be tested without a database or an Express app — and so
 * nothing in the HTML path can accidentally acquire a dependency on the account
 * tables.
 *
 * The route answers three shapes, because a link that only works when it is
 * perfect is a link that disappoints:
 *
 *   /i/CODE   the real invitation, naming the sender when the code resolves
 *   /i        somebody typed the path without a code
 *   /i/xxxx   a code that does not belong to anyone
 *
 * The last two still render the page. A visitor who followed something real
 * deserves the explanation, not a 404.
 */

import type { Express, Request, Response } from "express";

import {
  invitePageHtml,
  readInviteCode,
  readInviterName,
  readStoreLinks,
} from "./invitePage";
import { findInviterByCode } from "./referralService";

/** The scheme the app answers to, used for the "I already have it" button. */
function appScheme(): string {
  // Generated from the bundle id at build time by app.config.ts, so it is read
  // from the environment rather than assumed. The previous development value is
  // the fallback so the button is not dead while a deployment catches up.
  const configured = (process.env.TRUFRENZ_APP_SCHEME ?? "").trim();
  return /^[a-z][a-z0-9+.-]*$/i.test(configured) ? configured : "manuskindrednearby";
}

export function registerInvitePage(app: Express): void {
  /*
   * One handler for every shape of the path, rather than three routes that
   * would each have to remember the same headers.
   */
  const render = async (req: Request, res: Response) => {
    const code = readInviteCode(req.params.code);

    /*
     * The name can arrive two ways. The app puts it in the query string, so the
     * page names the sender immediately with no database work. When the link is
     * opened without it — a link pasted into a browser from somewhere that
     * dropped the query — the code is resolved instead, which costs a lookup but
     * means the page still says who invited them.
     */
    let inviterName = readInviterName(req.query.from);
    if (!inviterName && code) {
      const inviter = await findInviterByCode(code);
      inviterName = inviter?.name ?? null;
    }

    res.status(200);
    // The page names the inviter, so it must never be cached by a shared proxy
    // and served to somebody else's visitor.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // The document is entirely self-contained: no scripts, no fonts, no images
    // fetched from elsewhere. This is what makes that true, not an accident.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
    );
    res.send(
      invitePageHtml({
        inviterName,
        code,
        appScheme: appScheme(),
        storeLinks: readStoreLinks(),
      }),
    );
  };

  app.get("/i/:code", (req, res, next) => {
    render(req, res).catch(next);
  });
  app.get("/i", (req, res, next) => {
    render(req, res).catch(next);
  });
}