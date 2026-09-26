# Trufrenz — branding, wallpaper, and mobile navigation

## Completed

- Renamed the visible app, Expo manifest, iOS display name, permission copy, package metadata, signup UI, profile copy, and selfie-verification UI to **Trufrenz**.
- Kept the existing native bundle identifier and local quick-reply storage key unchanged so installed-app upgrades and saved demo replies remain compatible.
- Increased the extracted wallpaper’s global visibility on Conversations, chat threads, Friends, Meetups, and Profile while retaining translucent readability layers.
- Added a top-bar navigation-options button with direct access to Conversations, Friends, Meetups, and Profile.
- Upgraded chat navigation with a labeled **Back** button, explicit meetup and conversation-options buttons, and accessibility labels.
- Added Android hardware-back behavior that closes the active sheet first, steps backward through signup, exits a chat to Conversations, and returns secondary tabs to Conversations before allowing normal app exit.

## Verification

- Resolved Expo config reports `name: Trufrenz`, `slug: trufrenz`, and iOS display name `Trufrenz`.
- `pnpm check`: passed.
- `pnpm lint`: passed; only the template’s Node package-module advisory remains.
- `pnpm test`: 37 passed, 1 existing test skipped.
- `git diff --check`: passed.
- Live preview QA confirmed navigation sheet routing, chat Back behavior, Trufrenz copy, and wallpaper continuity across Conversations, chat, Friends, Meetups, and Profile.
- Final 390×844 capture confirmed readable glass surfaces and the lifted safe-area bottom navigation.
