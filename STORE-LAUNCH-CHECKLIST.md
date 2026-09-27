# Trufrenz — Store Launch Checklist

Everything in this document has to be done by a human with access to
**Google Play Console** and **App Store Connect**. No tool in this repository can
do it, because neither console exposes product creation to an API — Play's
`androidpublisher` API can read and acknowledge purchases but cannot create
products, and App Store Connect has no product-creation endpoint at all.

The code side is already done and verified. Read
[What the code already guarantees](#what-the-code-already-guarantees) first, then
work through the two console sections.

---

## The three products

Both stores must use **exactly** these identifiers. They are the single source of
truth in `lib/subscription-store.ts`; if a console id differs by even a
character, `planIdForProductId()` returns `null` and the purchase is rejected
with `unknown_product` rather than silently granted.

| Plan | Product id | India price | Billing period | Auto-renewing |
|------|-----------|-------------|----------------|---------------|
| Monthly | `trufrenz.premium.monthly` | ₹49 | 1 month | Yes |
| Quarterly | `trufrenz.premium.quarterly` | ₹139 | 3 months | Yes |
| Annual | `trufrenz.premium.annual` | ₹499 | 12 months | Yes |

Store display name for all three: **Trufrenz Premium — _Plan_**

The paywall also offers a 20% launch discount on the annual plan (₹399 for early
adopters). Configure it as an **offer** on the annual product, not as a second
product: the app resolves the plan from the product id, so a separate discounted
product id would be rejected.

> **Status as of this build:** none of these products exist in either console.
> The local catalogue is a specification, not evidence that a store has it. The
> dashboard reports each channel as `not configured` until the corresponding
> credentials exist, and it will not claim otherwise.

---

## 1. Google Play

### Products

- [ ] Play Console → your app → **Monetize → Products → Subscriptions**
- [ ] Create a subscription with id `trufrenz.premium.monthly`
- [ ] Add a base plan (auto-renewing, 1 month, ₹49), then activate it
- [ ] Repeat for `trufrenz.premium.quarterly` (3 months, ₹139) and
      `trufrenz.premium.annual` (12 months, ₹499)
- [ ] On the annual base plan, add the 20% launch offer for the early-adopter window

### Money and accounts

- [ ] Complete the **payments profile**, bank account, and tax details.
      Play will not bill anyone until this is approved, which can take days —
      start it first.
- [ ] Set the app's price/tax settings for India (INR)

### Server access for verification

- [ ] Google Cloud Console → create a service account for Play verification
- [ ] Create a JSON key for it and copy the whole JSON into
      `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- [ ] Play Console → **Users and permissions** → invite the service account email
- [ ] Grant it **View financial data** plus the app-level release permissions
      (the app must be selected, or the API returns 403 for every call)
- [ ] Set `GOOGLE_PLAY_PACKAGE_NAME` to the application id (`app.config.ts` →
      `android.package`)

### Release and testing

- [ ] Build a signed AAB and upload it to a **closed track**
- [ ] Products only become purchasable against an uploaded build, so create them
      after the first upload
- [ ] Add **licence testers** under Setup → Licence testing
- [ ] Buy each of the three plans in test mode and confirm it reaches
      Manage Subscription with the right period end

---

## 2. App Store

### Products

- [ ] App Store Connect → your app → **Subscriptions**
- [ ] Create a **subscription group** (e.g. "Trufrenz Premium") so members can
      switch plans without being charged twice
- [ ] Add `trufrenz.premium.monthly` — 1 month, ₹49
- [ ] Add `trufrenz.premium.quarterly` — 3 months, ₹139
- [ ] Add `trufrenz.premium.annual` — 12 months, ₹499
- [ ] Add the **20% launch offer** on the annual subscription
- [ ] Fill in the localisation, review screenshot, and review notes for each one
      (missing metadata is the most common rejection)

### Money and accounts

- [ ] Complete **Agreements, Tax, and Banking**. Payouts stay blocked until the
      Paid Applications agreement is active.
- [ ] Set the India price tier so the store charges the intended rupee amounts

### Server access for verification

This build verifies App Store receipts in two stages: the signed transaction is
checked against **Apple's own root certificates** (bundled in `server/apple-roots/`),
and the authoritative subscription period is then read from the **App Store
Server API**.

- [ ] App Store Connect → **Users and Access → Integrations → In-App Purchase key**
- [ ] Generate a key, note the **Key ID** and **Issuer ID**, and download the
      `.p8` file (Apple lets you download it once)
- [ ] Set `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, and `APPLE_PRIVATE_KEY` (the full
      `.p8` contents, newlines included)
- [ ] Set `APPLE_BUNDLE_ID` to the iOS bundle identifier from `app.config.ts`
- [ ] Leave `APPLE_ENVIRONMENT` unset for production, or set it to `sandbox` only
      while testing against a Sandbox Apple ID

### Release and testing

- [ ] Create a **Sandbox Apple ID** (Users and Access → Sandbox → Testers)
- [ ] On a real device, sign out of the App Store and buy each plan with the
      sandbox account
- [ ] Confirm each purchase reaches Manage Subscription with the right expiry

---

## 3. Server configuration

Set these once both consoles are finished. The dashboard's **Store launch
readiness** panel reads the same variables and will flip each channel to
`credentials ready`.

| Variable | Required by | Notes |
|----------|-------------|-------|
| `GOOGLE_PLAY_PACKAGE_NAME` | Play | The Android application id |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play | Full service-account JSON, one line |
| `APPLE_BUNDLE_ID` | App Store | The iOS bundle identifier |
| `APPLE_ISSUER_ID` | App Store | From the In-App Purchase key page |
| `APPLE_KEY_ID` | App Store | From the same page |
| `APPLE_PRIVATE_KEY` | App Store | `.p8` contents; `\n` escapes are converted |
| `APPLE_ENVIRONMENT` | App Store | Omit for production; `sandbox` for testing |
| `BILLING_ALLOW_SANDBOX` | Both | Must be `false` (or unset) in production |
| `BILLING_REVALIDATE_INTERVAL_MS` | Both | Optional; defaults to every 6 hours, `0` disables |

### Before you flip to production

- [ ] Confirm `BILLING_ALLOW_SANDBOX` is **not** `true` on the production server.
      Unset already means "refused in production", but set it to `false`
      explicitly so a future change of `NODE_ENV` cannot reopen the door.
- [ ] Verify both channels report `credentials ready` in Admin → Subscriptions
- [ ] Buy one real subscription on each store and confirm `verifiedBy` reads
      `store` (not `sandbox`) on the receipt
- [ ] Check the Subscription & refund log shows the purchase with the
      `play-store` / `app-store` actor

---

## What the code already guarantees

- **The client never grants Premium.** A purchase is posted to
  `/api/account/billing/verify`, and the tier changes only if a store vouches for
  the receipt.
- **Play receipts** are checked with `purchases.subscriptionsv2.get` via a
  service-account OAuth exchange. The expiry comes from Play, not from the app.
- **App Store receipts** are checked in two steps: the JWS signature chain is
  validated against Apple's roots with Apple's own library (bundle id and
  revocation included), then the period end is read back from the App Store
  Server API. A client-supplied decoded payload is never trusted on its own.
- **An unconfigured store is refused, not sandboxed.** If a deployment can verify
  Play but not the App Store, an App Store receipt is rejected with
  `channel_not_configured` instead of falling through to the shape-checking
  sandbox verifier.
- **Receipts lapse on the store's clock.** A six-hourly job expires receipts the
  store no longer honours and downgrades the member to free.
- **Renewal reminders are exactly-once.** Members are told 7 days, 3 days, and
  1 day before a period ends, and once more when it has ended. A unique
  `(receiptId, reminderKind)` row makes a repeated scan a no-op, so the six-hourly
  schedule cannot spam anyone.

### The one thing that stays manual

Product creation, pricing, tax, banking, and tester setup in both consoles. There
is no API for these, and no amount of code changes that. Until they are done, the
dashboard will honestly report `not configured` and the app will refuse purchases
rather than pretend they succeeded.