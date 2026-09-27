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
