# Kindred — incoming notification banner

## Requested feature

- [x] Add an animated frosted in-app banner for incoming messages and meetup invitations.
- [x] Wire banner press to the relevant chat, support timed/close dismissal, and verify accessibility labels.
- [x] Unit-test message/invite payloads and preview truncation; run lint, TypeScript, and Vitest.
- [x] Inspect mobile preview and save a checkpoint.

## Prototype constraint

The app has no live push/event backend connected yet. The header bell triggers local sample message and meetup-invite notifications for preview; connect a push/event service to receive real inbound notifications.

## Verification

- `pnpm check`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 31 passed, 1 existing test skipped.
- Browser QA: both banner variants displayed; tapping the meetup invite opened Sam's chat with the invite in the thread.
- Mobile viewport: 390×844 inbox screenshot confirmed the bottom navigation is clear of the system-navigation area.
