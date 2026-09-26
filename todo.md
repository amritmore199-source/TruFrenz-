# Trufrenz — profile section, welcome screen, and glass UI

## Profile section

The profile experience now has two modes: **Edit** (your own profile) and **View** (someone else's), both built as frosted glass cards with 20px rounded corners that match the app-wide surface system.

**Edit mode** (`components/edit-profile-modal.tsx`, backed by `lib/profile-details.ts`) is opened from the Profile tab's **Edit profile** button. It includes:

- A photo grid of up to six square tiles with arrow controls for reordering, a **Primary** flag on the cover photo, a star control to promote any tile, per-tile delete, and an "Add photo" tile that uses `expo-image-picker` with an explicit permission request.
- Name or nickname, and an **age field locked to the verified date of birth** with a visible lock icon and an explanation that ages come from verification rather than free text.
- Gender selection including **Prefer not to say**, and a home area field that is separate from live GPS, with a **Use device location** action and neighborhood chips.
- A 150-character bio with live counter and whole-word clamping, up to eight interest chips, up to six language chips, and up to four "looking for" chips (friendship, hangout buddy, activity partner, study partner, travel buddy, coffee company).
- A verification badge that reads either **Phone verified** or **ID + selfie verified**, plus a **Get Verified** button that routes into the selfie verification flow.
- An **Available for a hello** switch, and an expandable **Privacy controls** section covering who can send requests (everyone / friends-of-friends / verified only), hide from discovery, hide exact locality, and a block-list row.
- A live completeness percentage in the header and Cancel / Save profile actions with validation messages.

**View mode** (`components/friend-profile-modal.tsx`) is reachable from a chat header avatar and from any discovery card. It shows:

- A swipeable photo carousel with page dots and a photo counter, with the **pink check-circle trust badge pinned to the photo corner** so verification is never buried.
- Name, age, verification badge, broad locality, and a distance row that is **only rendered for paid-tier viewers** — free members never see a distance, and profiles that hide their exact locality show a coarse "~X km" range that rounds up so it cannot narrow down a home area.
- A mutual-interests card ("You both like coffee walks") with **shared interests listed first** in the tag list.
- Bio, looking-for tags, and spoken languages.
- Action buttons that follow the relationship: **Ask for Friendship / Report / Block** before acceptance, **Accept request** when a request is waiting, and **Chat / Hangout / Meetup / Call / Report / Block** once accepted — with **Call appearing only when the premium tier is active**.

## Supporting work

- Sample neighbors now carry gallery photos, languages, looking-for tags, and distances so the view mode has real content to render.
- The Profile tab card shows the primary photo with the trust badge overlay, the verified state, bio, meta pills for availability, photo count, and request audience, plus **Get Verified** and **Edit profile** entries.
- The premium preview row in Profile is now an interactive toggle that switches distance and call gating on and off for demonstration.
- Sessions persist the verified date of birth and age, so the locked age field survives reloads.

## Verification

- `pnpm check`: passed. `pnpm lint`: passed. `pnpm test`: **72 passed**, 1 existing test skipped.
- New `tests/profile-details.test.ts` (15 tests) covers the six-photo cap and primary promotion, reordering bounds, duplicate rejection, bio clamping, selection caps, validation, verification badges, discovery/request-audience rules, free-versus-paid distance gating with the round-up range, shared-interest ordering and sentence building, relationship-driven action sets, and action labels.
- Browser QA: the Edit profile modal opened with every control present; the locked age correctly read 30 from a verified 1996-04-18 birth date; the view modal opened from both a chat avatar and a discovery card, showing the trust badge, shared interests first, looking-for tags, and languages; action sets changed correctly between stranger (**Ask for Friendship**) and accepted (**Chat / Hangout / Meetup**), and **Call appeared only after enabling the premium preview**.
- Phone screenshot at 390×844 confirms the welcome screen layout and the frosted glass panel.

## Still demo-only

- Phone OTP, email recovery, and identity checks remain prototype flows with no live verification provider; distance values and the premium tier are demonstration data rather than billing-backed entitlements.
