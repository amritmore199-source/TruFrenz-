# Kindred — feature and follow-up tracker

## Implemented in this mobile prototype

- [x] Messaging is the initial landing screen; discovery is no longer the primary experience.
- [x] Recent Chats, Unread, Groups, conversation search, friend shortcut row, private-group creation entry, and message composer.
- [x] Direct threads render only for accepted friends (and the seeded invite-only group); message composition updates the local UI.
- [x] Friend Requests live under a compact, contact-list-style Friends tab. Requests can be accepted or quietly dismissed.
- [x] Phone-only members can browse but see a stronger-verification explainer before sending requests; verification, chat-access, and paid map/calling gates have unit tests.
- [x] Mandatory phone OTP screen, optional email recovery field, name/age/interest profile setup, and clear prototype/demo-code disclosure.
- [x] Warm cream surface with blush/sky ambience, soft frosted cards, compact rounded avatars, and a custom four-tab mobile bar.
- [x] Meetups listing with reversible RSVP state; profile availability, discoverability, and approximate-distance controls.
- [x] Safety Center entry, locked Premium preview entry, compact friend suggestions with multi-select interest filters.
- [x] Adult sample portraits bundled locally and displayed as small avatars/list accents rather than dating-style hero cards.
- [x] Quality checks: lint, TypeScript, onboarding and social-access Vitest suites.

## Production integrations / follow-ups

- [ ] Connect phone OTP to a real auth/SMS provider; replace the local six-digit demo validator.
- [ ] Persist accounts, consent, preferences, friendships, messages, meetups, groups, and RSVPs to the server/database; current interaction state is local to this prototype.
- [ ] Add a real selfie/ID-verification provider and signed verification status; until connected, stronger verification remains unavailable to new demo users.
- [ ] Add working report/block flows, evidence capture, report-count auto-hide, and moderation review tooling.
- [ ] Wire meetups to create/join/check-in APIs, venue/location services, and friend invitations.
- [ ] Wire live location, exact-distance/travel-time, and voice/video calling behind a server-enforced paid entitlement.
- [ ] Add a dedicated preferences sheet for age range, gender, radius, interests, availability, and relationship intent; the current Friends tab has nearby/verification/interest chips and You tab exposes privacy/discoverability switches.
- [ ] Persist availability, discovery visibility, distance privacy, and email recovery preferences across sessions.
