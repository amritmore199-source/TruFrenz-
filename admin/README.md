# Trufrenz Admin — internal dashboard

Internal console for the Trufrenz team. It is deliberately **not** part of the
consumer app: it lives at `/admin` on the API server, uses its own sign-in, and
uses a dense table-first layout so staff never confuse it with the member
experience.

> Members can never reach this console. It requires an `admin_accounts` row plus
> a password and a TOTP code; member phone OTP credentials are rejected.

## Access

| | |
|---|---|
| URL | `/admin/` on the API server (e.g. `https://<api-host>/admin/`) |
| Sign-in | work email + password + 6-digit authenticator code |
| Seeded demo account | `safety@trufrenz.app` / `Trufrenz#Safety2026` |
| Seeded TOTP secret | `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` |

The demo account is created on first boot so the console is usable before a real
authenticator is enrolled. **Replace it before any production deployment** — see
"Hardening before production" below.

## Modules

1. **Overview** — total members, DAU, signups, verified ratio, paid split, open
   reports, plus 14-day DAU and signup charts and the action queue.
2. **Verification queue** — pending ID/selfie submissions with member, submitted
   name, date of birth, risk score, and evidence references. Approve grants the
   verified badge; **reject requires a reason** which is sent back to the member.
   High-risk submissions (score ≥ 70) are highlighted.
3. **Reports & moderation** — auto-flagged and most-reported content first, with
   the reported content shown in context. Actions: Warn, Suspend, Ban, Dismiss.
   Suspend and Ban require a recorded note; resolving a subject's report also
   closes its sibling reports.
4. **User management** — searchable, paginated member table (name, age, area,
   verification tier, account status, subscription tier, report count, join
   date). Actions: force verify, warn, suspend, ban, reinstate, reset password.
5. **Analytics** — tile cards for users, DAU, weekly signups, verified share,
   free/paid split, active groups, calls, average matches and reports per user,
   with mirrored verified/unverified and free/paid trend charts plus calls and
   groups charts.
6. **Content & safety controls** — feature flags (calling, map, meetups,
   discovery, ID & selfie verification, maintenance mode), the broadcast
   announcement tool with audience segments, and the blocked keyword list that
   auto-flags chat and profile content.
7. **Subscription management** — paid member list, manual grant/revoke for
   support cases, and the refund log with amounts and reasons.
8. **Audit log** — every dashboard action with staff, module, action, target, and
   note.

## Architecture

| Path | Purpose |
|---|---|
| `admin/index.html` | Dashboard shell: login screen, sidebar, module containers |
| `admin/styles.css` | Dense internal-tool styling, distinct from the consumer app |
| `admin/app.js` | Client logic: auth, all modules, dialogs, SVG charts |
| `server/adminRoutes.ts` | HTTP API under `/api/admin`, session-guarded |
| `server/adminDb.ts` | Data access, demo dataset seeding, audit writes |
| `server/_core/adminAuth.ts` | scrypt passwords, TOTP, sessions, role capabilities |
| `drizzle/schema.ts` | Admin tables (accounts, sessions, submissions, reports, members, metrics, flags, keywords, broadcasts, subscription events, actions) |
| `tests/admin-auth.test.ts` | Unit coverage for hashing, TOTP, sessions, and roles |

Role capabilities live in `ROLE_CAPABILITIES` in `server/_core/adminAuth.ts`:
`owner` and `admin` can run every module; `moderator` is limited to verification
review, report resolution, and warnings.

### Demo dataset

`seedAdminDemoData()` runs once on boot and is idempotent. It creates 12 members,
5 verification submissions, 8 reports, 6 feature flags, 6 blocked keywords,
2 broadcasts, 3 subscription events, 14 days of daily metrics, and the demo
admin account. The daily-metrics backfill is checked separately from the main
dataset, so a seed interrupted part-way heals itself on the next boot.

## Hardening before production

The demo scaffolding exists to make the console reviewable today. Before real
staff use it:

1. Remove the "Use demo code" button and the compiled `DEMO_SECRET` from
   `admin/app.js`, along with the seeded-credentials `<details>` block in
   `admin/index.html`.
2. Enrol real authenticator secrets per staff member and delete the seeded
   `safety@trufrenz.app` row (or rotate its password and secret).
3. Serve `/admin` over HTTPS only, behind your SSO or VPN, and restrict by IP if
   your threat model requires it.
4. Replace the static `admin/` directory with a built, authenticated front-end if
   the team grows; the API in `server/adminRoutes.ts` is already the contract.
5. Point the analytics module at real event data rather than the seeded
   `daily_metrics` series.

## Verifying changes

```bash
pnpm check   # TypeScript
pnpm lint    # ESLint
pnpm test    # Vitest, including tests/admin-auth.test.ts
```

Then open `/admin/`, sign in with the demo credentials, and exercise the module
you changed. Every mutating action should appear in the audit log.
