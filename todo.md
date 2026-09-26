# Kindred — notification and visual refinement

## Completed

- Added a smooth, frosted incoming-message/meetup banner with entrance and exit motion, tap-through, close control, and native left/right PanResponder dismissal.
- Added a shared swipe threshold helper and unit tests for decisive swipes, quick flicks, and short slow drags.
- Extracted a five-second still from the supplied video to `assets/images/kindred-background.jpg` (720×1280 JPEG, ~46 KB) and placed it behind the app at very low opacity with a soft readability wash.
- Slightly clarified glass cards, onboarding/profile/quick-reply/meetup sheets, and the bottom tab surface without changing its safe-area sizing.

## Verification

- `pnpm check`: passed.
- `pnpm lint`: passed (ESLint reports the template's existing package module-type advisory only).
- `pnpm test`: 33 passed, 1 existing test skipped.
- `git diff --check`: passed.
- Captured the phone layout at 390×844; chat content remains legible and the bottom navigation stays clear of the system navigation area.

## Prototype constraint

The app has no live push/event backend connected yet; the header bell triggers local sample notifications for preview. Real inbound alerts still need a push/event service. Phone OTP and identity review also remain demo integrations.
