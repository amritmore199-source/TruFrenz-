/**
 * Admin dashboard HTTP API.
 *
 * Mounted at /api/admin on the project's Express server, which keeps it fully
 * separate from the consumer app's tRPC surface and phone OTP sign-in.
 */

import type { Express, Request, Response, NextFunction } from "express";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  createSessionToken,
  currentTotpCode,
  generateTotpSecret,
  hashPassword,
  hashSessionToken,
  readAdminCookie,
  roleCan,
  sessionExpiry,
  verifyPassword,
  verifyTotp,
  type AdminRole,
} from "./_core/adminAuth";
import * as adminDb from "./adminDb";

type AdminContext = {
  adminId: number;
  email: string;
  displayName: string;
  role: AdminRole;
  sessionTokenHash: string;
};

type AdminRequest = Request & { admin?: AdminContext };

const DEMO_ADMIN = {
  email: "safety@trufrenz.app",
  displayName: "Safety Lead",
  password: "Trufrenz#Safety2026",
};

function setAdminCookie(res: Response, token: string) {
  res.cookie?.(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_MS,
  });
}

function clearAdminCookie(res: Response) {
  res.clearCookie?.(ADMIN_COOKIE_NAME, { path: "/" });
}

/** Reject anything that is not a live dashboard session. */
async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const token = readAdminCookie(req);
    if (!token) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    const session = await adminDb.getAdminSession(hashSessionToken(token));
    if (!session) {
      clearAdminCookie(res);
      res.status(401).json({ error: "Session expired" });
      return;
    }
    req.admin = {
      adminId: session.adminId,
      email: session.email,
      displayName: session.displayName,
      role: session.role as AdminRole,
      sessionTokenHash: hashSessionToken(token),
    };
    next();
  } catch (error) {
    console.error("[admin] auth check failed", error);
    res.status(500).json({ error: "Auth check failed" });
  }
}

/** Gate a route on a role capability and record the attempt when denied. */
function requireCapability(capability: string) {
  return async (req: AdminRequest, res: Response, next: NextFunction) => {
    const admin = req.admin;
    if (!admin) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    if (!roleCan(admin.role, capability)) {
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "security",
        action: "denied",
        targetType: "capability",
        targetId: capability,
        targetLabel: capability,
        note: "Role lacks this capability.",
      });
      res.status(403).json({ error: `Your role cannot perform ${capability}.` });
      return;
    }
    next();
  };
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function registerAdminRoutes(app: Express) {
  /* ------------------------------ auth ---------------------------------- */

  app.post("/api/admin/login", async (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const code = String(req.body?.code ?? "");

      if (!email || !password || !code) {
        res.status(400).json({ error: "Email, password, and authenticator code are all required." });
        return;
      }

      const account = await adminDb.getAdminByEmail(email);
      // Identical message for unknown accounts and wrong secrets.
      const genericFailure = "Those credentials were not accepted.";
      if (!account || account.disabled) {
        res.status(401).json({ error: genericFailure });
        return;
      }
      if (!verifyPassword(password, account.passwordHash) || !verifyTotp(account.totpSecret, code)) {
        res.status(401).json({ error: genericFailure });
        return;
      }

      const token = createSessionToken();
      await adminDb.createAdminSession(hashSessionToken(token), account.id, sessionExpiry());
      await adminDb.markAdminSignedIn(account.id);
      setAdminCookie(res, token);

      await adminDb.logAdminAction({
        actorEmail: account.email,
        actorRole: account.role,
        module: "security",
        action: "sign-in",
        targetType: "admin",
        targetId: account.id,
        targetLabel: account.displayName,
      });

      res.json({
        admin: {
          email: account.email,
          displayName: account.displayName,
          role: account.role,
        },
      });
    } catch (error) {
      console.error("[admin] login failed", error);
      res.status(500).json({ error: "Sign-in failed" });
    }
  });

  app.post("/api/admin/logout", async (req: AdminRequest, res) => {
    const token = readAdminCookie(req);
    if (token) await adminDb.deleteAdminSession(hashSessionToken(token));
    clearAdminCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/admin/session", async (req: AdminRequest, res) => {
    const token = readAdminCookie(req);
    if (!token) {
      res.json({ admin: null });
      return;
    }
    const session = await adminDb.getAdminSession(hashSessionToken(token));
    res.json({
      admin: session
        ? { email: session.email, displayName: session.displayName, role: session.role }
        : null,
    });
  });

  /**
   * Bootstrap the first dashboard owner. Refuses as soon as an account exists,
   * so it cannot be used to add extra admins later. The TOTP secret is returned
   * once so the operator can add it to their authenticator app.
   */
  app.post("/api/admin/bootstrap", async (req, res) => {
    try {
      const existing = await adminDb.countAdminAccounts();
      if (existing > 0) {
        res.status(409).json({ error: "An admin account already exists." });
        return;
      }

      const email = String(req.body?.email ?? DEMO_ADMIN.email).trim().toLowerCase();
      const password = String(req.body?.password ?? DEMO_ADMIN.password);
      if (password.length < 12) {
        res.status(400).json({ error: "Choose a password of at least 12 characters." });
        return;
      }

      const totpSecret = generateTotpSecret();
      await adminDb.createAdminAccount({
        email,
        displayName: DEMO_ADMIN.displayName,
        passwordHash: hashPassword(password),
        totpSecret,
        role: "owner",
      });

      res.json({
        email,
        totpSecret,
        currentCode: currentTotpCode(totpSecret),
        note: "Add this secret to an authenticator app. The current code is shown for this session only.",
      });
    } catch (error) {
      console.error("[admin] bootstrap failed", error);
      res.status(500).json({ error: "Bootstrap failed" });
    }
  });

  /* --------------------------- 4. analytics ------------------------------ */

  app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
    const [totals, queue, metrics] = await Promise.all([
      adminDb.getMemberTotals(),
      adminDb.getQueueCounts(),
      adminDb.listDailyMetrics(14),
    ]);
    res.json({ totals, queue, metrics });
  });

  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    const days = parsePositiveInt(req.query.days, 14, 60);
    const [metrics, totals] = await Promise.all([
      adminDb.listDailyMetrics(days),
      adminDb.getMemberTotals(),
    ]);
    res.json({ metrics, totals });
  });

  /* ------------------------ 1. verification queue ------------------------ */

  app.get("/api/admin/verifications", requireAdmin, async (req, res) => {
    const status = String(req.query.status ?? "pending");
    const allowed = ["pending", "approved", "rejected", "all"];
    const rows = await adminDb.listVerificationSubmissions(
      status === "all" ? undefined : (allowed.includes(status) ? status : "pending") as "pending",
    );
    res.json({ submissions: rows });
  });

  app.post(
    "/api/admin/verifications/:id/decision",
    requireAdmin,
    requireCapability("verification.review"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const id = Number.parseInt(req.params.id, 10);
      const decision = req.body?.decision === "rejected" ? "rejected" : "approved";
      const reason = String(req.body?.reason ?? "").trim();

      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid submission id." });
        return;
      }
      // A rejection must always carry a reason so the member knows what to fix.
      if (decision === "rejected" && reason.length < 8) {
        res.status(400).json({ error: "A rejection reason of at least 8 characters is required." });
        return;
      }

      await adminDb.reviewVerificationSubmission({
        id,
        decision,
        rejectionReason: reason,
        reviewer: admin.email,
      });
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "verification",
        action: decision,
        targetType: "submission",
        targetId: id,
        targetLabel: `Submission #${id}`,
        note: decision === "rejected" ? reason : null,
      });

      res.json({ ok: true, decision });
    },
  );

  /* ----------------------- 2. reports & moderation ---------------------- */

  app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    const status = String(req.query.status ?? "open");
    const rows = await adminDb.listReports(status === "all" ? "all" : (status as "open"));
    res.json({ reports: rows });
  });

  app.post(
    "/api/admin/reports/:id/resolve",
    requireAdmin,
    requireCapability("moderation.resolve"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const id = Number.parseInt(req.params.id, 10);
      const action = String(req.body?.action ?? "");
      const note = String(req.body?.note ?? "").trim();
      const allowed = ["warned", "suspended", "banned", "dismissed"];

      if (!Number.isFinite(id) || !allowed.includes(action)) {
        res.status(400).json({ error: "Provide a valid report id and action." });
        return;
      }
      // Suspensions and bans are account-level, so they need a written rationale.
      if ((action === "suspended" || action === "banned") && note.length < 8) {
        res.status(400).json({ error: "Add a short note explaining the suspension or ban." });
        return;
      }
      // Only owners and admins may ban; moderators can warn, suspend, or dismiss.
      if (action === "banned" && !roleCan(admin.role, "members.manage")) {
        res.status(403).json({ error: "Only owners and admins can ban accounts." });
        return;
      }

      await adminDb.resolveReport({
        id,
        action: action as "warned",
        note,
        actor: admin.email,
      });
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "moderation",
        action,
        targetType: "report",
        targetId: id,
        targetLabel: `Report #${id}`,
        note,
      });

      res.json({ ok: true, action });
    },
  );

  /* -------------------------- 3. user management ------------------------ */

  app.get("/api/admin/members", requireAdmin, async (req, res) => {
    const result = await adminDb.listMembers({
      search: String(req.query.search ?? ""),
      status: String(req.query.status ?? "all"),
      tier: String(req.query.tier ?? "all"),
      page: parsePositiveInt(req.query.page, 1, 500),
      pageSize: parsePositiveInt(req.query.pageSize, 20, 100),
    });
    res.json(result);
  });

  app.get("/api/admin/members/:id", requireAdmin, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid member id." });
      return;
    }
    const [member, activity] = await Promise.all([
      adminDb.getMember(id),
      adminDb.listMemberActivity(id),
    ]);
    if (!member) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.json({ member, activity });
  });

  app.post(
    "/api/admin/members/:id/action",
    requireAdmin,
    requireCapability("members.manage"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const id = Number.parseInt(req.params.id, 10);
      const action = String(req.body?.action ?? "");
      const note = String(req.body?.note ?? "").trim();
      const allowed = ["force-verify", "warn", "suspend", "ban", "reinstate", "reset-password"];

      if (!Number.isFinite(id) || !allowed.includes(action)) {
        res.status(400).json({ error: "Provide a valid member id and action." });
        return;
      }
      if ((action === "suspend" || action === "ban") && note.length < 8) {
        res.status(400).json({ error: "Add a short note explaining this action." });
        return;
      }

      const member = await adminDb.getMember(id);
      if (!member) {
        res.status(404).json({ error: "Member not found." });
        return;
      }

      switch (action) {
        case "force-verify":
          await adminDb.forceVerifyMember(id);
          break;
        case "warn":
          await adminDb.updateMemberStatus(id, "warned");
          break;
        case "suspend":
          await adminDb.updateMemberStatus(id, "suspended");
          break;
        case "ban":
          await adminDb.updateMemberStatus(id, "banned");
          break;
        case "reinstate":
          await adminDb.updateMemberStatus(id, "active");
          break;
        case "reset-password":
          // Demo behaviour: the real flow would email a one-time reset link.
          break;
      }

      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "members",
        action,
        targetType: "member",
        targetId: id,
        targetLabel: member.name,
        note:
          action === "reset-password"
            ? `${note || "Password reset requested."} A one-time reset link would be emailed to the member.`
            : note,
      });

      res.json({ ok: true, action });
    },
  );

  /* --------------------- 5. content & safety controls ------------------- */

  app.get("/api/admin/safety", requireAdmin, async (_req, res) => {
    const [flags, keywords, broadcasts] = await Promise.all([
      adminDb.listFeatureFlags(),
      adminDb.listBlockedKeywords(),
      adminDb.listBroadcasts(),
    ]);
    res.json({ flags, keywords, broadcasts });
  });

  app.post(
    "/api/admin/safety/flags/:key",
    requireAdmin,
    requireCapability("safety.flags"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const key = String(req.params.key ?? "");
      const enabled = Boolean(req.body?.enabled);
      await adminDb.setFeatureFlag(key, enabled, admin.email);
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "safety",
        action: enabled ? "flag-enabled" : "flag-disabled",
        targetType: "flag",
        targetId: key,
        targetLabel: key,
      });
      res.json({ ok: true, key, enabled });
    },
  );

  app.post(
    "/api/admin/safety/keywords",
    requireAdmin,
    requireCapability("safety.keywords"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const keyword = String(req.body?.keyword ?? "").trim();
      const severity = ["low", "medium", "high"].includes(String(req.body?.severity))
        ? (String(req.body.severity) as "low")
        : "medium";

      if (keyword.length < 2) {
        res.status(400).json({ error: "Enter a keyword of at least 2 characters." });
        return;
      }

      await adminDb.addBlockedKeyword({ keyword, severity, actor: admin.email });
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "safety",
        action: "keyword-added",
        targetType: "keyword",
        targetId: keyword,
        targetLabel: keyword,
        note: `Severity: ${severity}`,
      });
      res.json({ ok: true });
    },
  );

  app.delete(
    "/api/admin/safety/keywords/:id",
    requireAdmin,
    requireCapability("safety.keywords"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid keyword id." });
        return;
      }
      await adminDb.removeBlockedKeyword(id);
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "safety",
        action: "keyword-removed",
        targetType: "keyword",
        targetId: id,
        targetLabel: `Keyword #${id}`,
      });
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/admin/safety/broadcast",
    requireAdmin,
    requireCapability("safety.broadcast"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const title = String(req.body?.title ?? "").trim();
      const body = String(req.body?.body ?? "").trim();
      const segment = ["all", "verified", "unverified", "free", "premium"].includes(
        String(req.body?.segment),
      )
        ? (String(req.body.segment) as "all")
        : "all";

      if (title.length < 3 || body.length < 8) {
        res.status(400).json({ error: "Give the announcement a title and a short message." });
        return;
      }

      const recipientCount = await adminDb.createBroadcast({
        title,
        body,
        segment,
        actor: admin.email,
      });
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "safety",
        action: "broadcast-sent",
        targetType: "segment",
        targetId: segment,
        targetLabel: title,
        note: `${recipientCount} recipients`,
      });
      res.json({ ok: true, recipientCount });
    },
  );

  /* --------------------- 6. subscription management -------------------- */

  app.get("/api/admin/subscriptions", requireAdmin, async (req, res) => {
    const kind = String(req.query.kind ?? "all");
    const allowed = ["grant", "revoke", "refund"];
    const [paid, events] = await Promise.all([
      adminDb.listPaidMembers(),
      adminDb.listSubscriptionEvents(allowed.includes(kind) ? (kind as "grant") : undefined),
    ]);
    res.json({ paidMembers: paid, events });
  });

  app.post(
    "/api/admin/subscriptions/change",
    requireAdmin,
    requireCapability("subscriptions.manage"),
    async (req: AdminRequest, res) => {
      const admin = req.admin!;
      const memberId = Number.parseInt(String(req.body?.memberId ?? ""), 10);
      const kind = String(req.body?.kind ?? "");
      const reason = String(req.body?.reason ?? "").trim();
      const amountCents = Number.parseInt(String(req.body?.amountCents ?? "0"), 10) || 0;
      const allowed = ["grant", "revoke", "refund"];

      if (!Number.isFinite(memberId) || !allowed.includes(kind)) {
        res.status(400).json({ error: "Choose a member and a valid subscription action." });
        return;
      }
      if (reason.length < 8) {
        res.status(400).json({ error: "Add a short reason so the change is auditable." });
        return;
      }
      if (kind === "refund" && amountCents <= 0) {
        res.status(400).json({ error: "Enter the refund amount in cents." });
        return;
      }

      const result = await adminDb.changeSubscription({
        memberId,
        kind: kind as "grant",
        amountCents,
        reason,
        actor: admin.email,
      });
      await adminDb.logAdminAction({
        actorEmail: admin.email,
        actorRole: admin.role,
        module: "subscriptions",
        action: kind,
        targetType: "member",
        targetId: memberId,
        targetLabel: result.memberName,
        note: reason,
      });
      res.json({ ok: true, ...result });
    },
  );

  /* ------------------------------- audit -------------------------------- */

  app.get("/api/admin/audit", requireAdmin, async (_req, res) => {
    const actions = await adminDb.listAdminActions(60);
    res.json({ actions });
  });

  console.log("[admin] dashboard API registered at /api/admin");
}
