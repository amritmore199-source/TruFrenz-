# Trufrenz — admin dashboard

## Access

The internal console lives at **`/admin/` on the API server** and is deliberately separate from the member app: its own sign-in, its own dense table-first layout, and no route from the consumer UI.

| | |
|---|---|
| URL | `https://3000-ic648zvdrucwgotw7045l-0006c9f5.sg2.manus.computer/admin/` |
| Sign-in | work email + password + 6-digit authenticator code |
| Demo account | `safety@trufrenz.app` / `Trufrenz#Safety2026` |
| TOTP secret | `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` |

The login screen has a **Use demo code** button that fills the credentials and computes the current TOTP in the browser, so the console can be reviewed without enrolling an authenticator. Member phone OTP credentials cannot be used here.

## Modules

1. **Overview** — member totals, DAU, signups, verified ratio, paid split, open reports, 14-day DAU and signup charts, and the action queue with counts.
2. **Verification queue** — member, submitted name, DOB, **risk score** (≥ 70 highlighted), selfie/ID evidence references, and submit time. Approve grants the verified badge; **reject requires a reason** that is sent back to the member.
3. **Reports & moderation** — sorted by auto-flag then report count, showing subject, type, reason, and the reported content in context. Actions: Warn, Suspend, Ban, Dismiss. Suspend/Ban require a note, and resolving one report closes the subject's sibling reports.
4. **User management** — paginated member table with name/handle, age, home area, verification tier, account status, subscription tier, report count, and join date. Filters for search/status/tier; actions for force verify, warn, suspend, ban, reinstate, and reset password.
5. **Analytics** — eight tile cards (users, DAU, weekly signups, verified share, free vs paid, active groups, avg matches, avg reports) plus mirrored verified/unverified and free/paid charts and calls and groups charts.
6. **Content & safety controls** — six feature flags (calling, live map, meetups, discovery, ID & selfie verification, maintenance mode), the broadcast announcement tool with audience segments, and the blocked keyword list with severities and hit counts.
7. **Subscription management** — paid member list, manual grant/revoke for support cases, and the refund log with amounts, reasons, and the acting staff member.
8. **Audit log** — every dashboard action with timestamp, staff email, module, action, target, and note.

## Implementation

- `server/_core/adminAuth.ts` — **scrypt** password hashing with per-hash salts, **TOTP** with a ±1 step drift window, sha-256 session tokens with a 12-hour TTL, and a `ROLE_CAPABILITIES` map (`owner`/`admin` run everything; `moderator` is limited to review, resolution, and warnings).
- `server/adminRoutes.ts` — the `/api/admin` API, session-guarded on every route except login, with per-action capability checks and audit writes on all mutations.
- `server/adminDb.ts` — data access plus `seedAdminDemoData()`, which is idempotent and seeds 12 members, 5 submissions, 8 reports, 6 flags, 6 keywords, 2 broadcasts, 3 subscription events, 14 days of metrics, and the demo account. The **metrics backfill is checked separately** so an interrupted seed heals on the next boot.
- `admin/index.html`, `admin/styles.css`, `admin/app.js` — the console itself, including hand-built SVG bar and mirrored-series charts with no charting dependency.
- `drizzle/schema.ts` — eleven new admin tables (accounts, sessions, submissions, reports, members, metrics, flags, keywords, broadcasts, subscription events, actions), applied via a generated migration.
- `admin/README.md` — operator guide plus the **hardening checklist** for production (remove the demo code button and compiled secret, enrol real authenticators, delete the seeded account, serve behind SSO/VPN, and swap the seeded metrics for real event data).

## Verification

- `pnpm check`: passed. `pnpm lint`: **0 errors**. `pnpm test`: **162 passed**, 1 pre-existing test skipped.
- New suite `tests/admin-auth.test.ts` (**23 tests**) covers password verification and rejection, salting and determinism, malformed stored values, the RFC 6238 reference vector, code drift windows, wrong/short/non-numeric codes, session hashing and expiry, every role capability, and the seeded credential constants.
- Browser QA against the live console: the login screen rendered alone and the demo button produced a valid code; the overview showed tiles, both bar charts, and queue counts; a high-risk submission was **rejected with a reason** and a second was **approved**, with the queue count dropping each time; a 7-report profile was **banned** with a recorded rationale and its sibling reports closed; user management showed all 12 members with the ban and the verification reflected; analytics rendered 8 tiles and 4 charts; safety showed 6 flags, 6 keywords, and 2 broadcasts; a feature flag was disabled and re-enabled with confirmation; subscriptions showed 3 paid members and 3 log entries; and the audit log listed the sign-in, reject, approve, and ban.

## Still demo-only

- The console authenticates staff against the `admin_accounts` table, but there is no staff management UI yet — new reviewers must be inserted directly.
- Analytics reads a seeded `daily_metrics` series rather than live event data, so the trends are illustrative.
- Moderation actions update the dashboard's own member records; they are not yet wired to a production account service.
- The broadcast tool records the announcement and its audience count but does not deliver push notifications.
