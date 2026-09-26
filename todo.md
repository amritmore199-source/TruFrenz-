# Trufrenz — branding, wallpaper, navigation, and responsive glass UI

## Completed

- Renamed the visible app, Expo manifest, iOS display name, permission copy, package metadata, signup UI, profile copy, and selfie-verification UI to **Trufrenz**.
- Kept the existing native bundle identifier and local quick-reply storage key unchanged so installed-app upgrades and saved demo replies remain compatible.
- Increased the extracted wallpaper’s global visibility on Conversations, chat threads, Friends, Meetups, and Profile while retaining translucent readability layers.
- Added a top-bar navigation-options button with direct access to Conversations, Friends, Meetups, and Profile.
- Upgraded chat navigation with a labeled **Back** button, explicit meetup and conversation-options buttons, and accessibility labels.
- Added Android hardware-back behavior that closes the active sheet first, steps backward through signup, exits a chat to Conversations, and returns secondary tabs to Conversations before allowing normal app exit.
- Reused one safe-area-aware responsive frame for centered navigation, chat-share, group-create, verification-prompt, quick-reply, friend-profile, and meetup-invite dialogs. Sheets adapt width, height, gutters, and route layout to narrow or short phones; longer content scrolls inside the panel.
- Added consistent fine borders and subtle shadows to privacy toggles, tab controls, primary and contextual buttons, chat bubbles, and recent-chat rows.
- Added a Profile **Appearance** panel with six accessible frosted-glass opacity presets (50–95%) and a wallpaper visibility switch. Choices save locally and update the wallpaper, shared frosted cards, chat rows/bubbles, navigation sheets, tabs, notification banner, quick replies, friend-profile, and meetup-invite surfaces immediately.
- Added a load-race guard so a fast setting change at startup is not overwritten by a slower local-storage read.
- Kept account onboarding and the camera-based selfie check full-screen intentionally; these are complete flows rather than action sheets.

## Verification

- `pnpm check`: passed.
- `pnpm lint`: passed; only the template’s Node package-module advisory remains.
- `pnpm test`: 44 passed, 1 existing test skipped; appearance model and responsive layout tests cover persistence parsing plus 320×568, 390×844, and wide/constrained viewports.
- `git diff --check`: passed.
- Browser QA: refreshed preview, centered navigation popup, chat share menu, quick replies, and meetup-invite composer; meetup and share sheets remain centered with controls visible and scrollable.
- Browser QA: changed glass opacity and wallpaper visibility live, reloaded the app to confirm both choices persisted, then restored defaults (80% glass; wallpaper visible).
- Phone screenshot at 390×844 confirms that wallpaper and translucent recent-chat cards remain readable and the bottom tab bar stays above system navigation; compact 320×568 capture was also checked.
