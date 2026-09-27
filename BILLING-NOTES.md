# Trufrenz — store billing, entitlement, and upgrade nudges (build notes)

## What this round adds

Three things the previous checkpoint flagged as next steps:

1. **Real store billing path** with server-side receipt verification.
2. **Manage Subscription screen** in the You tab (plan, renewal, cancel, restore).
3. **Soft upgrade nudges** at the natural free-plan limits.

## Files

| File | Role |
|------|------|
| `lib/subscription.ts` | Published prices, entitlements table, feature comparison, gates. Unchanged this round. |
| `lib/subscription-store.ts` | **New.** Store product ids, purchase lifecycle, restore states, usage counters, nudge copy, management-screen copy. |
| `server/billingService.ts` | **New.** Receipt verification (Play Developer API / App Store Server API, plus a sandbox path), entitlement derivation, restore, cancellation, revalidation. |
| `server/accountRoutes.ts` | **Extended.** `/api/account/billing/{products,entitlement,verify,restore,cancel,revalidate}`. |
| `drizzle/schema.ts` | **Extended.** `subscription_receipts` table (migration `0003_exotic_dust.sql`, applied). |
| `components/manage-subscription-modal.tsx` | **New.** The management screen. |
| `components/upgrade-nudge.tsx` | **New.** The soft nudge card used at the limits. |
| `lib/account-client.ts` | **Extended.** `fetchBillingProducts`, `fetchEntitlement`, `verifyPurchase`, `restorePurchases`, `reportStoreCancellation`. |

## Entitlement rule (the important part)

The client **never** grants Premium. It hands the store's receipt to
`POST /api/account/billing/verify`, which:

1. verifies the receipt with the store,
2. writes a row in `subscription_receipts`,
3. updates `members.subscriptionTier`,
4. appends a `subscription_events` row the admin dashboard reads.

`entitlementForMember()` then derives the tier from **unexpired** receipt rows,
so the store is the clock: a lapsed period reports as free even if the cached
column still says premium.

## Verification paths

- **Real:** set `GOOGLE_PLAY_PACKAGE_NAME` + `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`,
  and/or `APPLE_BUNDLE_ID` + `APPLE_ISSUER_ID` + `APPLE_KEY_ID` +
  `APPLE_PRIVATE_KEY`. Play uses `purchases.subscriptionsv2.get`; Apple decodes
  and checks the signed JWS transaction claims.
- **Sandbox:** with no credentials configured, receipts are checked for shape and
  a deterministic transaction id is derived, and every row is written with
  `verifiedBy: "sandbox"` so simulated revenue is never mistaken for real
  revenue. `GET /api/account/billing/products` reports which mode is live.

## Product ids to create before launch

| Plan | Product id | Price |
|------|-----------|-------|
| Monthly | `trufrenz.premium.monthly` | ₹49 |
| Quarterly | `trufrenz.premium.quarterly` | ₹139 |
| Annual | `trufrenz.premium.annual` | ₹499 (₹399 during the 20% launch window) |

## Remaining limits

- No client SDK is bundled (`expo-iap` / `react-native-iap` is not installed), so
  the store sheet itself is still simulated on the client; the **verification,
  entitlement, restore, and cancellation paths are real** and exercise the same
  server code a native build would call.
- Apple signature-chain validation against Apple's root certificates is the one
  added step needed for production; the claim checks are in place.
- A production deployment should move OTP challenges and revalidation to Redis /
  a cron worker rather than an in-memory map and an on-demand route.

## Verified in the browser this round

- **Purchase → entitlement → unlock.** Subscribing on the Quarterly plan from the
  paywall wrote a real receipt row (`productId: trufrenz.premium.quarterly`,
  `status: active`, `verifiedBy: sandbox`, `expiresAt: 2026-12-26`),
  `GET /api/account/billing/entitlement` returned `tier: premium`, the cached
  subscription in `localStorage` updated, and the free-tier ad banner
  disappeared. The paywall's plan cards show the published INR prices
  (Monthly ₹49, Quarterly ₹139, Annual ₹499) and the server reports the annual
  launch charge as ₹399 inside the 90-day window.
- **Manage Subscription.** Opened from the You tab's premium row (now labelled
  "Quarterly · ₹139 / 3 months · manage" with a Premium pill) and rendered
  correctly: "91 days left in this period", "Renews 26 Dec 2026",
  "Auto-renew On", "Verified (sandbox)", one Active receipt, the two other
  plans for switching, Restore purchases, and the cancellation copy naming the
  exact store path.
- **Free tier unchanged.** Resetting the stored subscription to `free` brought
  the ad banner back and restored the paywall route from the same You-tab row,
  so the two tiers stay distinct.

## Test coverage added

`tests/subscription-store.test.ts` — 16 tests over product mapping (plan ↔
product id, unknown ids refused), the annual launch discount, the purchase
lifecycle (pending → verifying → active, and failure keeping the plan id for
retry), button labels per stage, restore (idle / checking / restored / nothing /
failed), `parseUsage` accepting good data and rejecting nonsense, both nudge
builders across hidden / near / at-limit for free and premium, and the summary
lines (`activePlanLine`, `periodLine`, `daysLeftInPeriod`,
`storeManagementLine`).

Suite total: **309 passing, 1 skipped**, with `pnpm check` and `pnpm lint` clean.

## Still open

- `purchaseButtonLabel()` / `purchaseInFlight()` are tested but the paywall still
  drives its own `busy` flag; wiring them is a small follow-up.
- No scheduled revalidation job, so a lapsed renewal is caught when the member
  opens the management screen or restores.
- The proposal counter behind the nudge is live state only, not persisted.

## Real store SDK, revalidation job, and launch reconciliation (verified)

**Store SDK.** `react-native-iap` v16 is installed and driven through
`lib/store-client.ts`, which loads the native module lazily so web previews and
tests never touch it. `lib/store-purchase.ts` holds the pure mapping from a store
purchase to the receipt the server verifies; it refuses a purchase with no usable
token and any product the app does not sell, so a malformed store response can
never become Premium. `app.config.ts` deliberately does **not** list the package
as a config plugin — it autolinks, and listing it fails the Expo build.

**Receipt revalidation job.** `server/revalidationJob.ts` runs every 6 hours
(`BILLING_REVALIDATE_INTERVAL_MS`, 0 disables) and expires receipts the store no
longer honours, downgrading the member to free. It is started on server boot and
logged as `[billing] receipt revalidation every N minutes`. Verified end to end:
a receipt forced to look lapsed was marked `expired` and the member's
`subscriptionTier` moved from `premium` to `free`.

**Launch reconciliation.** The app previously trusted its cached plan forever, so
a server-side downgrade would not reach the member. It now re-reads
`/api/account/billing/entitlement` on launch once a member session is restored and
applies the server's answer, because the server is the source of truth. A failed
request leaves the cache alone, so being offline never silently drops a plan.
Verified: with the cache reading `premium` and the server saying `free`, a reload
dropped the cache to `free` and the free-tier ad banner returned.

**Store purchase path.** Buy → store sheet → receipt verified server-side →
entitlement applied. On web (and any build without the native module) the app
falls back to the clearly-labelled sandbox receipt rather than pretending a real
charge happened. Verified in the browser: the paywall button showed
"Verifying with Trufrenz…" from the app's real purchase state, and the quarterly
purchase unlocked Premium, cleared the ad banner, and wrote a receipt row
(`sandbox:… | trufrenz.premium.quarterly | status=active | by=sandbox`).

**Persisted usage.** `lib/subscription-store.ts` usage counters now survive
reloads through `trufrenz.usage.v1`, which is what makes the near-limit upgrade
nudges honest across sessions. Corrupt or tampered values are treated as fresh
rather than trusted.

**Verification.** `pnpm check` clean, `pnpm lint` 0 errors, `pnpm test`
338 passed (1 pre-existing skip), `git diff --check` clean.

## Store launch readiness, production Apple verification, and renewal reminders (verified)
Three gaps were closed: the store products had no console-ready specification, the
App Store verifier trusted a decoded JWS payload without checking who signed it,
and a lapsed or lapsing subscription was never announced to the member.
**1. Launch readiness** (`server/storeReadiness.ts`, `STORE-LAUNCH-CHECKLIST.md`).
`consoleCatalogue()` renders the three products in the exact shape they must be
typed into each console (ids, INR prices, billing periods, store display names).
`storeReadiness()` reports Play and App Store separately as `not-configured`,
`partial`, or `ready`, listing which environment variables are present by *name*
and what a human still has to do in each console. It never treats the local
catalogue as evidence that a product exists: `readyToSell` stays false with no
credentials, which a test pins explicitly. Surfaced in Admin → Subscriptions as a
readiness panel, the console catalogue, and a reminder log; the endpoint was
verified over HTTP and the payload contains no key material.
**2. Production Apple verification.** `@apple/app-store-server-library` v3.1.0
(Apple's own) now verifies the client's signed transaction against Apple's root
certificates, which ship in `server/apple-roots/` so verification cannot depend on
reaching apple.com. Bundle id and certificate revocation are checked. The
authoritative period end is then read from the **App Store Server API** via
`getTransactionInfo` with our server key, and Apple's signed response is verified
the same way — a decoded client payload is never trusted on its own. A 404 is
reported as a missing purchase; a network failure is reported as retryable rather
than as a bad receipt. `autoRenewStatus` other than `1` is read conservatively as
"will not renew".
**The security fix.** `verifyReceipt` used to fall through to the sandbox verifier
whenever a channel had no credentials. On a deployment holding only Play
credentials, a fabricated App Store receipt would therefore have been accepted —
the sandbox path checks the *shape* of a token, nothing more. An unconfigured
channel is now rejected with `channel_not_configured` unless
`BILLING_ALLOW_SANDBOX=true`, which unset means "allowed outside production,
refused inside it". Tests cover both directions and both channels.
**3. Renewal reminders.** `lib/renewal-reminders.ts` decides *when* and *what*
(pure, so every boundary is exact); `server/subscription-reminders.ts` sends it.
Members are told 7 days, 3 days, and 1 day before a period ends, then once more
after it has ended. The window is chosen closest-first, so a scan that first runs
with two days left sends one "3 days" notice rather than three back-to-back.
Auto-renewing and cancelled plans get deliberately different wording — a courtesy
versus a warning that access really will stop — and dates are rendered in IST,
the market the prices are for. Dedupe is a unique `(receiptId, reminderKind)` row
in `subscription_reminders`, claimed *before* the notice is sent, which makes
delivery exactly-once without a lock. The scan runs inside `runRevalidationPass`
and deliberately *after* revalidation, since revalidation is what expires a
receipt and the scan is what tells the member; a failure in either is contained
so it cannot undo the other. Notices land in the member's existing account notice
list, so `NoticeKind` gained `subscription_renewal` and `subscription_expired`.
**A latent bug found and fixed.** The mysql2 driver resolves `db.insert(...)` to an
*array* whose first element holds the result, so reading `.insertId` straight off
the result silently yields `undefined`. Three call sites stored that value, which
meant the reminder-to-notice link (`noticeId`) was always null. `insertIdOf()` in
`server/db.ts` reads the correct position and is now covered by tests.
**Verification.** `pnpm check` clean, `pnpm lint` 0 errors, `pnpm test`
370 passed (1 pre-existing skip), `git diff --check` clean. Migration
`0004_cool_firedrake.sql` reviewed and applied. The reminder scan was exercised
against the real database: pass 1 sent two notices, pass 2 sent none (dedupe),
a lapsed period produced exactly one expiry notice, and pass 4 repeated nothing —
then the demo receipts were restored to their original expiry and tier split
(1 premium / 13 free), with the reminder rows and test notices removed.
The Admin → Subscriptions readiness panels were confirmed in the browser.
**Still manual, and not claimed otherwise.** Creating the products, prices, tax,
banking, and testers in Play Console and App Store Connect. No API exists for
those, so the dashboard reports `not configured` until the credentials are added.

## Follow-up pass: making the store configuration and the notices actually usable

Four things were tightened after re-reading the three suggestions against the
built code. Each was a real gap rather than polish.

**Readiness now checks whether a credential works, not whether it exists.**
`storeReadiness()` used to compare `presentEnv.length` against the list of
required names, so a deployment with `APPLE_PRIVATE_KEY=nope` reported `ready`
and then failed on the first real purchase — the worst possible moment to find
out. `validateAppleCredentials()` and `validatePlayCredentials()` now check
shape: the bundle id must look like a reverse-DNS id, the key id must be the ten
characters Apple issues, the private key must be a complete PEM block with both
markers, the issuer id must be a UUID, and the Play service account must be JSON
containing `client_email` plus an untruncated `private_key` rather than a file
path pasted by mistake. Failures surface as a `problems` list on each channel and
are rendered in Admin → Subscriptions as its own "present but unusable" block.
The `channels[].state` becomes `partial` in that case, so "credentials ready" is
never claimed for a key that cannot sign. Problems never echo the value.
One bug was caught by writing the test for it: the first version of the PEM check
only looked for the opening marker, so a key cut off mid-paste passed. It now
requires `-----END ... PRIVATE KEY-----` too.

**The store links are now links.** The Manage Subscription sheet and the renewal
notices both told the member to "turn auto-renew off in your store account" — the
sheet even drew an open-in-new icon beside it — but neither was tappable, which
is instruction without a way to act. `lib/store-links.ts` builds the destination
per platform: the Play app's own page via `market://` for Android with the web
form as a second candidate, and the system Settings page for iOS, because
auto-renew is switched off in Settings rather than in the App Store listing. The
section to look for ("Subscriptions") and a written route are shown beside the
link, not only after it fails, since an already-open Settings app needs them too.
On web the link is not offered at all. The notice button is deliberately narrow:
`subscription_expired` always carries it, and `subscription_renewal` only when the
body reads as a cancellation. A courtesy "renews in 3 days — nothing you need to
do" notice must not carry a button to a cancel screen, and the wording test fails
safe to "no button" for any unrecognised body.

**The paywall could take a second payment.** The buy button's busy state came
from a local `busy` flag that only spanned the awaited `onPurchase` call. When
that resolves as soon as the store sheet closes but the server is still verifying
the receipt, the spinner stopped and the button re-enabled before Premium was
granted — inviting a second purchase on a plan already being processed. It now
also reads `purchaseInFlight(purchase)`, the app-owned state that stays true
through `pending`/`verifying`, so the disable window matches the real machine.

**Verification.** `pnpm check` clean, `pnpm lint` 0 errors, `pnpm test`
392 passed (1 pre-existing skip), `git diff --check` clean. New suites:
`tests/store-links.test.ts` (11 cases) and credential validation plus readiness
cases in `tests/billing-verification-mode.test.ts`. Browser QA on the public
preview URL confirmed the cancelled-renewal notice renders its store action and
the Manage Subscription sheet shows the underlined link with the written steps.
The fixture used for that check (a receipt forced to a cancelled 3-day window)
was then reverted and its reminder rows and notices deleted, returning the demo
data to 1 premium / 13 free.

**One local-preview quirk worth recording.** Browsing the app at
`http://127.0.0.1:8081` makes sign-in codes always report as expired. The app
derives its API origin from the hostname, and `127.0.0.1` does not match the
`8081-…` → `3000-…` rewrite, so requests go through Metro's proxy, which does not
forward `Set-Cookie`. The sign-in challenge cookie therefore never reaches the
browser and `verify-otp` has no challenge to match. This is not a defect in the
billing work — the same request succeeds against `127.0.0.1:3000` directly with a
cookie jar, and the flow works normally on the sandbox URL. Use the sandbox URL
when exercising anything that depends on the session cookie.

---

## The next three subscription suggestions

Baseline before this work: `3fba1452`.

### 1. Store-localised prices

The paywall showed rupee figures from the local catalogue even inside a build
that sells through a store, so a member being charged in another currency saw
the wrong number. `lib/store-prices.ts` now reads the store's own quote and
caches it (`trufrenz.store-prices.v1`, 12-hour TTL), and the paywall prefers it
for the plan price, the saving pill and the accessible label. Anything that can
only be expressed in rupees — the effective-per-month split, the struck-through
launch-discount card — is withheld when the store quotes another currency,
rather than converted at a guessed rate. `priceMismatch` reports, through
`console.warn` only, a console price that drifted from the published offer: that
is a configuration error, not something to tell a member about.

Writing the tests found a real bug immediately: the first micros conversion
checked the *type* of `priceAmountMicros` instead of the value of `price`, and
leaked Play's micros through as ₹49,000,000 sitting beside a ₹49 display.
`readAmount` now prefers `price` (already in units) and divides only the micros
fields.

### 2. Reinstall auto-restore

A subscription outlives the app install. After a reinstall the store still knows
about a purchase the server may never have seen, and the member sits on free
while paying, with no reason to suspect the app.

The obvious trigger — "Premium is cached locally but the server has no receipt" —
is wrong twice over: a reinstall wipes that cache, so it could not fire in the
case it targets, and it would also fire after a legitimate lapse (refund, expiry,
exhausted cancellation), nagging someone whose plan really did end.
`lib/auto-restore.ts` therefore triggers on a disagreement between the two
authorities instead: the store reports a purchase the server has not honoured.
It runs once per session (keyed to the session, not the install, so signing into
another account on the same device is checked again), records the attempt before
acting, announces a recovery through the app's ordinary toast, and stays silent
when a check finds nothing to do.

### 3. Time-boxed complimentary Premium

Support cases needed "give this member a month of Premium" without granting
open-ended access. `grantComp` / `revokeComp` / `listComps` store the grant as a
`subscription_receipts` row with `channel = "comp"` and its own synthetic product
id, deliberately reusing the receipt table: entitlement is derived from unexpired
receipts, so a comp inherits the expiry, reminder and downgrade machinery instead
of needing a second copy of it. Admin → Subscriptions gains the two actions, a
plan and day picker (1–365), and a comps panel; the plan and days are validated
client-side so a silently clamped value can never mislead the admin.

Two real bugs surfaced only from running it against the live database:

**Excluding comps from `revalidateDueReceipts` was wrong.** That pass never
contacts a store — it compares `expiresAt` against the clock — so it is the only
thing that makes a lapse stick. Excluding comps left an expired grant granting
Premium forever, and the e2e run showed exactly that: the entitlement read free
while the member row still said premium. Every active receipt is now in scope.

**`markReceiptCancelled` picked the newest receipt by expiry**, which for a member
holding a comp would be the comp. A store-cancellation report would then have
landed on something never bought, while the real subscription was left untouched.
It now excludes the comp channel and returns the current entitlement rather than
assuming free.

A third gap was closed by inspection: the receipt's channel comes from the request
body and is then trusted for the stored entitlement, so a client posting
`channel: "comp"` would have fallen through to the sandbox verifier and minted
itself Premium. `refuseCompChannel` rejects that before any verification runs.

Renewal reminders gained comp wording that never mentions auto-renew, a charge, or
a store account, and `noticeOffersStoreLink` refuses a store button on any comp
notice.

**Two consumer-side regressions were found only by browser QA**, after the tests
were green:

The management sheet derived "is this a comp" from the `channel` prop, which is
what the *build* sells through and is therefore never `comp`. A granted member on
a Play device was shown the store link and the "I cancelled in my store account"
button. It now reads the member's own receipts, taking the latest expiry to match
`entitlementForMember`; the derivation is a tested pure helper
(`activeReceiptOf`, `isComplimentaryChannel`) rather than inline component logic.

That fix revealed a second one behind it: the launch reconciliation fetched the
entitlement but never populated `receipts`, so the list stayed empty until some
later purchase or restore and the sheet had nothing to reason about. It now
records the receipts and the verification mode itself.

And the sheet's remaining lines still assumed a sale, so all of it was made
comp-aware: "Billing" says nothing was charged, "Renews"/"Auto-renew" become
"Ends"/"Source", the cancellation explainer says there is nothing to cancel and
the confirmation flow is withheld, and the receipt rows label a grant as granted
rather than showing a plan-derived label with an "Ends soon" pill.

A related server bug: `entitlementForMember` re-derived the plan from the product
id, and a comp's product id is synthetic, so it silently fell back to quarterly —
a member holding an annual grant was told they had a quarterly plan. It now reads
the row's own `planId`.

**Verification.** `pnpm check` clean, `pnpm lint` 0 errors / 19 warnings (the
previous baseline was 20), `pnpm test` **446 passed** (1 pre-existing skip),
`git diff --check` clean. New suites: `tests/store-prices.test.ts` (29),
`tests/auto-restore.test.ts` (13), plus comp cases in
`tests/renewal-reminders.test.ts`, `tests/store-links.test.ts` and
`tests/billing-verification-mode.test.ts`. `drizzle/0005_supreme_microchip.sql`
was generated, reviewed, applied, and the live e2e confirmed grant → premium →
reminder with gift wording → forced expiry downgrading both the entitlement and
the member row → revoke. Admin browser QA granted and ended a comp through the
real form, and the consumer QA signed in as the granted member and confirmed the
manage sheet shows no store link, no cancel button, "No charge", "Ends",
"Source: Complimentary grant" and the annual plan.

**What remains manual.** Nothing here creates the three products in Play Console
or App Store Connect, and none of it claims they exist. That work needs account
access this environment does not have: the product ids, prices and periods are
listed in `STORE-LAUNCH-CHECKLIST.md` and surfaced in Admin → Subscriptions as
the exact values to enter, along with payments, tax, banking, tester setup, the
Play service-account grant and the App Store Server API key. Until the
credentials are set, both channels report `not configured` and the server refuses
store receipts in production rather than falling back to the sandbox verifier.
