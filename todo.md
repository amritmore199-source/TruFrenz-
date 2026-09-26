# Trufrenz — build tracker

Newest work first.

---

# Account service + live analytics

The two gaps left open by the dashboard are now closed: the admin modules act on **real member
accounts**, and the analytics are derived from a **live event stream**.

## What was added

| File | Purpose |
|---|---|
| `lib/account-access.ts` | Status → capability rules, restriction wording, verification eligibility. Pure and tested. |
| `lib/analytics-events.ts` | Event catalogue, day helpers, daily rollup, demo backfill. |
| `lib/account-client.ts` | App-side HTTP client. Degrades quietly when the server is unreachable. |
| `server/accountService.ts` | Phone normalisation, OTP challenges, sessions, notices, capability guards, event recording. |
| `server/accountRoutes.ts` | `/api/account/*` — sign-in, session, notices, guarded actions, event ingest. |
| `tests/account-access.test.ts` | Access-rule coverage. |
| `tests/analytics-events.test.ts` | Rollup and event-catalogue coverage. |

Schema added in `drizzle/0002_stormy_the_executioner.sql`: account identity columns on
`members`, plus `member_sessions`, `member_notices`, and `analytics_events`.

App changes: real OTP sign-in (the demo code placeholder is gone), account status loaded on
session restore, a suspension notice card above the tab bar, a "Notices for you" section in the
profile tab, and capability guards on messages, friend requests, meetup joins, and calls.

## Enforcement model

| Status | Capabilities |
|---|---|
| `active` | everything |
| `warned` | everything — a warning is not a restriction |
| `suspended` | `browse`, `open-chats` |
| `banned` | none |

A restricted member **can still sign in and read the notice** explaining the decision. Their
existing sessions are revoked at the moment the decision is made, and every mutating route
re-checks capabilities server-side — so enforcement never depends on hiding the session or on
the client behaving.

Moderation and user management both route through `applyAccountStatusChange()`, so the two
modules cannot drift apart. Verification outcomes and broadcasts also deliver real notices.

## Verified end to end

Against the live server, not mocks:

- OTP sign-up created a real account through `/api/account/request-otp` + `/verify-otp`.
- The dashboard signed in (password + TOTP) and suspended that account with a reason.
- The suspended member then signed in successfully, saw `capabilities: ['browse','open-chats']`,
  read the notice *"Your account is suspended"*, and had messages, friend requests, and meetup
  joins refused with `account_restricted`.
- Live event stream: **275 events** across 7 types over 14 days.
- `pnpm check` passed, `pnpm lint` **0 errors**, `pnpm test` **205 passed**, 1 pre-existing skip.

Architecture and limits are written up in `ACCOUNT-SERVICE-NOTES.md`.

## Still demo-only

- **SMS is not configured.** When no provider key is set the OTP endpoint returns the code as
  `demoCode` so the flow can be reviewed; a live build sends it by SMS and never returns it.
- Sign-in challenges live in memory (single process). A multi-instance deployment needs Redis.
- Chat threads, meetups, and friendships remain client-side demo data; only accounts, notices,
  and analytics events are persisted.

---

# Admin dashboard

Internal console at `/admin/` on the API server, deliberately separate from the member app: its
own sign-in, its own dense table-first layout, and no route from the consumer UI.

| | |
|---|---|
| URL | `https://3000-ic648zvdrucwgotw7045l-0006c9f5.sg2.manus.computer/admin/` |
| Sign-in | work email + password + 6-digit authenticator code |
| Demo account | `safety@trufrenz.app` / `Trufrenz#Safety2026` |
| TOTP secret | `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` |

The login screen has a **Use demo code** button that fills the credentials and computes the
current TOTP in the browser, so the console can be reviewed without enrolling an authenticator.
Member phone OTP credentials cannot be used here.

## Modules

1. **Overview** — member totals, DAU, signups, verified ratio, paid split, open reports, 14-day
   charts, and the action queue with counts.
2. **Verification queue** — member, submitted name, DOB, **risk score** (≥ 70 highlighted),
   selfie/ID evidence references, and submit time. Approve grants the verified badge; **reject
   requires a reason** that is sent back to the member.
3. **Reports & moderation** — sorted by auto-flag then report count, showing subject, type,
   reason, and the reported content in context. Actions: Warn, Suspend, Ban, Dismiss.
   Suspend/Ban require a note, and resolving one report closes the subject's sibling reports.
4. **User management** — paginated member table with name/handle, age, home area, verification
   tier, account status, subscription tier, report count, and join date. Filters for
   search/status/tier; actions for force verify, warn, suspend, ban, reinstate, reset password.
5. **Analytics** — eight tile cards plus mirrored verified/unverified and free/paid charts, and
   calls and groups charts. Now backed by live events.
6. **Content & safety controls** — six feature flags (calling, live map, meetups, discovery,
   ID & selfie verification, maintenance mode), the broadcast tool with audience segments, and
   the blocked keyword list with severities and hit counts.
7. **Subscription management** — paid member list, manual grant/revoke for support cases, and
   the refund log with amounts, reasons, and the acting staff member.
8. **Audit log** — every dashboard action with timestamp, staff email, module, action, target,
   and note.

## Implementation

- `server/_core/adminAuth.ts` — **scrypt** password hashing with per-hash salts, **TOTP** with a
  ±1 step drift window, sha-256 session tokens with a 12-hour TTL, and a `ROLE_CAPABILITIES` map
  (`owner`/`admin` run everything; `moderator` is limited to review, resolution, and warnings).
- `server/adminRoutes.ts` — the `/api/admin` API, session-guarded on every route except login,
  with per-action capability checks and audit writes on all mutations.
- `server/adminDb.ts` — data access plus `seedAdminDemoData()`, idempotent, seeding members,
  submissions, reports, flags, keywords, broadcasts, subscription events, and the demo account.
- `admin/index.html`, `admin/styles.css`, `admin/app.js` — the console itself, including
  hand-built SVG bar and mirrored-series charts with no charting dependency.
- `admin/README.md` — operator guide plus the production hardening checklist.

## Verified

`tests/admin-auth.test.ts` (**23 tests**) covers password verification and rejection, salting and
determinism, malformed stored values, the RFC 6238 reference vector, code drift windows, wrong or
short codes, session hashing and expiry, every role capability, and the seeded constants.

Browser QA against the live console: login rendered alone and the demo button produced a valid
code; the overview showed tiles, charts, and queue counts; a high-risk submission was **rejected
with a reason** and another **approved**; a 7-report profile was **banned** with a recorded
rationale and its sibling reports closed; user management showed all members; analytics rendered
8 tiles and 4 charts; safety showed flags, keywords, and broadcasts; a feature flag was toggled
and restored; subscriptions and the audit log both listed their records.

---

# Consumer app

- **Welcome screen** — drifting bubbles, ambient loop (off by default, with a speaker toggle),
  glass panel, Sign up / Log in / guest, three-slide intro carousel, terms gate, company details.
- **Onboarding** — phone OTP → name, DOB (age locks from it), locality, interests → photo →
  summary. Signing in again restores the account's real name and details.
- **Profile** — multi-photo grid, bio, interests, languages, "looking for" tags, verification
  badge, availability, privacy controls. View mode has a photo carousel, shared interests, and
  relationship-gated actions.
- **Chat** — availability dots, swipe-to-mute/archive, empty states, header with call/video/
  profile, typing indicators, read receipts (togglable), reactions, attachments, structured plan
  cards, polls, quick replies, and an overflow menu with unfriend/report/block.
- **Groups** — group info, member roles, invite-only adds, admin controls, in-chat polls.
- **Meetups** — invites, public venue picker, RSVPs, follow-ups from chats.
- **Calling** — premium-gated 1:1 and group entry points, incoming call screen.
- **Appearance** — user-controlled frosted-glass opacity and wallpaper visibility, persisted.
- **Safety** — onboarding carousel, report/block, approximate location, verification tiers.
