# Trufrenz — chat, groups, and calling

## Inbox

- **Availability dots** on every direct chat row — a small pulsing green dot for "Available now" and red for "Away" (`lib/chat-extras.ts`, `components/swipeable-chat-row.tsx`).
- **Swipe-to-mute and swipe-to-archive** on each row, with the action buttons revealed behind the row and a full-width tap target so the gesture never blocks opening the chat.
- **Contextual empty states** via `emptyChatsCopy`: no accepted friends yet invites you to meet neighbors; a filtered or searched view says so; and when everything is archived it explains how to bring a thread back.
- An **Archived** toggle appears in the RECENT CHATS header once at least one thread is archived.

## Conversation

- **Header** carries the friend's photo, name, verified badge, live availability line, and quick-access icons for **Call**, **Video call**, and the overflow menu.
- **Message bubbles** stay sender-right / receiver-left with a timestamp and receipt under each bubble.
- **Message types**: text, photo (via the attachment sheet), short voice note with a waveform, and a **manual location pin** that is explicitly labelled "Manual share · never live" and is separate from the live-location map feature.
- **Reactions** — long-press any bubble to open a frosted emoji picker; existing reactions render as tappable chips with counts, and your own reaction is highlighted.
- **Typing indicator** and **read receipts**, where receipts are governed by a **togglable privacy setting** ("Show when I've read messages", off by default, so friends see Delivered only).
- **Inline shortcuts** above the input bar for **Hangout**, **Meetup**, and (in groups) **Poll**.
- **Overflow menu** with View profile, mute, archive, the read-receipt toggle, Report, Block, and **Unfriend** — unfriending archives the thread into a read-only state with a visible notice bar, and messages are preserved unless explicitly deleted.

## Plan cards (in-chat)

- `components/plan-card-view.tsx` renders a **distinct card, not a bubble**, showing the type (Hangout or Meetup), the proposed date and time, the public venue, and **Accept / Decline / Propose New Time**.
- Accepted cards show a countdown that becomes a **Today** indicator on the day, plus a **Check In on Arrival** button tied to the meetup safety reminder.
- Every card carries a copyable follow-up link (`trufrenz://hangout/…`), and shared cards are collected into a **"Follow-ups from chats"** section at the top of the Meetups tab with Open chat, copy link, and check-in actions.

## Group chat

- The group header shows the group photo, name, **member count**, and tap-through to **Group Info**.
- Bubbles match 1:1, with a **sender name label** above each incoming message.
- **Group Info** (`components/group-info-modal.tsx`) lists members with **Admin / Member** roles, adds people **only from accepted friends** (never strangers), and offers admin-only controls for rename, photo, **remove member**, and **transfer admin**, plus a personal mute switch and Leave group.
- **Polls** are built inside group chat: create options, vote, change your vote, see live results with a leading marker, and **turn the leading option into a plan card** in one tap.

## Calling (premium-gated)

- **Call** and **Video call** icons in the 1:1 header, and a **Group call** row in Group Info.
- Gating is explicit: a blocked call shows an upgrade prompt naming who is missing Premium rather than failing silently, and the client-side check is documented as a UX gate that must be re-verified server-side before connecting.
- `components/call-screen.tsx` is the **incoming call screen** — caller photo, name, **verified badge**, and Accept / Decline — built to be raised from a push notification so it works when the app was backgrounded.
- Try it from **You → Preview an incoming call**.

## Verification

- `pnpm check`: passed. `pnpm lint`: **0 errors** (9 pre-existing warnings). `pnpm test`: **139 passed**, 1 existing test skipped.
- New suites: `tests/chat-extras.test.ts`, `tests/plan-cards.test.ts`, and `tests/group-management.test.ts` cover availability states, mute/archive and unread suppression, receipt privacy, reaction toggling and grouping, attachment kinds, unfriend archiving, plan timing and check-in windows, poll ties and winning options, invite-only membership and the member cap, admin-only controls, last-admin protection, group-call gating, call state transitions, and chat/notification rules.
- Browser QA at a phone viewport: swipe actions (Mute / Archive) render on every row; the chat header shows Call, Video call, and availability; a hangout card was composed and sent and rendered with its type, timing, venue, and copyable link; the overflow menu exposed all seven actions; the group chat showed the member count, sender label, and Poll shortcut; Group Info showed roles, admin controls, and the invite-only add list; a poll was created, voted on, and offered "Turn this into a plan"; and the incoming call screen rang, connected, and ended cleanly.

## Still demo-only

- Chat transport is local state, not a real-time layer; the spec calls for WebSockets or a chat SDK rather than polling, and server-side chat history plus **API-level enforcement of the mutual-accept rule** are not yet wired.
- Push notifications, native call UI from a backgrounded app, and the paid-tier entitlement check are represented by in-app previews rather than live services.
- Identity verification still relies on a local demo flow with no provider review.
