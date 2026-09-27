# Trufrenz — build tracker
## Mute, mark-as-unread, and the circle on the server — DONE (verified)
- **Mute did nothing after a reload, and it only existed on the row.** The flag
  lived in the chat-row state that was never persisted, so a muted conversation
  came back loud on the next launch, and the thread itself had no way to mute.
  Mute now lives in `lib/chat-preferences.ts` (persisted at
  `trufrenz.chat-preferences.v1`), the thread overflow menu toggles it, and the
  in-app message banner checks it before announcing — a muted chat stays silent
  while still collecting its unread count.
- **A conversation could not be marked unread again.** The row now offers
  long-press to mark unread (`markThreadUnread` in `lib/thread-state.ts`), which
  sets a reminder flag that survives the visit. Without that flag, opening the
  thread would immediately mark it read and the badge would vanish as the member
  arrived.
- **Connections were device-local only.** Acceptance, unfriending and declining
  were persisted on the device, so a second device, a reinstall or a cleared
  browser profile lost the entire circle. `member_connections` (migration
  `0008_futuristic_tomas.sql`) plus `server/connectionService.ts` and
  `lib/connection-sync.ts` now hold it server-side: the app reconciles on launch,
  overlays anything still queued locally, pushes state changes and removals with
  the account session, and acknowledges only what the server confirmed.
- **The row gained its own quiet controls.** The long-press gesture, the mute
  toggle and the accessibility labels all describe the current state ("marked
  unread, muted"), so the row is readable to a screen reader as well as to the
  eye.
- **Verification.** `pnpm check` clean, `pnpm lint` 0 errors (27 warnings, none
  new), `pnpm test` 679 passed / 1 skipped across 44 files, `git diff --check`
  clean. Live API test drove sign-in, `GET`/`POST /api/account/connections` and
  confirmed the upsert, the state change and the removal; the browser confirmed
  the persisted mute icon and "marked unread" label survive a reload.

## Connections and conversation threads — DONE (verified)
- **An incoming friend request asked the member to ask again.** The profile
  actions and the discovery row were gated on a *seeded* list, so a request that
  arrived from the other side still read as a stranger to be introduced and the
  prominent button said "Ask for Friendship". In the profile panel the only
  choice was Report or Block. Both now read one graph (`lib/friendship-store.ts`),
  so a pending incoming request offers **Accept**, and accepting opens the chat
  immediately instead of leaving the member to find the row.
- **Nothing about connections survived a reload.** Acceptance, unfriending and
  declining all lived in React state, so every launch put the request back as if
  it had never been answered. The graph is now persisted (`trufrenz.friendships.v1`)
  behind a hydration guard — without the guard the defaults would overwrite the
  stored graph on the first render and silently discard every friendship.
  Declining is also recorded, so a request cannot reappear in discovery.
- **Discovery only offers genuine introductions.** Someone already connected, or
  asked, or declined, is no longer re-presented as a new person to meet, which is
  what kept resurfacing the confusing ask-again prompt.
- **The unread badge never cleared.** It read a seeded number on the chat, so a
  conversation the member had read kept claiming unread messages. `lib/thread-state.ts`
  stores where the member actually stopped, and both the row badge and the count
  derive from it. The badge now clears on the visit that reads the thread.
- **There was no way to find your place in a long thread.** A quiet divider is now
  drawn before the first message the member has not seen, with a count of what
  arrived from the other person. It is frozen for the visit, because marking a
  thread read happens the moment it opens — without that, the divider would
  vanish as the member arrived and a thread shorter than one screen would never
  show one. It is drawn only when something is genuinely new.
- **The safety note repeated on every visit.** It is now shown once per
  conversation and can be dismissed, giving back a row of height on a screen that
  was already tight.
- **Leaving a thread needed the header corner.** A downward drag from the top of
  the conversation now closes it. The decision is pure and tested: a mostly
  horizontal drag, a drag from anywhere below the top of the list (which is how a
  member scrolls back), and a drag while the keyboard is up are all refused, and
  a pull that does not commit springs back.
- **The request row had no accessible names at all.** Accept and decline were
  unlabelled icon buttons; both now describe themselves.
## Chat screen: composer, header actions, dead space — DONE (verified)
- **The composer was under the keyboard again, and the tests were why.** The lift
  was `keyboardHeight - bottomInset`, but the keyboard reports its height from
  the screen edge, so the field landed exactly `inset` points under the keys on
  every notched phone. `tests/chat-layout.test.ts` pinned that arithmetic, so the
  suite certified the bug. The lift now takes the full height with a small
  clearance, the screen cancels the inset while the keyboard is open, and the
  tests assert the property instead of the formula.
- **Call and video buttons were off screen, not missing.** `brandMark` had no
  `flex`, so the header row overflowed and pushed the last controls past the
  right edge. It is now `flex: 1, minWidth: 0`, the buttons are 32pt with tighter
  gaps, and all three fit with room to spare at 1264 of 1280.
- **The status line was clipped out of the header.** Name, verification sentence,
  and availability were three stacked lines in a 45pt bar. The status now shares
  one row with its badge and the redundant sentence is gone.
- **The empty space was the tab bar and ad banner.** They stayed in place inside
  a conversation and reserved a band about 110pt tall below the composer; they
  were hidden only while the keyboard was up. One derived value now hides both
  for as long as a conversation is open. Gap below the composer: 116pt to 6pt.
- **The date moved the wrong way.** The list was bottom-anchored, which pushed it
  down. It now starts under the safety line at 104pt, and anchors to the bottom
  only while the keyboard is open.
- Friends, Meetups, and You each end within 13pt of the tab bar, so there is no
  reserved band on those tabs. Evidence and measurements in `UI-FIX-NOTES.md`.
- Verified: `pnpm check` clean, `pnpm lint` 0 errors, **597 tests passed** (1
  pre-existing skip), `git diff --check` clean, and the chat screen measured in
  the running app at a 1280pt viewport.

## Admin console sign-in, and two honesty fixes — DONE (verified)
- **The dashboard's own printed credentials did not work.** The demo admin is
  created once, on the first boot against an empty database, so moving the domain
  to `trufrenz.net` updated the login hint without touching the existing account.
  The page advertised an address no row answered to, and because the failure
  message is deliberately generic it read as a wrong password. The seed now
  reconciles the demo account on every boot, matching only addresses this repo
  seeded itself; a human-enrolled account is never renamed, and a taken address
  is logged rather than crashing on the unique constraint. A static test now
  pins the login page, the seed and the server's public hint together.
- **The server stopped claiming a transport that did not deliver.** `provider`
  falls back to a default name so the send path always has something to call, so
  an unconfigured deployment reported `msg91` on the dashboard and in the code
  response. It is null unless something actually went out.
- Verified: the advertised credentials now sign in (HTTP 200, dashboard loads),
  the Subscriptions view shows the store readiness and sign-in delivery panels
  honestly reporting "not configured", 593 tests pass (1 pre-existing skip),
  TypeScript clean, lint 0 errors, `git diff --check` clean.

## OTP follow-ups: a resend countdown, and WhatsApp as a phone channel — DONE (verified)
- **The resend button that was missing.** "Send me a code" was a one-shot button.
  A member whose SMS was slow had no recourse but to go back and re-enter their
  number, which spends the challenge and makes them feel they broke something.
  The code step now carries a countdown button that re-arms on its own.
- **The countdown is derived from a deadline, not a decrementing counter.** A
  counter drifts: timers pause when the app is backgrounded, so a member returns
  to a button claiming 30 seconds remain when the real wait is long over. The
  deadline is compared against the clock instead, so a paused timer can never
  make the number wrong. The interval also stops once the wait ends, so an idle
  sign-in screen is not waking up once a second for nothing.
- **A rate limit is now shown as a wait, not a refusal.** The server already
  returned the exact 429 wait; it was being discarded. It now drives the
  countdown, so "Too many codes requested" became "You can ask for another code
  in 120s" with a button that counts it down.
- **WhatsApp added as a phone transport, not a new channel.** WhatsApp codes go
  to the phone number the data model already has, so it is a third adapter in
  `server/sms.ts` rather than a third channel — no column, no migration, and the
  challenge machinery untouched. It needs no DLT registration in India (Meta
  approves an authentication template instead), which makes it the shortest path
  to real codes here and the cheapest at the time of writing.
- **The template name is part of the readiness check on purpose.** Meta refuses
  to deliver an unapproved template, so a token and phone number id without an
  approved template would report the channel ready and then fail every single
  send. Configured means all three values are present.
- **The server no longer claims a transport that did not deliver.** `provider`
  falls back to a default name even when nothing is configured, so returning it
  unconditionally made the server report an "msg91" delivery in demo mode — where
  the only proof of sending was a code on screen. It is null unless something
  actually went out, with a test over that rule.
- **The app names the transport back to the member.** A code sitting in WhatsApp
  while somebody refreshes their SMS inbox is indistinguishable from a code that
  never arrived, so the confirmation says which one carried it.
- **One bug found and fixed by a test, not by review**: the Graph API version was
  read at module import, so the environment variable could not control it and the
  value was frozen for the process lifetime. It is read inside the call now.
- Verified: 588 tests pass (1 pre-existing skip), TypeScript clean, lint 0 errors,
  `git diff --check` clean. The countdown was driven in the browser — it ticked
  47s → 43s, re-armed to an active button, and a real resend issued a new code
  (898125 → 942972) and re-armed the countdown. The API was checked directly:
  the first request returns `retryAfterSeconds: 60`, the immediate second returns
  429 with `rule: "cooldown"`, and demo mode returns `transport: null`.

## Sign-in hardening and the trufrenz.net domain — DONE (verified)

- **Domain settled: trufrenz.net.** Bought and wired through the app, the admin
  dashboard, and these docs. Sign-in codes come from `hello@trufrenz.net`;
  `support@` and `safety@` cover the rest. The welcome screen previously showed
  `support@trufrenz.app`, a domain nobody owned, so that line was fiction until
  this change. The storage key `trufrenz.appearance.v1` was deliberately left
  alone — it is not a domain, and renaming it would silently reset every
  member's saved appearance settings.
- **Fixed: an unlimited "send me a code" button.** This is the SMS-pumping
  attack: point it at numbers you control, trigger thousands of paid messages,
  take a share of the carrier fees, and the app owner pays. Aimed at one
  stranger, it makes the product the harasser and gets the sender ID blocked.
  Both code endpoints are now limited per number (3/hour, 6/day) and per device
  (10/hour, 30/day) with a 60-second cooldown, and 10 wrong codes lock that
  device for 15 minutes. Counted per device, so one guesser cannot lock out
  anyone else. A refused request sends nothing, so it costs nothing.
- **Requests are counted only once they produced something** — a message the
  provider accepted, or a code handed back in demo mode. A provider outage
  therefore cannot burn a member's allowance and lock them out of a code that
  never arrived. Demo mode is counted because the rule is about codes issued,
  not messages billed; excluding it would make the limit untestable without a
  provider and leave a public demo open to unbounded challenge churn.
- **Real SMS delivery.** `server/sms.ts` speaks MSG91 and Twilio. It treats a
  `200` response carrying `type: "error"` as the failed send it is — MSG91
  answers 200 when it declines a message, and reading the status alone would
  report a delivery that never happened. A domestic Indian route now requires an
  approved DLT template id, so a half-configured channel reports itself
  unconfigured instead of ready. Codes are masked in logs.
- **Provider choice made cheap.** The mailer now supports Resend, ZeptoMail, and
  any SMTP provider behind one interface, so switching is an environment
  variable rather than a new integration. `nodemailer` is imported lazily so the
  default HTTP path does not pay for it. Readiness reports the SMTP host, and
  choosing SMTP without one reports the channel unconfigured rather than
  refusing every send.
- **Admin visibility.** The Subscriptions view reports both delivery channels
  and the limits, so "a member cannot get a code" can be answered without
  reading server logs. Presence only — no key or secret is rendered.
- **Verified end to end against the running server:** three codes to one number
  succeed and the fourth is refused with a 3,600-second wait. 556 tests pass
  (22 new for the mailer adapters, 22 for the limit rules, 21 for the SMS
  adapter), lint 0 errors, git diff clean.
- **Still manual, and worth knowing:** the domain's DNS had not propagated at
  the time of this work, and no provider is configured yet, so email remains in
  prototype mode until a key and verified sender are set. SMS needs DLT
  registration, which requires a registered business — not a domain.

## Three subscription suggestions — DONE (verified)

## OTP sign-in: bug fixes and email delivery

- **Fixed: sign-up never created a server-side account.** The old verify route
  deleted the challenge the moment the code matched, but onboarding runs three
  more screens before the account is made — so the final call had nothing to
  work with, the server errored, and the app walked the member backwards to the
  profile step, which reads as "the code was rejected". `finishSignup` also only
  wrote to local storage. Split into `verify-code` (proves without spending) and
  idempotent `complete-signin` (creates at the end).
- **Fixed: challenges were in an in-memory Map.** A restart dropped every
  in-flight sign-in and a second instance could not see them. Moved to the
  `signin_challenges` table with the code stored as a salted SHA-256 hash.
- **Added: email OTP.** New `request-email-otp` route, `server/mailer.ts`
  provider adapter, `lib/email.ts` shared validation, and
  `members.emailVerifiedAt`. Email is now a real recovery identity rather than a
  contact hint — previously a member who lost their phone could not get back in.
- **Added: a channel switcher** on the phone step, with copy that names the
  channel actually used.
- **Added: honest delivery reporting.** The server says whether a code was sent,
  shown as a prototype code, or cannot be delivered at all; the old flow always
  claimed success.
- Verified in the browser: a fresh email sign-up walked all four steps, created
  member 180001 with a verified email, and matched the database. 491 tests pass.


- **Store-localised prices**: `lib/store-prices.ts` reads the store's own quote
  and caches it (12-hour TTL), and the paywall prefers it for the plan price, the
  saving line and the a11y label. Rupee-only extras (effective-per-month, the
  struck-through launch-discount card) are withheld rather than converted when
  the store quotes another currency. `priceMismatch` reports a console price that
  drifted from the published offer, through `console.warn` only. Writing the tests
  caught a real bug: the first micros conversion tested the *type* of
  `priceAmountMicros` instead of the value of `price`, leaking Play's micros as
  ₹49,000,000 beside a ₹49 display.
- **Reinstall auto-restore**: `lib/auto-restore.ts`. The trigger is deliberately
  not "Premium is cached but the server has no receipt" — a reinstall wipes that
  cache, so it could not fire in the case it targets, and it would also fire after
  a legitimate lapse. It triggers on the store reporting a purchase the server has
  not honoured, runs once per session (keyed to the session, so a different account
  on the same device is re-checked), and stays silent when there is nothing to do.
- **Time-boxed admin comps**: `grantComp` / `revokeComp` / `listComps`, stored as
  a receipt with `channel = "comp"` so the grant inherits the expiry, reminder and
  downgrade machinery. Admin gained the two actions, a plan/day picker (1–365) and
  a comps panel. Four bugs were found by running it rather than by reading it:
  excluding comps from `revalidateDueReceipts` (which never contacts a store, so
  it is the only thing that makes a lapse stick) left an expired grant granting
  Premium forever; `markReceiptCancelled` could land a store cancellation on a
  comp; `verifyReceipt` would have accepted a client-supplied `channel: "comp"`
  and minted Premium through the sandbox verifier; and `entitlementForMember`
  re-derived the plan from the synthetic comp product id, silently reporting
  quarterly for an annual grant.
- **Consumer comp view**, found only by browser QA after the tests were green: the
  management sheet read "is this a comp" from the build's own channel, which is
  never `comp`, so a granted member on a Play device saw the store link and the
  cancel button; and the launch reconciliation fetched the entitlement without
  populating `receipts`, leaving the sheet nothing to reason about. Both fixed,
  plus the remaining sale-shaped lines ("No charge", "Ends", "Source:
  Complimentary grant", nothing-to-cancel explainer, withdrawn confirmation,
  granted receipt labels).
- **Docs**: `BILLING-NOTES.md` records all of the above;
  `STORE-LAUNCH-CHECKLIST.md` lists the manual console work.
- **Verified**: `pnpm check` clean, `pnpm lint` 0 errors / 19 warnings (previous
  baseline 20), `pnpm test` 446 passed (1 pre-existing skip), `git diff --check`
  clean; migration generated, reviewed and applied; live e2e of grant → reminder →
  forced expiry → revoke; admin and consumer browser QA; demo data returned to
  1 premium / 13 free with no leftover comp rows or verification events.

## Subscription launch follow-up — DONE (verified)
- **Credential validation, not just presence**: `validateAppleCredentials()` /
  `validatePlayCredentials()` check value *shape* (reverse-DNS bundle id, 10-char
  key id, UUID issuer, complete PEM with both markers, real JSON service account
  with an untruncated key, no file paths pasted by mistake). A malformed value
  now makes a channel `partial` instead of `ready`, and the problems render as
  their own "present but unusable" block in Admin → Subscriptions. Values are
  never echoed back. Writing the test exposed a real bug: the first PEM check
  ignored the closing marker, so a truncated key passed.
- **Store deep links**: `lib/store-links.ts` opens the Play app's page
  (`market://`, web form as fallback) on Android and the system Settings page on
  iOS, since auto-renew is turned off in Settings rather than in the App Store
  listing. The Manage Subscription sheet's store row — which showed an
  open-in-new icon without being tappable — is now an underlined link, with the
  written route shown beside it rather than only after a failure. Renewal
  notices offer a store button only when the notice actually asks the member to
  act: always on expiry, and on renewal only when the body reads as a
  cancellation, so a "nothing you need to do" tip never becomes a cancel prompt.
  11 cases in `tests/store-links.test.ts`.
- **Paywall double-purchase fix**: the buy button's busy state now includes the
  app-owned `purchaseInFlight(purchase)`, so it stays disabled through server
  receipt verification instead of re-enabling the moment the store sheet closes.
- **Docs**: `BILLING-NOTES.md` records the above and the local-preview cookie
  quirk (browsing via `127.0.0.1:8081` breaks OTP sign-in because Metro's proxy
  drops `Set-Cookie`; use the sandbox URL).
- **Verification**: `pnpm check` clean, `pnpm lint` 0 errors, `pnpm test`
  392 passed / 1 pre-existing skip, `git diff --check` clean. Browser QA on the
  public preview confirmed the notice store action and the Manage Subscription
  link with fallback steps; the QA fixture was then reverted and the demo data
  returned to 1 premium / 13 free.

## Store launch readiness, production receipt verification, and renewal reminders — DONE (verified)
- **Launch readiness** (`server/storeReadiness.ts` + `STORE-LAUNCH-CHECKLIST.md`):
  canonical console-ready catalogue (ids, INR prices, billing periods) plus a
  readiness report that treats Play and App Store separately and never claims a
  product is live just because the local catalogue names it. Surfaced in
  Admin → Subscriptions. Creating products, tax, banking, and testers in the two
  consoles stays manual operational work — no store API can do it.
- **Production Apple verification**: Apple's own `@apple/app-store-server-library`
  verifies the signed transaction against bundled Apple root certificates (bundle
  id and revocation included), then the period end is read from the App Store
  Server API and its signed response verified too. A client-decoded payload is no
  longer trusted on its own.
- **Security fix**: an unconfigured store channel is now **rejected**
  (`channel_not_configured`) instead of falling through to the shape-checking
  sandbox verifier. `BILLING_ALLOW_SANDBOX=true` is the only way back in, and
  unset means "refused in production".
- **Renewal reminders**: one notice per member per window at 7 days, 3 days,
  1 day, then expiry, deduplicated by a unique `(receiptId, reminderKind)` row so
  the 6-hourly scan can never repeat itself. Auto-renewing and cancelled plans
  read differently; dates render in IST. Runs inside `runRevalidationPass`, after
  revalidation.
- **Notices**: `NoticeKind` gained `subscription_renewal` / `subscription_expired`;
  migration `0004_cool_firedrake.sql` applied. They appear in the member's
  existing account notice list.
- **Bug fixed**: mysql2 returns inserts as an array, so the old `.insertId` reads
  were always `undefined` and the reminder→notice link was null. `insertIdOf()`
  in `server/db.ts` fixes three call sites; covered by tests.
- Tests added: `renewal-reminders` (14), `billing-verification-mode` (17), plus
  revalidation-job reminder coverage and a de-flaked `plan-cards` preview test.
- `pnpm check` clean · `pnpm lint` 0 errors · `pnpm test` 370 passed (1 skip) ·
  `git diff --check` clean. Reminder scan exercised against the live database
  (send → dedupe → expiry → no repeat), then demo data restored to
  1 premium / 13 free.

## Store billing, revalidation job, and launch reconciliation — DONE (verified)

- **Real store SDK**: `react-native-iap` v16 wired through `lib/store-client.ts`
  (lazy native load, safe fallback) and `lib/store-purchase.ts` (pure receipt
  mapping that refuses unknown products and tokenless purchases).
- **Receipt revalidation job** (`server/revalidationJob.ts`): runs every 6 hours,
  expires receipts the store no longer honours, downgrades the member to free.
  Verified: a lapsed receipt moved the member from premium to free.
- **Launch reconciliation**: the app re-reads the server's entitlement on launch
  instead of trusting its cache forever, so a server-side downgrade reaches the
  member. Offline failures leave the cache untouched.
- **Store purchase path**: store → server verification → unlock, with the paywall
  reporting the app's real purchase state ("Verifying with Trufrenz…").
- **Persisted usage counters** (`trufrenz.usage.v1`) so upgrade nudges stay honest
  across sessions.
- Tests added: `store-purchase`, `revalidation-job`, `usage-persistence`.
- `pnpm check` clean · `pnpm lint` 0 errors · `pnpm test` 338 passed · diff clean.

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
| Demo account | `safety@trufrenz.net` / `Trufrenz#Safety2026` |
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

### Remaining limits (accurate as of this round)
- **Store products must exist before a real charge can happen.** The app now talks
  to Google Play Billing / Apple IAP through `react-native-iap`, but the three
  products (`trufrenz.premium.monthly`, `.quarterly`, `.annual`) still have to be
  created in Play Console and App Store Connect with matching prices.
- **Receipt verification is a sandbox verifier.** `server/billingService.ts`
  validates receipts server-side and is the source of truth for tiers, but it does
  not yet call Google's and Apple's verification APIs, so it cannot detect a
  forged token. That call is the last step before a public launch.
- **SMS OTP is delivered in-app for the demo**, not through a real SMS provider.
- **Camera-based identity verification is a local demo**, not a third-party
  identity provider check.
- **Chat, groups, and meetups run on local demo data**, not a real-time backend.
- **Store cancellation** hands the member to their store account, which is how
  both stores require it; the app cannot cancel on their behalf.

---

## Round: message persistence, sent-request management, quiet hours

The three suggestions from the previous review, plus three real bugs found while
building and testing them.

### What was added

- **Cross-device messages (`lib/message-sync.ts`, `server/messageService.ts`).**
  A member's own outgoing messages are queued on the device, pushed with the
  account session, and merged back on launch, so a message sent on a phone is
  present on a tablet. The `member_messages` table (migration `0009`) enforces a
  unique `(memberId, clientId)` pair, which makes a retry after a lost reply a
  no-op instead of a duplicate. Only the member's own words travel: the route has
  no field for the other person's, and the client refuses to upload an inbound
  row, so no device can rewrite what somebody else said.
- **Sent-request management.** A "WAITING ON THEM" panel lists requests the
  member has sent, with a Withdraw control on each. Incoming requests keep
  Accept/Decline.
- **Quiet Hours (`lib/quiet-hours.ts`).** A persisted, off-by-default window that
  suppresses in-app message banners while leaving messages and unread counts
  updating normally. The settings preview deliberately bypasses the window, so a
  member can still check what a banner looks like at 3am.

### Bugs found and fixed

1. **Withdraw was recording a decline.** The control called
   `applyConnectionChange(id, "declined")`. A decline is a permanent answer to a
   request that *arrived*; withdrawing is the member changing their own mind
   before the other side has seen it. Filing it as a decline would have barred
   that person from the member's suggestions for good. Withdrawal now removes the
   row locally (`withdrawRequest`) and queues a removal, and the server deletes
   the row instead of writing a state.
2. **Declining an incoming request never reached the server.** It edited the local
   graph directly, so the server still held the request and it came back as
   unanswered on the next launch. It now goes through the synced path.
3. **The request gate was hardcoded to `"phone-only"`.** `canRequestFriendship`
   was called with a fixed tier instead of the member's own, so an approved
   member was asked to verify a second time and requests could never be sent —
   the prompt was unsatisfiable. It now reads the session's verification.
4. **An unknown message kind was silently relabelled as text** by the server
   normaliser. A voice note stored as text reads differently on the second device
   from the one the member sent. Both sides now refuse such a row; a missing kind
   still defaults to text.
5. **A midnight bug in the Quiet Hours countdown.** At 03:30 inside a 22→07
   window it reported 1650 minutes remaining instead of 210.
6. **The Quiet Hours preview exemption could leak.** It was held in a ref that the
   notification call cleared on its way through. Any early return between the two
   — a muted chat, most obviously — left it set, so the next genuine message
   sailed past the window. The exemption is now passed in at the two preview call
   sites, and the mute check is pinned ahead of it.
7. **An unknown message kind was still being stored** when the request did not come
   from the app. The normaliser now refuses such a row on both sides; a missing
   kind still defaults to text, which is what older builds send.

### Verification

- `pnpm check` clean, `pnpm lint` 0 errors (29 warnings, none new),
  `pnpm test` **748 passed | 1 skipped** across 48 files, `git diff --check` clean.
- Server contract driven end to end over HTTP with a real member session: push
  two messages, fetch them back, re-push the same id (no duplicate), then send a
  request, withdraw it, and confirm the server returns **no row** and no declined
  state. The temporary member and its rows were deleted afterwards (member count
  back to 17).
- Browser QA at phone width: the waiting panel appears after a request, Withdraw
  removes it and returns the row to "Request" as a fresh introduction, and the
  You tab renders the Quiet Hours control and glass controls without overflow. A
  request sent while the member's tier was raised to ID+selfie went through, which
  is the case the hardcoded gate had been blocking.
- The banner was driven with a quiet window covering the current hour: the preview
  still appears (so the setting can be checked), and a muted chat still refuses a
  preview. The window was returned to its default (off, 22:00–07:00) and the demo
  member's tier was restored to phone-only afterwards.

### Limits worth knowing

- Cross-device persistence covers **the signed-in member's own outgoing
  messages**. There is still no real-time transport, so a message is not yet
  delivered to the other person's device — that is the next service step, not a
  bug in this round.
- The connection graph is still stored per member against seeded directory ids;
  it is not yet a two-sided graph where a request is genuinely sent between two
  accounts.
