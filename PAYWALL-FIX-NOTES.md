# Trufrenz — premium paywall: mount bug and fix

## Bug
The `PremiumPaywall` was rendered **inside the open-conversation branch** of the
main screen's render tree (between `ChatOverflowMenu` / `PlanComposerModal` and
the group info modal). That branch only exists when a chat thread is open, so on
every other screen (Chats list, Friends, Meetups, You) `paywallOpen` flipped to
`true` with nothing mounted to show.

Symptom: pressing "A little more Trufrenz" or the free-tier banner's "See plans"
produced no visible change anywhere except inside an open chat.

## Fix
Moved the `<PremiumPaywall … />` element out of the chat branch and mounted it at
the root render level, immediately after `<IncomingNotificationBanner … />` and
before the animated screen content, so it is always in the tree and only its
`visible` prop decides whether it shows.

File: `app/(tabs)/index.tsx` (mount now ~line 1709).

## Verified in the browser preview
- Free tier shows the small dismissible banner ad above the bottom bar:
  "Go Premium — ad-free, with calls, live map, and up to 100 friends per group."
  with a "See plans" CTA and a dismiss control.
- The You tab premium row renders with a "Free" tier pill and the label
  "A little more Trufrenz — Calls, live map, and read receipts · from ₹49".
- Opening the paywall shows the frosted centered sheet with:
  - CHOOSE A PLAN: Monthly ₹49 / 1 month, Quarterly ₹139 / 3 months (Save ~5%),
    Annual ₹499 / 12 months (Save ~15%).
  - Selecting Annual switches the effective line to "₹42 / month · Save ~15%"
    and reveals the launch-discount card: "₹399 for the first year instead of
    ₹499, for the first 90 days after launch."
  - WHAT CHANGES comparison rows (proposals 10 → unlimited, groups 5 → 100,
    live map, calling, read receipts, advanced filters, priority placement,
    who-requested-you, ads).
  - OFFERS: launch discount, referral perk, seasonal slots.
  - Store-purchase note naming Google Play Billing / Apple In-App Purchase.
- Subscribing to Annual closed the sheet, showed
  "Welcome to Trufrenz Premium. A full year unlocked.", and **removed the ad
  banner**, confirming `entitlements.ads` flips with the tier.

## Notes for later
- Subscription state persists locally under `trufrenz.subscription.v1`
  (`lib/subscription.ts`); the store receipt is the real source of truth.
- `paidTier` (the old demo flag) is gone — every gate now reads
  `entitlementsFor(subscription.tier)`: proposals limit, group cap, live-map
  toggle, read receipts, and the ad banner.
- The group invite path in `components/group-info-modal.tsx` takes a
  `tier`/`paidTier` prop and routes over-cap adds to the paywall instead of
  silently failing.
- Browser harness quirk: React Native Web's `Pressable` only runs `onPress` from
  its `onClick` when `event.altKey === false`; synthetic `dispatchEvent`-based
  clicks are unreliable, so harness clicks are preferred for verification.
