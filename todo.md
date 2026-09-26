# Kindred — enhancement tracker

## Implemented

| Feature | Status | Details |
|---|---|---|
| Frosted pull-to-refresh | Complete | Friends discovery and Meetups lists use a screen-level native pull gesture, themed spinner, and frosted loading capsule. Refresh merges/deduplicates the local meetup snapshot; no live server feed is connected. |
| Chat friend profile sheet | Complete | Tap the direct-chat header avatar to see a frosted profile card with photo, age, broad neighborhood only, verification tier, about text, interests, and a safety reminder. Group headers cannot open a member as the group profile. |
| Custom quick replies | Complete | Composer shortcut opens a frosted phrase picker. Choose a preset/custom phrase to insert in the editable composer (never auto-sent), add/delete phrases, normalize duplicate/length rules, and persist locally with AsyncStorage. |

## Verification

- [x] Unit tests cover meetup refresh merging, direct/group profile resolution, quick-reply defaults, normalization, limits, removal, and saved-data parsing.
- [x] `pnpm lint` passes (the Expo CLI emits a non-blocking Node module-type notice).
- [x] `pnpm check` passes.
- [x] `pnpm test` passes: 28 tests pass; 1 pre-existing auth test remains skipped.
- [x] Live preview: tapped Maya’s chat avatar and reviewed the profile modal.
- [x] Live preview: added a custom meetup phrase, selected it, confirmed it populated the editable composer without sending, then removed the test data.
- [x] Friends and Meetups screens reviewed after moving refresh to the screen-level scroller; 390 × 844 mobile screenshot reviewed.
- [ ] Validate the native pull gesture/spinner timing on a physical device; browser preview cannot emit the native pull gesture.

## Production follow-ups

- [ ] Connect pull-to-refresh to an authenticated server/API feed and real meetup persistence.
- [ ] Connect profile details, identity status, report/block actions, and safety controls to server-verified data.
- [ ] Add optional cross-device quick-reply backup; preferences currently persist on this device only.
