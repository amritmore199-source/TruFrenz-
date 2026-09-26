# Kindred — feature and follow-up tracker

## Implemented in this mobile prototype

- [x] Messaging is the initial landing screen; discovery is not the primary experience.
- [x] Chats, Unread and Groups filters, conversation search, friend shortcuts, private-group entry, and a local message composer.
- [x] Direct threads render only for accepted friends; message composition updates local UI and shows sent/read receipts.
- [x] Short typing indicator when opening a thread or after sending a message (prototype UI cue, not a remote-presence signal).
- [x] Frosted conversation action sheet for sharing an approximate neighborhood only and preparing an editable meetup-invite draft; no live pin or automatic message send.
- [x] Smooth cross-tab fade/vertical easing, with a brief frosted skeleton handoff only between Chats and Meetups.
- [x] Friend requests in a compact contacts-style Friends tab; accept or dismiss actions.
- [x] Phone-only members can browse but need stronger verification before outbound requests; access-control gates have tests.
- [x] Standalone phone OTP demo, optional recovery email, profile setup, and prototype-only disclosure.
- [x] Optional selfie identity flow: disclosure, explicit camera rationale, permission request, capture framing, local scan animation, success feedback, retake, and denied/unsupported fallback.
- [x] Selfie capture is not treated as verification: no upload or badge change; only a future provider confirmation may grant the stronger badge.
- [x] Premium frosted cards, warm blush/sky ambient background, compact profile list, safety controls, meetup RSVP state, and custom four-tab navigation.
- [x] Unit tests cover verification gate, chat/meetup transition routing, camera-permission/capture gating, provider-only badge state, and message receipts.

## Verification notes

- [x] Lint, TypeScript, and Vitest pass: 13 tests passed, 1 pre-existing test skipped.
- [x] Live preview checked for Chats↔Meetups navigation, chat receipts/typing, share menu, and editable invite draft.
- [x] Live preview checked for signup, profile selfie entry, disclosure, and in-app camera-permission rationale.
- [ ] A real device/browser camera grant, capture, and native system-permission prompt still need on-device validation; automated preview did not grant camera access.

## Production integrations / follow-ups

- [ ] Connect phone OTP to a real auth/SMS provider; replace the local six-digit demo validator.
- [ ] Persist accounts, consent, preferences, friendships, messages, meetups, groups, and RSVPs to the server/database; current interaction state is local to this prototype.
- [ ] Add a real selfie/ID-verification provider and signed verification status; keep provider decision as the only way to assign stronger verification.
- [ ] Add working report/block flows, evidence capture, report-count auto-hide, and moderation review tooling.
- [ ] Wire meetups to create/join/check-in APIs, venue/location services, and friend invitations.
- [ ] Connect typing, delivered/read receipts, live location, and voice/video calls to authorized backend services; the current typing/read states are local illustrative UI.
- [ ] Wire paid features behind server-enforced entitlement.
- [ ] Add a dedicated preferences sheet for age range, gender, radius, interests, availability, and relationship intent.
- [ ] Persist availability, discovery visibility, distance privacy, and email recovery preferences across sessions.
