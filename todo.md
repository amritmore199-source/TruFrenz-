# Trufrenz — build tracker

## Store billing, Manage Subscription, and upgrade nudges (latest)

- [x] Store product catalogue with the three published INR prices and the annual
      launch charge (₹399 inside the 90-day window, ₹499 after).
- [x] Server-side receipt verification: `subscription_receipts` table, migration
      `0003_exotic_dust.sql` applied, `server/billingService.ts`, and six billing
      routes on `/api/account/billing/*`. The client never grants Premium — the
      tier is derived from unexpired verified receipts, so a lapsed period reads
      as free even if the cached column still says premium.
- [x] Purchase lifecycle, restore states, and usage counters as pure logic in
      `lib/subscription-store.ts`.
- [x] Manage Subscription screen (`components/manage-subscription-modal.tsx`),
      opened from the You-tab premium row: active plan, renewal, auto-renew,
      receipt verification, receipts on file, restore, plan switching, and
      cancellation that names the member's own store account.
- [x] Soft upgrade nudges (`components/upgrade-nudge.tsx`) at the proposal limit
      and the free group cap, dismissible and never repeating in a session.
- [x] `Subscription` type extended with `autoRenewing`, `cancelledAt`,
      `lastVerifiedAt`, `verifiedBy`; `parseSubscription` still falls back to
      free on anything malformed.
- [x] 16 new tests in `tests/subscription-store.test.ts`.

Verified in the browser: a real purchase wrote a receipt
(`trufrenz.premium.quarterly`, `verifiedBy: sandbox`, expires 26 Dec 2026),
entitlement returned premium, and the ad banner disappeared; the management
screen showed "91 days left in this period" and the Active receipt; the group
capacity nudge appeared at "2 seats left in this circle" and dismissed cleanly;
resetting to free restored the ad banner and the paywall route.

Checks: `pnpm check` 0 errors, `pnpm lint` 0 errors (22 pre-existing warnings),
`pnpm test` 309 passing / 1 skipped, `git diff --check` clean.

Still open: no store SDK bundled (verification paths are real, the client token
is simulated and recorded as `sandbox`); the paywall still uses its own busy flag
rather than the tested `purchaseButtonLabel()`; no scheduled receipt
revalidation job; the proposal counter behind the nudge is not persisted.

## 1. Swipe-right to archive

`components/swipeable-chat-row.tsx` now answers both directions:

| Gesture | Result |
|---|---|
| Swipe left | Reveals the compact mute / archive corner buttons |
| Swipe right | Archives the conversation (or restores it from the Archive list) |

The direction decision lives in `lib/chat-layout.ts` as `resolveChatRowSwipe`, so a small
sideways drift during a vertical scroll returns `null` and can never archive a row by accident.
Archiving deliberately asks for more travel than the reversible reveal.

The archive panel behind the row is **decorative**: `aria-hidden`, `accessibilityElementsHidden`,
and `importantForAccessibility="no-hide-descendants"` keep its label out of the accessibility
tree, because the row's own label and the corner buttons already carry the actions. Verified in
the browser: 4 panel labels present, 0 exposed.

## 2. Attachment preview above the composer

Photos and voice notes are now held for review before they are sent.

| File | Purpose |
|---|---|
| `lib/attachment-preview.ts` | Which kinds need review, the pending model, size/length formatting, draft conversion. |
| `components/attachment-preview-strip.tsx` | The frosted strip above the input bar. |
| `tests/attachment-preview.test.ts` | 20 tests. |

Picking a photo, or pressing **Preview** after recording a voice note, parks the attachment in the
strip. The input placeholder becomes "Add a caption…", the send button turns active, and the
message goes out as `label — caption`. Place pins still send straight away: the member already
chose a named public venue, so there is nothing to confirm.

The waiting attachment is cleared on back, sign-out, and menu navigation, so a stale preview can
never greet the next conversation. `closeThread` and `clearPendingAttachment` are stable
callbacks so the hardware-back effect does not re-subscribe on every render.

## 3. Profile card legibility

The tall frosted profile cards had their backdrop blur raised to **12.8px** (from 8px) so the
name, badges, and bio stay crisp over the detailed wallpaper. Verified live: the profile card
reports `saturate(1.8) blur(12.8px)`.

## Verification

`pnpm check` clean, `pnpm lint` 0 errors (9 pre-existing unused-symbol warnings), **243 tests
passing** across 24 files, `git diff --check` clean.

Browser-verified end to end: voice-note record → **Preview** → strip shows "Voice note ready to
send · Length 9s" → send → the bubble appears with its waveform, "9s", and a Sent receipt, and
the composer resets.

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

---

# UI fixes — chat rows, keyboard, frosted glass

Three issues reported from a real Android device screenshot of the You tab.

## 1. Mute / Archive took too much of the chat row

`components/swipeable-chat-row.tsx` — the two actions were full-height and 75pt
wide each, so 150pt of a phone row was consumed.

Now each is a compact 46x29 icon-only button in the row's trailing corners, and
they only appear once the row has slid: their opacity follows the slide, so the
translucent row never shows them through early. Reveal width 150 to 100, commit
threshold 84 to 55. Accessible labels still spell out the action.

## 2. Composer hid behind the keyboard

Android runs edge-to-edge here, so the window is not resized when the keyboard
opens. The screen now tracks the keyboard via `Keyboard` listeners and lifts the
conversation by that height, discounting the bottom inset the root SafeAreaView
already applies. The bottom tab bar steps aside while a chat keyboard is open, so
the composer sits directly on the keys.

## 3. White patches inside the frosted cards

Root cause: the frosted surfaces had **no backdrop blur at all** — just a
translucent white fill. With ~20% of the wallpaper showing through and nothing to
diffuse it, the photo's bright areas appeared as hard-edged white blobs inside
every card.

`Frosted` now paints a real `BlurView` layer (intensity 38) between the card and
its tint, and the conversation rows do the same (intensity 34). The member's
glass-opacity setting still drives the tint.

Measured on the same region as the report: the reference screenshot had 11 abrupt
brightness steps with a worst-case swing of -28.2 levels inside the cards; the
fixed build has none across the card interiors.

## Verification

`lib/chat-layout.ts` holds the composer-lift, tab-bar, and row-sizing maths with
10 new unit tests. `pnpm check` clean, `pnpm lint` 0 errors, `pnpm test`
**216 passed** (1 pre-existing skip). Browser QA on the live preview confirmed the
cards render evenly and the rows no longer leak the action buttons. Diagnostics
are written up in `UI-FIX-NOTES.md`.

## Subscription tiers, INR pricing, and payment UI (done)

- `lib/subscription.ts` holds the single source of truth: the Free/Premium tier
  split, the three INR plans (Monthly ₹49, Quarterly ₹139, Annual ₹499), the
  derived effective-per-month and savings figures, the 20% launch discount on
  Annual, the referral perk, the seasonal-offer slots, and `entitlementsFor()`
  which every gate in the app reads.
- `components/premium-paywall.tsx` is the frosted centered paywall: plan
  selection, the WHAT CHANGES comparison table, the OFFERS cards, and the
  Google Play Billing / Apple In-App Purchase purchase note. It confirms the
  charge before the tier changes and explains that the store account is the
  source of truth.
- Gates wired to real entitlements instead of the old demo `paidTier` flag:
  hangout/meetup proposals (first 10 free), group size (5 free, 100 premium),
  live map and exact distance, voice/video calling, read receipts, and the
  small dismissible banner ad that free members see above the bottom bar.
- Group invites route over-cap adds to the paywall instead of failing silently
  (`components/group-info-modal.tsx` takes the tier and an upgrade callback).
- Subscription state persists locally under `trufrenz.subscription.v1`.

### Bug found and fixed during verification
`<PremiumPaywall />` had been mounted *inside the open-conversation branch* of
the render tree, so it only existed while a chat thread was open and nothing
appeared when a gate fired from any other screen. It now mounts at the root
render level next to the incoming-notification banner. Details in
`PAYWALL-FIX-NOTES.md`.

### Verified in the browser preview
- Free tier shows the banner ad with a working "See plans" CTA and dismiss.
- The You tab premium row shows the Free pill; after subscribing it reads
  "Trufrenz Premium — active" with a Premium pill.
- The paywall renders all three INR plans, switches the effective line and
  reveals the launch-discount card when Annual is selected, and the purchase
  toast confirms "A full year unlocked." and removes the ad banner.
- Pressing Call on the free tier shows "Calls are part of Trufrenz Premium.
  Upgrade to call your friends." rather than failing silently.
- `pnpm check`, `pnpm lint` (0 errors), and `pnpm test` (293 passed, 1 skipped)
  all pass; `git diff --check` is clean.

### Still prototype-level
- Purchases are simulated locally: there is no Google Play Billing / StoreKit
  integration, no receipt validation endpoint, and no server-side tier record,
  so a real launch needs the store products created and receipts verified
  server-side before entitlements are granted.
