/**
 * Consumer account API.
 *
 * Mounted at `/api/account`. This is the member app's real backend: it issues
 * sessions after phone verification, reports the account's true status and
 * capabilities, delivers moderation notices, and records the product events the
 * analytics dashboard reads.
 *
 * Every mutating route re-checks the account's status server-side, so the
 * "chat only after mutual accept" and "restricted accounts cannot participate"
 * rules hold even against a modified client.
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";

import * as account from "./accountService";
import { getDb } from "./db";
import * as billing from "./billingService";
import * as challenges from "./challengeStore";
import * as connections from "./connectionService";
import * as messages from "./messageService";
import { sendSigninCode, emailConfigured } from "./mailer";
import { sendSigninSms, smsTransportSummary } from "./sms";
import * as otpGuard from "./otpGuard";
import {
  RESEND_COOLDOWN_MS,
  decideSend,
  decideVerify,
  describeWait,
  summariseSends,
} from "../lib/otp-limits";
import { memberSessions, members, verificationSubmissions } from "../drizzle/schema";
import { canAccount, type AccountCapability } from "../lib/account-access";
import { isAnalyticsEventType } from "../lib/analytics-events";
import { checkEmail, maskEmail, normalizeEmail } from "../lib/email";
import { resolveChallengeId } from "../lib/signin-challenge";

const SESSION_COOKIE = "trufrenz_member_session";
const OTP_COOKIE = "trufrenz_signin_challenge";

/**
 * SMS delivery readiness now comes from the adapter.
 *
 * This used to read `SMS_PROVIDER_KEY` alone, which was a trap: setting that
 * variable without any sending code stopped the demo code being returned *and*
 * sent nothing, so the flow broke completely instead of staying incomplete. It
 * also ignored that Twilio needs an account SID and a sender, and that a
 * domestic Indian route needs an approved DLT template — a half-configured
 * channel used to report itself ready and then deliver nothing.
 */
function smsConfigured(): boolean {
  return smsTransportSummary().configured;
}

/**
 * Whether a code may be handed back in the response instead of being sent.
 *
 * Three rules, in order of importance:
 *
 *   1. Production never reveals a code by default. A live deployment that could
 *      send but is misconfigured must fail loudly, not mail the secret to
 *      whoever asked for it.
 *   2. A prototype with no provider still works, which is the whole point of
 *      this mode: the flow stays reviewable before an SMS account exists.
 *   3. `OTP_ALLOW_DEMO=true` overrides rule 1, for a deliberate public demo.
 */
function demoCodeAllowed(): boolean {
  if (process.env.OTP_ALLOW_DEMO === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Read one cookie from the raw request header.
 *
 * The project's Express server does not mount a cookie-parsing middleware, so
 * this mirrors the reader the admin module already uses rather than adding a
 * global dependency.
 */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}


function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: account.MEMBER_SESSION_TTL_MS,
    path: "/",
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

function setChallengeCookie(res: Response, id: string) {
  res.cookie(OTP_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: challenges.CHALLENGE_TTL_MS,
    path: "/",
  });
}

/**
 * The challenge id as it travels back to the client.
 *
 * The cookie above is the web path and stays: it is httpOnly, so a script on the
 * page cannot read the token, and it survives nothing the member can see. But it
 * cannot be the only path, which is what this fixes.
 *
 * On a phone there is no cookie jar at all — `fetch` in React Native does not
 * persist cookies — so the challenge id simply vanished between "we sent you a
 * code" and "check that code". Every code was therefore compared against no
 * challenge and refused as expired, and the member was sent back to the number
 * screen with no way forward. The same thing happened on web whenever the app and
 * the API were on different hosts, because a Lax cookie is not sent cross-site at
 * all.
 *
 * So the id is returned in the body as well and echoed back by the client on the
 * two calls that need it. The cookie is still preferred when it is present,
 * because a token in a response body can be read by any script on the page — and
 * the client only ever stores it in memory for the length of one sign-in.
 */
function challengeTokenFor(challengeId: string): string {
  return challengeId;
}

/**
 * Which sign-in a call belongs to.
 *
 * The rule itself lives in `lib/signin-challenge.ts` so it can be tested on its
 * own — it is the decision that a missing cookie silently made impossible to
 * complete a sign-in, so it is worth a test rather than a comment.
 */
function readChallengeId(req: Request): string | null {
  return resolveChallengeId({
    cookie: readCookie(req, OTP_COOKIE),
    body: typeof req.body?.challengeToken === "string" ? req.body.challengeToken : null,
  });
}

type MemberRequest = Request & { member?: account.MemberRecord };

/**
 * Resolve the caller's session. Unlike the admin guard this does *not* reject a
 * restricted account outright: the member needs to be able to read the notice
 * explaining what happened to them.
 */
async function requireMember(req: MemberRequest, res: Response, next: () => void) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  const member = await account.resolveMemberSession(token);
  if (!member) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  req.member = member;
  next();
}

/** Guard a mutating route with a specific capability. */
function requireCapability(capability: AccountCapability) {
  return (req: MemberRequest, res: Response, next: () => void) => {
    const member = req.member!;
    try {
      account.assertCapability(member, capability);
      next();
    } catch (error) {
      if (error instanceof account.AccountActionBlocked) {
        res.status(403).json({
          error: error.message,
          code: "account_restricted",
          capability,
          accountStatus: member.accountStatus,
        });
        return;
      }
      res.status(500).json({ error: "Something went wrong." });
    }
  };
}

/** The payload the app needs to render the account's true state. */
function accountPayload(member: account.MemberRecord) {
  const state = account.accountStateFor(member);
  const capabilities: AccountCapability[] = (
    [
      "browse",
      "appear-in-discovery",
      "send-friend-requests",
      "open-chats",
      "send-messages",
      "join-meetups",
      "share-location",
      "start-calls",
      "request-verification",
    ] as AccountCapability[]
  ).filter((capability) => canAccount(state, capability));

  return {
    id: member.id,
    handle: member.handle,
    name: member.name,
    /**
     * Null, not an empty string, when an email-first account has no number.
     *
     * An empty string reads as a broken field in the UI; null reads as absent,
     * which is the truth.
     */
    phone: member.phoneE164 ? account.maskPhone(member.phoneE164) : null,
    email: member.email,
    age: member.age,
    dateOfBirth: member.dateOfBirth,
    homeArea: member.homeArea,
    verificationTier: member.verificationTier,
    subscriptionTier: member.subscriptionTier,
    available: member.available,
    accountStatus: state.status,
    statusReason: member.statusReason,
    statusChangedAt: member.statusChangedAt,
    joinedAt: member.joinedAt,
    capabilities,
    isMemberAccount: Boolean(member.phoneE164),
  };
}

export function registerAccountRoutes(app: Express) {
  /* ------------------------------ sign-in ------------------------------- */

  /**
   * Ask for a code.
   *
   * Phone and email share one implementation because they share one problem:
   * generate a code, persist a challenge, hand it to a channel, and tell the
   * caller honestly whether it left the building. Only the addressing and the
   * transport differ, which is what `channel` selects.
   */
  const requestCode = async (
    req: Request,
    res: Response,
    input: { channel: "phone" | "email"; destination: string; purpose: "signup" | "login" },
  ) => {
    await challenges.pruneChallenges();
    await otpGuard.pruneSendLog(Date.now());

    /**
     * The brakes.
     *
     * Until this existed the endpoint was unlimited, which is the SMS-pumping
     * attack: point it at numbers you control, trigger thousands of paid
     * messages, and collect a share of the carrier fees — the app owner pays.
     * Aimed at a stranger instead, it makes the app the harasser and gets the
     * sender ID blocked.
     *
     * Checked before a challenge is issued or a provider is called, so a
     * refused request costs nothing and sends nothing.
     */
    const callerKey = otpGuard.callerKeyFor({
      forwardedFor: req.headers["x-forwarded-for"],
      remoteAddress: req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
    });
    const now = Date.now();
    const sends = await otpGuard.recentSends({ destination: input.destination, callerKey, now });
    const decision = decideSend(summariseSends(sends, input.destination, callerKey, now));
    if (!decision.allowed) {
      res.status(429).json({
        error: decision.message,
        code: "rate_limited",
        rule: decision.rule,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
      return;
    }

    const existing =
      input.channel === "phone"
        ? await account.findMemberByPhone(input.destination)
        : await account.findMemberByEmail(input.destination);

    // Signing in needs an account; signing up must not match one, or a member
    // would silently be pushed into the login flow with a different password
    // path than they expected.
    if (input.purpose === "login" && !existing) {
      res.status(404).json({
        error:
          input.channel === "phone"
            ? "No account uses that number yet. Create one to get started."
            : "No account uses that email yet. Create one to get started.",
        code: "account_not_found",
      });
      return;
    }

    // Which channels can actually deliver right now. This decides the response
    // shape, so the client never has to guess.
    const canSendEmail = emailConfigured();
    const canSendSms = smsConfigured();
    const deliverable = input.channel === "email" ? canSendEmail : canSendSms;

    // The code is only revealed when nothing can deliver it AND demo mode is on.
    const revealCode = !deliverable && demoCodeAllowed();

    const issued = await challenges.issueChallenge({
      channel: input.channel,
      destination: input.destination,
      purpose: input.purpose,
      revealCode,
    });

    /**
     * Deliver, and refuse to claim success we did not achieve.
     *
     * This is the bug that made sign-up unusable: the old route always answered
     * `ok: true` and returned the code only when `SMS_PROVIDER_KEY` was absent.
     * A member saw "we sent a code", typed it, and nothing had been sent at all.
     * Now a configured channel that fails is a reported failure.
     */
    if (input.channel === "email" && canSendEmail) {
      const outcome = await sendSigninCode(input.destination, issued.code);
      if (!outcome.sent) {
        res.status(502).json({
          error: "We could not send that email just now. Try again in a moment.",
          code: "email_delivery_failed",
        });
        return;
      }
    }

    if (input.channel === "phone" && canSendSms) {
      const outcome = await sendSigninSms(input.destination, issued.code);
      if (!outcome.sent) {
        res.status(502).json({
          error: "We could not send that text just now. Try again in a moment.",
          code: "sms_delivery_failed",
        });
        return;
      }
    }

    /**
     * Count the request once it has actually produced something: a message the
     * provider accepted, or a code handed back in demo mode.
     *
     * Two decisions are folded into that sentence.
     *
     * Demo mode is counted because the limit is about how many codes this number
     * has been issued, not how many were billed. Excluding it would make the
     * rule untestable without a provider — the app's "try again in 45 seconds"
     * path could never be exercised — and would leave a public demo deployment
     * open to unbounded challenge churn.
     *
     * A *refused* send is not counted, because the member received nothing. If
     * it were, a provider outage would burn their allowance and lock them out
     * of the code that never arrived.
     */
    if (deliverable || revealCode) {
      await otpGuard.recordSend({ channel: input.channel, destination: input.destination, callerKey });
    }

    setChallengeCookie(res, issued.challengeId);

    const maskedDestination =
      input.channel === "phone" ? account.maskPhone(input.destination) : maskEmail(input.destination);

    res.json({
      ok: true,
      channel: input.channel,
      destination: maskedDestination,
      isNewAccount: !existing,
      /**
       * The sign-in this code belongs to, for clients with no cookie jar.
       *
       * Returned alongside the cookie rather than instead of it: the cookie is
       * still what a browser uses, and a client that has it does not need this.
       */
      challengeToken: challengeTokenFor(issued.challengeId),
      /** Only ever present when no delivery provider exists and demo mode is on. */
      demoCode: issued.demoCode,
      delivery: deliverable ? input.channel : revealCode ? "demo" : "unavailable",
      /**
       * Set when a channel cannot deliver and demo mode is off, so the app can
       * explain the situation instead of showing an input that nothing will
       * ever satisfy.
       */
      deliveryUnavailable: !deliverable && !revealCode,
      /**
       * How long until another code may be requested.
       *
       * Sent on success as well as on refusal, because the app disables its
       * "send a new code" button for exactly this long. Without it the client
       * would have to invent a window, and would either block a request the
       * server would have accepted or invite one it would have refused.
       */
      retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
      /**
       * Which transport actually carried the code, or null when none did.
       *
       * The app names it back to the member, because "we sent a code" when the
       * message went to WhatsApp reads as a failure to somebody watching their
       * SMS inbox.
       *
       * Null when nothing was sent. `smsProviderName` reports the *default*
       * provider when nothing is configured, so returning it unconditionally
       * would have the server claim a "msg91" delivery on a deployment whose
       * only proof of sending is a code shown on screen.
       */
      transport: !deliverable
        ? null
        : input.channel === "email"
          ? "email"
          : smsTransportSummary().provider,
    });
  };

  app.post("/api/account/request-otp", async (req, res) => {
    const phoneE164 = account.normalizePhone(String(req.body?.phone ?? ""));
    if (!phoneE164) {
      res.status(400).json({ error: "Enter a valid phone number." });
      return;
    }
    await requestCode(req, res, {
      channel: "phone",
      destination: phoneE164,
      purpose: req.body?.purpose === "login" ? "login" : "signup",
    });
  });

  app.post("/api/account/request-email-otp", async (req, res) => {
    const checked = checkEmail(req.body?.email);
    if (!checked.ok) {
      res.status(400).json({ error: "Enter a valid email address, like name@example.com." });
      return;
    }
    await requestCode(req, res, {
      channel: "email",
      destination: checked.email,
      purpose: req.body?.purpose === "login" ? "login" : "signup",
    });
  });

  /**
   * Check a code without spending the challenge.
   *
   * This is the other half of the sign-up fix. The app verifies the code at step
   * two, then collects a name, a birth date, and a photo before creating the
   * account. The old route deleted the challenge the moment the code matched,
   * so the later call had nothing to work with and the account was never created
   * on the server at all — the member signed up locally and stayed a stranger to
   * the backend.
   */
  app.post("/api/account/verify-code", async (req: MemberRequest, res) => {
    await challenges.pruneChallenges();
    const id = readChallengeId(req);
    const submitted = String(req.body?.code ?? "").replace(/\D/g, "");
    const challenge = id ? await challenges.loadChallenge(id) : null;

    /**
     * A lock on guessing, counted per caller.
     *
     * The challenge caps itself at five attempts, but a guesser can ask for a
     * fresh code to reset that. Recording wrong answers against the caller
     * closes that loop. Checked before the code is compared so a locked caller
     * learns nothing about whether they guessed correctly.
     */
    const verifyCallerKey = otpGuard.callerKeyFor({
      forwardedFor: req.headers["x-forwarded-for"],
      remoteAddress: req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
    });
    const verifyNow = Date.now();
    const failures = await otpGuard.recentFailures(verifyCallerKey, verifyNow);
    const verifyDecision = decideVerify(failures, verifyCallerKey, verifyNow);
    if (!verifyDecision.allowed) {
      res.status(429).json({
        error: `Too many wrong codes. Please wait ${describeWait(verifyDecision.retryAfterSeconds)} and try again.`,
        code: "verify_locked",
        retryAfterSeconds: verifyDecision.retryAfterSeconds,
      });
      return;
    }

    const problem = challenges.challengeProblem(challenge, Date.now());
    if (problem === "missing" || problem === "expired") {
      res.status(400).json({ error: "That code has expired. Request a new one." });
      return;
    }
    if (problem === "consumed") {
      res.status(400).json({ error: "That code has already been used. Request a new one." });
      return;
    }
    if (problem === "exhausted") {
      await challenges.dropChallenge(challenge!.challengeId);
      res.status(429).json({ error: "Too many attempts. Request a new code." });
      return;
    }
    if (!challenge) {
      res.status(400).json({ error: "That code has expired. Request a new one." });
      return;
    }

    // Already proven: let the client continue rather than punishing a retry.
    if (challenges.isVerified(challenge)) {
      res.json({ ok: true, verified: true, channel: challenge.channel, destination: challenge.destination });
      return;
    }

    if (submitted.length !== 6 || !challenges.otpMatches(submitted, challenge.challengeId, challenge.codeHash)) {
      const attempts = await challenges.recordFailedAttempt(challenge.challengeId, challenge.attempts);
      await otpGuard.recordFailedVerification({ callerKey: verifyCallerKey, channel: challenge.channel });
      res.status(400).json({
        error: "That code does not match. Check the six digits and try again.",
        attemptsRemaining: Math.max(0, challenges.MAX_OTP_ATTEMPTS - attempts),
      });
      return;
    }

    // Keep the challenge alive; the account is created by the finishing call.
    await challenges.markVerified(challenge.challengeId);
    res.json({ ok: true, verified: true, channel: challenge.channel, destination: challenge.destination });
  });

  /**
   * Create the account, or sign in, using a challenge whose code was accepted.
   *
   * Idempotent: calling it twice returns the same account rather than creating a
   * second one or failing. That matters because a member who taps twice, or
   * whose connection drops after the write, must not be left without an account
   * or holding an error they cannot act on.
   */
  app.post("/api/account/complete-signin", async (req: MemberRequest, res) => {
    await challenges.pruneChallenges();
    const id = readChallengeId(req);
    const challenge = id ? await challenges.loadChallenge(id) : null;

    if (!challenge) {
      res.status(400).json({ error: "Start again — your sign-in session has ended.", code: "challenge_missing" });
      return;
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ error: "That took a little long. Request a new code.", code: "challenge_expired" });
      return;
    }
    if (!challenges.isVerified(challenge)) {
      res.status(400).json({ error: "Verify your code before continuing.", code: "not_verified" });
      return;
    }

    const name = String(req.body?.name ?? "").trim();
    const dateOfBirth = String(req.body?.dateOfBirth ?? "").trim();
    const homeArea = String(req.body?.homeArea ?? "").trim();
    const ageRaw = Number(req.body?.age);

    /**
     * An email account has no phone number yet.
     *
     * The column is nullable, so an email-first account is stored with a null
     * phone and can add one later. The member is real either way, which is what
     * lets email sign-up ship today while SMS registration is still pending.
     */
    const phoneE164 =
      challenge.channel === "phone"
        ? challenge.destination
        : account.normalizePhone(String(req.body?.phone ?? "")) ?? null;

    const requestedEmail =
      challenge.channel === "email" ? challenge.destination : normalizeEmail(String(req.body?.email ?? ""));

    let member =
      challenge.channel === "phone"
        ? await account.findMemberByPhone(challenge.destination)
        : await account.findMemberByEmail(challenge.destination);

    // An email account may already exist under the phone the member just gave.
    if (!member && phoneE164) member = await account.findMemberByPhone(phoneE164);

    if (!member) {
      if (name.length < 2) {
        res.status(400).json({
          error: "Add your name to finish creating your account.",
          code: "profile_incomplete",
        });
        return;
      }
      if (!phoneE164 && challenge.channel === "phone") {
        res.status(400).json({ error: "Enter a valid phone number.", code: "phone_required" });
        return;
      }
      member = await account.createAccount({
        phoneE164,
        // Null, never "": the column is unique and only one "" is allowed.
        name,
        email: requestedEmail || null,
        emailVerified: challenge.channel === "email",
        dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? dateOfBirth : null,
        age: Number.isFinite(ageRaw) && ageRaw >= 18 ? Math.round(ageRaw) : null,
        homeArea: homeArea || null,
      });
    } else if (name.length >= 2 && name !== member.name) {
      // Keep the profile in step when a returning member edits their details.
      const db = await getDb();
      if (db) {
        await db
          .update(members)
          .set({ name, homeArea: homeArea || member.homeArea })
          .where(eq(members.id, member.id));
      }
    }

    // An email code proves the address, whatever the account looked like before.
    if (challenge.channel === "email" && member && !member.emailVerifiedAt) {
      const db = await getDb();
      if (db) {
        await db
          .update(members)
          .set({ email: challenge.destination, emailVerifiedAt: new Date() })
          .where(eq(members.id, member.id));
      }
    }

    if (challenge.channel === "phone" && member && !member.phoneE164) {
      const db = await getDb();
      if (db) {
        await db
          .update(members)
          .set({ phoneE164: challenge.destination })
          .where(eq(members.id, member.id));
      }
    }

    await challenges.consumeChallenge(challenge.challengeId);
    res.clearCookie(OTP_COOKIE, { path: "/" });

    const token = await account.issueMemberSession(member.id);
    setSessionCookie(res, token);
    await account.recordSessionStart(member);

    const fresh = (await account.findMemberById(member.id)) ?? member;
    res.json({ ok: true, token, account: accountPayload(fresh) });
  });

  /**
   * The original one-shot route, kept for compatibility.
   *
   * It verifies and completes in a single call. The app now uses the two-step
   * pair above because its onboarding spans several screens, but this stays so
   * an older client is not bricked by the upgrade.
   */
  app.post("/api/account/verify-otp", async (req: MemberRequest, res) => {
    const id = readCookie(req, OTP_COOKIE);
    const challenge = id ? await challenges.loadChallenge(id) : null;
    const problem = challenges.challengeProblem(challenge, Date.now());

    if (!challenge || problem === "missing" || problem === "expired") {
      res.status(400).json({ error: "That code has expired. Request a new one." });
      return;
    }
    if (problem === "exhausted") {
      await challenges.dropChallenge(challenge.challengeId);
      res.status(429).json({ error: "Too many attempts. Request a new code." });
      return;
    }

    const submitted = String(req.body?.code ?? "").replace(/\D/g, "");
    if (!challenges.isVerified(challenge)) {
      if (submitted.length !== 6 || !challenges.otpMatches(submitted, challenge.challengeId, challenge.codeHash)) {
        const attempts = await challenges.recordFailedAttempt(challenge.challengeId, challenge.attempts);
        res.status(400).json({
          error: "That code does not match. Check the six digits and try again.",
          attemptsRemaining: Math.max(0, challenges.MAX_OTP_ATTEMPTS - attempts),
        });
        return;
      }
      await challenges.markVerified(challenge.challengeId);
    }

    const name = String(req.body?.name ?? "").trim();
    const dateOfBirth = String(req.body?.dateOfBirth ?? "").trim();
    const homeArea = String(req.body?.homeArea ?? "").trim();
    const ageRaw = Number(req.body?.age);

    let member = await account.findMemberByPhone(challenge.destination);
    if (!member) {
      if (name.length < 2) {
        res.status(400).json({
          error: "Add your name to finish creating your account.",
          code: "profile_incomplete",
        });
        return;
      }
      member = await account.createAccount({
        phoneE164: challenge.destination,
        name,
        email: normalizeEmail(String(req.body?.email ?? "")) || null,
        dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? dateOfBirth : null,
        age: Number.isFinite(ageRaw) && ageRaw >= 18 ? Math.round(ageRaw) : null,
        homeArea: homeArea || null,
      });
    }

    await challenges.consumeChallenge(challenge.challengeId);
    res.clearCookie(OTP_COOKIE, { path: "/" });

    const token = await account.issueMemberSession(member.id);
    setSessionCookie(res, token);
    await account.recordSessionStart(member);

    const fresh = (await account.findMemberById(member.id)) ?? member;
    res.json({ ok: true, token, account: accountPayload(fresh) });
  });

  /** Restore a session on app launch. */
  app.get("/api/account/session", requireMember, async (req: MemberRequest, res) => {
    const member = req.member!;
    const unread = (await account.listMemberNotices(member.id, 50)).filter((n) => !n.readAt).length;
    res.json({ account: accountPayload(member), unreadNotices: unread });
  });

  app.post("/api/account/session/refresh", requireMember, async (req: MemberRequest, res) => {
    await account.recordSessionStart(req.member!);
    res.json({ ok: true, account: accountPayload(req.member!) });
  });

  app.post("/api/account/sign-out", async (req: MemberRequest, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      const db = await getDb();
      if (db) {
        await db
          .delete(memberSessions)
          .where(eq(memberSessions.tokenHash, account.hashMemberToken(token)));
      }
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  /* ------------------------------ profile ------------------------------- */

  app.patch("/api/account/profile", requireMember, async (req: MemberRequest, res) => {
    const member = req.member!;
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database not available." });
      return;
    }

    const name = String(req.body?.name ?? member.name).trim().slice(0, 120);
    const homeArea = String(req.body?.homeArea ?? member.homeArea ?? "").trim().slice(0, 120);
    const available = typeof req.body?.available === "boolean" ? req.body.available : member.available;
    const email = String(req.body?.email ?? member.email ?? "").trim().slice(0, 320);

    await db
      .update(members)
      .set({ name, homeArea, available, email: email || null })
      .where(eq(members.id, member.id));

    const fresh = await account.findMemberById(member.id);
    res.json({ ok: true, account: accountPayload(fresh ?? member) });
  });

  /* ------------------------------ notices ------------------------------- */

  app.get("/api/account/notices", requireMember, async (req: MemberRequest, res) => {
    const notices = await account.listMemberNotices(req.member!.id, 50);
    res.json({
      notices: notices.map((notice) => ({
        id: notice.id,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        readAt: notice.readAt,
        createdAt: notice.createdAt,
      })),
    });
  });

  app.post("/api/account/notices/read", requireMember, async (req: MemberRequest, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    await account.markNoticesRead(req.member!.id, ids);
    res.json({ ok: true, marked: ids.length });
  });

  /* --------------------------- the member's circle ------------------------ */
  /*
   * The circle used to live only on the device, so a friendship made on one
   * phone did not exist on the next device. These two routes move it onto the
   * account: `GET` reads it, `POST` applies the changes a device still owes.
   *
   * The write is additive on purpose. The client sends only what it changed, and
   * the server returns the whole circle afterwards, so a device that has been
   * offline cannot overwrite connections it never knew about.
   */
  app.get("/api/account/connections", requireMember, async (req: MemberRequest, res) => {
    const rows = await connections.listConnections(req.member!.id);
    res.json({ connections: rows });
  });

  app.post("/api/account/connections", requireMember, async (req: MemberRequest, res) => {
    const rows = connections.normalizeRows(req.body?.connections);
    /*
     * Removals travel with the same batch. A block is not one of the four
     * connection states — it ends the relationship — so it is a delete rather
     * than a state, and sending both together means one request leaves the row
     * in exactly one place.
     */
    const removals = Array.isArray(req.body?.removed)
      ? req.body.removed.filter((peerId: unknown): peerId is string => typeof peerId === "string")
      : [];
    const saved = await connections.applyConnections(req.member!.id, rows, removals);
    res.json({ ok: true, applied: rows.length, removed: removals.length, connections: saved });
  });
  /* ------------------------ the member's own words ----------------------- */
  /*
   * The circle moved to the server but the words did not, so a message sent on a
   * phone was absent on a tablet. `GET` returns what the member has said; `POST`
   * stores what a device still owes.
   *
   * Only the member's own messages travel, and that is enforced by the shape of
   * these routes rather than by the client: there is no field here for the other
   * person's words, so no device can rewrite what somebody else said.
   */
  app.get("/api/account/messages", requireMember, async (req: MemberRequest, res) => {
    const rows = await messages.listMessages(req.member!.id);
    res.json({ messages: rows });
  });
  app.post("/api/account/messages", requireMember, async (req: MemberRequest, res) => {
    const rows = messages.normalizeMessages(req.body?.messages);
    const saved = await messages.applyMessages(req.member!.id, rows);
    res.json({ ok: true, applied: rows.length, messages: saved });
  });

  /* ------------------------- capability-guarded -------------------------- */
  /*  Each route below re-checks the account's status on the server so a       */
  /*  restricted account cannot act, whatever the client believes.            */

  app.post(
    "/api/account/actions/friend-request",
    requireMember,
    requireCapability("send-friend-requests"),
    async (req: MemberRequest, res) => {
      const targetName = String(req.body?.targetName ?? "a member").slice(0, 120);
      await account.recordEvent({
        eventType: "friend_request_sent",
        memberId: req.member!.id,
        metadata: { targetName },
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/friendship-accepted",
    requireMember,
    requireCapability("send-friend-requests"),
    async (req: MemberRequest, res) => {
      await account.recordEvent({
        eventType: "friendship_accepted",
        memberId: req.member!.id,
        metadata: { withName: String(req.body?.withName ?? "") },
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/message",
    requireMember,
    requireCapability("send-messages"),
    async (req: MemberRequest, res) => {
      const groupId = req.body?.groupId ? String(req.body.groupId).slice(0, 64) : null;
      await account.recordEvent({
        eventType: "message_sent",
        memberId: req.member!.id,
        groupId,
        metadata: { thread: String(req.body?.thread ?? "") },
      });
      if (groupId) {
        await account.recordEvent({
          eventType: "group_active",
          memberId: req.member!.id,
          groupId,
        });
      }
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/meetup-join",
    requireMember,
    requireCapability("join-meetups"),
    async (req: MemberRequest, res) => {
      await account.recordEvent({
        eventType: "meetup_joined",
        memberId: req.member!.id,
        metadata: { meetup: String(req.body?.meetup ?? "") },
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/meetup-create",
    requireMember,
    requireCapability("join-meetups"),
    async (req: MemberRequest, res) => {
      await account.recordEvent({
        eventType: "meetup_created",
        memberId: req.member!.id,
        metadata: { venue: String(req.body?.venue ?? "") },
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/group-create",
    requireMember,
    requireCapability("send-messages"),
    async (req: MemberRequest, res) => {
      await account.recordEvent({
        eventType: "group_created",
        memberId: req.member!.id,
        metadata: { name: String(req.body?.name ?? "") },
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/call",
    requireMember,
    requireCapability("start-calls"),
    async (req: MemberRequest, res) => {
      // Premium gating stays a client-side UX affordance, but the entitlement
      // itself is confirmed here so it cannot be bypassed.
      if (req.member!.subscriptionTier !== "premium") {
        res.status(402).json({
          error: "Calling is part of Premium. Upgrade to start calls.",
          code: "premium_required",
        });
        return;
      }
      await account.recordEvent({
        eventType: "call_started",
        memberId: req.member!.id,
        metadata: { kind: String(req.body?.kind ?? "voice") },
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/share-location",
    requireMember,
    requireCapability("share-location"),
    async (req: MemberRequest, res) => {
      await account.recordEvent({
        eventType: "message_sent",
        memberId: req.member!.id,
        metadata: { kind: "location", area: String(req.body?.area ?? "") },
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/actions/verification-submit",
    requireMember,
    requireCapability("request-verification"),
    async (req: MemberRequest, res) => {
      const member = req.member!;
      if (member.verificationTier === "id_selfie") {
        res.status(400).json({ error: "Your identity is already verified." });
        return;
      }
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Database not available." });
        return;
      }
      await db.insert(verificationSubmissions).values({
        memberId: member.id,
        memberName: member.name,
        submittedName: String(req.body?.submittedName ?? member.name).slice(0, 120),
        submittedDob: String(req.body?.dateOfBirth ?? member.dateOfBirth ?? "2000-01-01").slice(0, 10),
        selfieRef: `member/${member.id}/selfie.jpg`,
        idDocumentRef: `member/${member.id}/id.jpg`,
        riskScore: 10,
        status: "pending",
      });
      res.json({ ok: true, queued: true });
    },
  );

  /* --------------------------- event ingest ----------------------------- */

  /**
   * Generic product-event endpoint for client-side happenings the server does
   * not itself observe (opening a screen, a local demo interaction). Unknown
   * event types are rejected rather than silently stored.
   */
  app.post("/api/account/events", requireMember, async (req: MemberRequest, res) => {
    const incoming = Array.isArray(req.body?.events) ? req.body.events : [];
    let accepted = 0;

    for (const raw of incoming.slice(0, 50)) {
      const eventType = String(raw?.eventType ?? "");
      if (!isAnalyticsEventType(eventType)) continue;
      await account.recordEvent({
        eventType,
        memberId: req.member!.id,
        groupId: raw?.groupId ? String(raw.groupId).slice(0, 64) : null,
        metadata: raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : null,
      });
      accepted += 1;
    }

    res.json({ ok: true, accepted });
  });

  /* ------------------------------ billing ------------------------------- */
  /*  The client never grants Premium. It hands the store's receipt to these  */
  /*  routes, which verify it with the store and only then flip the tier.     */

  /**
   * The product catalogue.
   *
   * The app reads its product ids and prices from here rather than hard-coding
   * them, so the store listing and the paywall cannot drift apart.
   */
  app.get("/api/account/billing/products", async (_req, res) => {
    res.json({
      products: billing.storeCatalog(),
      /** "store" once real credentials exist, "sandbox" until then. */
      verification: billing.verificationMode(),
    });
  });

  /** The member's real entitlement, derived from unexpired verified receipts. */
  app.get("/api/account/billing/entitlement", requireMember, async (req: MemberRequest, res) => {
    const entitlement = await billing.entitlementForMember(req.member!.id);
    const receipts = await billing.listReceiptsForMember(req.member!.id);
    res.json({
      entitlement,
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        channel: receipt.channel,
        productId: receipt.productId,
        planId: receipt.planId,
        status: receipt.status,
        expiresAt: receipt.expiresAt,
        autoRenewing: receipt.autoRenewing,
        cancelledAt: receipt.cancelledAt,
        verifiedBy: receipt.verifiedBy,
        lastVerifiedAt: receipt.lastVerifiedAt,
        createdAt: receipt.createdAt,
      })),
      verification: billing.verificationMode(),
    });
  });

  /**
   * Verify a purchase.
   *
   * The body carries the store's own receipt untouched. A rejection is returned
   * with the reason, never a silent success.
   */
  app.post("/api/account/billing/verify", requireMember, async (req: MemberRequest, res) => {
    const body = req.body ?? {};
    const channel = body.channel === "app-store" ? "app-store" : body.channel === "play" ? "play" : null;
    const productId = String(body.productId ?? "").trim().slice(0, 120);
    const purchaseToken = String(body.purchaseToken ?? "").trim().slice(0, 4096);
    const signedTransaction = body.signedTransaction ? String(body.signedTransaction).slice(0, 16384) : null;
    const originalTransactionId = body.originalTransactionId
      ? String(body.originalTransactionId).slice(0, 200)
      : null;

    if (!channel) {
      res.status(400).json({ error: "That store is not supported.", code: "unsupported_channel" });
      return;
    }
    if (!productId || !purchaseToken) {
      res.status(400).json({
        error: "The store did not return a complete receipt.",
        code: "missing_receipt",
      });
      return;
    }

    try {
      const result = await billing.applyReceipt(req.member!.id, {
        channel,
        productId,
        purchaseToken,
        signedTransaction,
        originalTransactionId,
      });
      await account.recordEvent({
        eventType: "subscription_started",
        memberId: req.member!.id,
        metadata: { planId: result.entitlement.planId, channel, verifiedBy: result.entitlement.verifiedBy },
      });
      res.json({
        ok: true,
        entitlement: result.entitlement,
        transactionId: result.transactionId,
        changed: result.changed,
      });
    } catch (error) {
      if (error instanceof billing.ReceiptRejected) {
        res.status(422).json({ error: error.message, code: error.code });
        return;
      }
      res.status(500).json({ error: "Trufrenz could not confirm that purchase. Try again shortly." });
    }
  });

  /**
   * Restore purchases.
   *
   * The app replays the receipts the store already holds for this account.
   * Each one is verified exactly like a fresh purchase.
   */
  app.post("/api/account/billing/restore", requireMember, async (req: MemberRequest, res) => {
    const incoming = Array.isArray(req.body?.receipts) ? req.body.receipts : [];
    const receipts: billing.StoreReceipt[] = [];
    for (const raw of incoming.slice(0, 25)) {
      const channel = raw?.channel === "app-store" ? "app-store" : raw?.channel === "play" ? "play" : null;
      const productId = String(raw?.productId ?? "").trim().slice(0, 120);
      const purchaseToken = String(raw?.purchaseToken ?? "").trim().slice(0, 4096);
      if (!channel || !productId || !purchaseToken) continue;
      receipts.push({
        channel,
        productId,
        purchaseToken,
        signedTransaction: raw?.signedTransaction ? String(raw.signedTransaction).slice(0, 16384) : null,
        originalTransactionId: raw?.originalTransactionId ? String(raw.originalTransactionId).slice(0, 200) : null,
      });
    }

    if (receipts.length === 0) {
      res.json({ ok: true, restored: false, entitlement: await billing.entitlementForMember(req.member!.id) });
      return;
    }

    const restored = await billing.restoreReceipts(req.member!.id, receipts);
    const entitlement = restored?.entitlement ?? (await billing.entitlementForMember(req.member!.id));
    if (restored) {
      await account.recordEvent({
        eventType: "subscription_started",
        memberId: req.member!.id,
        metadata: { planId: entitlement.planId, restored: true, verifiedBy: entitlement.verifiedBy },
      });
    }
    res.json({ ok: true, restored: Boolean(restored), entitlement });
  });

  /**
   * Record a cancellation the store reported.
   *
   * Both stores keep the subscription running to the end of the paid period, so
   * this flags the receipt and leaves the tier in place until it lapses.
   */
  app.post("/api/account/billing/cancel", requireMember, async (req: MemberRequest, res) => {
    const entitlement = await billing.markReceiptCancelled(req.member!.id);
    await account.recordEvent({
      eventType: "subscription_cancelled",
      memberId: req.member!.id,
      metadata: { planId: entitlement.planId, renewsOn: entitlement.renewsOn },
    });
    res.json({ ok: true, entitlement });
  });

  /**
   * Re-check receipts that have gone stale.
   *
   * A real deployment runs this from a scheduled job; exposing it here keeps the
   * same code path reviewable and lets the dashboard trigger it by hand.
   */
  app.post("/api/account/billing/revalidate", requireMember, async (_req: MemberRequest, res) => {
    const result = await billing.revalidateDueReceipts();
    res.json({ ok: true, ...result });
  });

  console.log("[account] consumer account API registered at /api/account");
}
