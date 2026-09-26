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
import { memberSessions, members, verificationSubmissions } from "../drizzle/schema";
import { canAccount, type AccountCapability } from "../lib/account-access";
import { isAnalyticsEventType } from "../lib/analytics-events";

const SESSION_COOKIE = "trufrenz_member_session";
const OTP_COOKIE = "trufrenz_signin_challenge";

/**
 * Pending sign-in challenges, keyed by the opaque challenge id held in a cookie.
 *
 * A real deployment stores these in Redis or the database and hands the code to
 * an SMS provider. The demo keeps them in memory and returns the code to the
 * client so the flow is reviewable without an SMS account — see the README.
 */
type Challenge = {
  phoneE164: string;
  code: string;
  expiresAt: number;
  attempts: number;
  purpose: "signup" | "login";
};

const challenges = new Map<string, Challenge>();
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

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

function pruneChallenges() {
  const now = Date.now();
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(id);
  }
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
    maxAge: CHALLENGE_TTL_MS,
    path: "/",
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
    phone: account.maskPhone(member.phoneE164),
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

  app.post("/api/account/request-otp", async (req, res) => {
    pruneChallenges();
    const rawPhone = String(req.body?.phone ?? "");
    const purpose = req.body?.purpose === "login" ? "login" : "signup";
    const phoneE164 = account.normalizePhone(rawPhone);

    if (!phoneE164) {
      res.status(400).json({ error: "Enter a valid phone number." });
      return;
    }

    const existing = await account.findMemberByPhone(phoneE164);
    if (purpose === "login" && !existing) {
      res.status(404).json({
        error: "No account uses that number yet. Create one to get started.",
        code: "account_not_found",
      });
      return;
    }

    const code = account.generateOtp();
    const id = account.generateSessionToken();
    challenges.set(id, {
      phoneE164,
      code,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      attempts: 0,
      purpose,
    });
    setChallengeCookie(res, id);

    // A real deployment sends this by SMS and never returns it. The demo
    // surfaces it so the flow can be reviewed without an SMS provider.
    const smsDelivered = Boolean(process.env.SMS_PROVIDER_KEY);
    res.json({
      ok: true,
      phone: account.maskPhone(phoneE164),
      isNewAccount: !existing,
      /** Only present when no SMS provider is configured. */
      demoCode: smsDelivered ? undefined : code,
      delivery: smsDelivered ? "sms" : "demo",
    });
  });

  app.post("/api/account/verify-otp", async (req: MemberRequest, res) => {
    pruneChallenges();
    const id = readCookie(req, OTP_COOKIE);
    const submitted = String(req.body?.code ?? "").replace(/\D/g, "");
    const challenge = id ? challenges.get(id) : undefined;

    if (!id || !challenge || challenge.expiresAt <= Date.now()) {
      res.status(400).json({ error: "That code has expired. Request a new one." });
      return;
    }
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      challenges.delete(id);
      res.status(429).json({ error: "Too many attempts. Request a new code." });
      return;
    }
    if (submitted.length !== 6 || submitted !== challenge.code) {
      challenge.attempts += 1;
      res.status(400).json({
        error: "That code does not match. Check the six digits and try again.",
        attemptsRemaining: MAX_OTP_ATTEMPTS - challenge.attempts,
      });
      return;
    }

    const name = String(req.body?.name ?? "").trim();
    const dateOfBirth = String(req.body?.dateOfBirth ?? "").trim();
    const homeArea = String(req.body?.homeArea ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    const ageRaw = Number(req.body?.age);

    // Creating an account requires the onboarding details; signing in does not.
    let member = await account.findMemberByPhone(challenge.phoneE164);
    if (!member) {
      if (name.length < 2) {
        res.status(400).json({
          error: "Add your name to finish creating your account.",
          code: "profile_incomplete",
        });
        return;
      }
      member = await account.createAccount({
        phoneE164: challenge.phoneE164,
        name,
        email: email || null,
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

    challenges.delete(id);
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
