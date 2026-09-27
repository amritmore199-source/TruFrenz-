# Trufrenz — account service and live analytics (build notes)

Internal notes for the work completed in this session. Not user-facing documentation.

## What was asked

"Complete the suggested step 1 & 3", referring to the two follow-ups recorded after the
admin dashboard was built:

1. **Point the admin modules at real accounts.** Moderation, verification, user management,
   and broadcasts should act on the consumer app's actual accounts rather than on
   dashboard-only rows.
2. **Replace the seeded analytics series with live data.** The dashboard's trends should be
   derived from real recorded product events.

## Architecture

The consumer app previously had no backend: sign-up was a local-only demo and the admin
dashboard read a seeded `members` table. That gap is now closed.

```
app (Expo)                server (Express)                     database (MySQL)
──────────                ────────────────                     ────────────────
lib/account-client.ts ──▶ server/accountRoutes.ts  ──▶ server/accountService.ts ──▶ members
                          /api/account/*                                 ▲         member_sessions
                                                                         │         member_notices
admin dashboard ────────▶ server/adminRoutes.ts ──▶ server/adminDb.ts ───┘         analytics_events
                          /api/admin/*                                              daily_metrics
```

### New files

| File | Purpose |
|---|---|
| `lib/account-access.ts` | Pure access rules: status → capabilities, restriction copy, verification eligibility |
| `lib/analytics-events.ts` | Event catalogue, day helpers, daily rollup, deterministic demo backfill |
| `lib/account-client.ts` | App-side HTTP client for the account API (degrades quietly offline) |
| `server/accountService.ts` | Phone normalisation, OTP, sessions, notices, capability guards, event recording |
| `server/accountRoutes.ts` | `/api/account/*` — sign-in, session, notices, guarded actions, event ingest |
| `tests/account-access.test.ts` | Access-rule coverage |
| `tests/analytics-events.test.ts` | Rollup and event-catalogue coverage |

### Schema added (`drizzle/0002_stormy_the_executioner.sql`)

- `members`: `phoneE164` (unique), `email`, `statusReason`, `statusChangedBy`,
  `statusChangedAt`, `resetTokenHash`, `resetRequestedAt`
- `member_sessions`: `tokenHash` (unique), `expiresAt`, `lastSeenAt`
- `member_notices`: `noticeKind`, `title`, `body`, `actorEmail`, `readAt`
- `analytics_events`: `day`, `eventType`, `memberId`, `groupId`, `metadata`, `occurredAt`

## Enforcement model

The rule is enforced server-side, so it cannot be bypassed by a modified client.

| Account status | Capabilities |
|---|---|
| `active` | everything |
| `warned` | everything (a warning is not a restriction) |
| `suspended` | `browse`, `open-chats` only |
| `banned` | none |

- A suspended or banned account **can still sign in and read the notice** explaining the
  decision. Their *existing* sessions are revoked the moment the decision is made, and every
  mutating route re-checks capabilities — so enforcement does not depend on hiding the session.
- Moderation and user management both call `applyAccountStatusChange()`, so the two modules
  cannot drift apart. It writes status + reason, delivers a notice, and revokes sessions.
- Verification approval/rejection notifies the member. Rejections always carry a reason.
- Broadcasts deliver real `member_notices` rows; the logged recipient count is the number
  actually reached.

## Analytics

`listDailyMetrics()` now derives its rows from `analytics_events` via the pure `rollupRange()`
and upserts them into `daily_metrics` as a cache. `getAnalyticsSources()` exposes live counters
plus the most recent events so the dashboard shows the raw activity behind the numbers.

Event types: `signup`, `session_start`, `friend_request_sent`, `friendship_accepted`,
`message_sent`, `meetup_joined`, `meetup_created`, `group_created`, `group_active`,
`call_started`, `verification_approved`.

## Verified end to end

Run against the live server (not mocks):

- OTP sign-up created account **#30001 "QA Tester"** with a real phone identity.
- Session restore returned `status: active`, full capability list.
- Guarded actions: message `{"ok":true}`; call on free tier → `premium_required`;
  unauthenticated → `401`.
- Admin signed in (password + TOTP), suspended **#30001** through
  `/api/admin/members/:id/action`; the reason was stored and a `suspension` notice written.
- Suspended member then signed in successfully, saw `capabilities: ['browse','open-chats']`
  and the notice *"Your account is suspended"*; message, friend-request, and meetup-join were
  all refused with `account_blocked`-style `403` payloads.
- Live event stream: **275 events** over 14 days across 7 event types.

Also passing: `pnpm check`, `pnpm lint` (0 errors), `pnpm test` (205 passed, 1 skipped).

## Demo credentials and limits

- Dashboard: `safety@trufrenz.net` / `Trufrenz#Safety2026` + TOTP secret
  `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (shown on the dashboard login screen).
- **SMS is not configured.** When `SMS_PROVIDER_KEY` is unset the OTP endpoint returns the code
  as `demoCode` so the flow is reviewable; a live deployment sends it by SMS and never returns it.
- Sign-in challenges are held in memory (single server process). A real deployment moves them to
  Redis or the database.
- Chat threads, meetups, and friendships remain client-side demo data; only accounts, notices,
  and analytics events are persisted.
