/**
 * Chat layout maths.
 *
 * Two things were easy to get wrong and are worth pinning down with tests:
 *
 *  1. How far the message composer must rise when the keyboard opens. Android
 *     runs edge-to-edge here, so the window is not resized and the composer
 *     would sit underneath the keyboard. The lift has to discount the bottom
 *     safe-area inset the root view already applies, otherwise the composer is
 *     pushed too far up and leaves a gap above the keys.
 *
 *  2. How much width the swipe actions may take from a conversation row. The
 *     preview text is the row's purpose, so the revealed Mute and Archive
 *     buttons stay compact and sit in the row's trailing corners.
 */

/** Width of one revealed corner action button. */
export const CHAT_ROW_ACTION_SIZE = 46;

/** Gap between the corner buttons and the row's trailing edge. */
export const CHAT_ROW_ACTION_INSET = 7;

/** Space between the two stacked corner buttons. */
export const CHAT_ROW_ACTION_GAP = 6;

/**
 * Total distance a conversation row travels to reveal both corner actions.
 */
export function chatRowRevealWidth(): number {
  return CHAT_ROW_ACTION_SIZE * 2 + 8;
}

/**
 * Distance the row must travel before a swipe commits to revealing the actions.
 * Deliberately shorter than the full reveal so a gentle swipe is enough.
 */
export function chatRowSwipeThreshold(): number {
  const reveal = chatRowRevealWidth();
  return Math.round(reveal * 0.55);
}

/**
 * How far the row may travel to the right before it commits to archiving.
 * Archiving is a single action rather than a tray of buttons, so the panel is
 * narrower than the left-hand reveal.
 */
export const CHAT_ROW_ARCHIVE_REVEAL = 76;

/**
 * Distance a rightward swipe must cover before it archives the conversation.
 * Kept comfortably above a stray nudge so a row is never archived by accident,
 * but short enough that the gesture feels light.
 */
export function chatRowArchiveThreshold(): number {
  return Math.round(CHAT_ROW_ARCHIVE_REVEAL * 0.5);
}

/** The two directions a conversation row can be swiped. */
export type ChatRowSwipeDirection = "reveal-actions" | "archive";

/**
 * Decide what a completed swipe means.
 *
 * A swipe to the left reveals the Mute and Archive corner buttons; a swipe to
 * the right commits the archive straight away, because the archive panel shows
 * only one action and hiding a single button behind a second tap would be
 * needless. Both directions need the same minimum travel so neither fires on a
 * scroll that drifted sideways.
 */
export function resolveChatRowSwipe(dx: number): ChatRowSwipeDirection | null {
  if (!Number.isFinite(dx)) return null;
  if (dx <= -chatRowSwipeThreshold()) return "reveal-actions";
  if (dx >= chatRowArchiveThreshold()) return "archive";
  return null;
}

/**
 * Copy for the archive swipe, so the row reads correctly in both directions.
 * An already-archived conversation offers "Restore" instead.
 */
export function archiveSwipeLabel(archived: boolean): string {
  return archived ? "Restore" : "Archive";
}

/**
 * How far to lift the composer so it sits directly above the keyboard.
 *
 * This was written as `keyboardHeight - bottomInset`, reasoning that the root
 * SafeAreaView already reserves the bottom inset. That is only true if the
 * keyboard reports its height *from the top of the inset rather than from the
 * screen edge*, and it does not: Android's `Keyboard` event and iOS's
 * `keyboardWillShow` both report the keyboard's own height, measured from the
 * screen edge. Subtracting the inset therefore under-lifts the composer by the
 * full inset — 34 points on a notched iPhone, 48 on a gesture-navigation
 * Android — which is exactly enough to leave the text field sitting under the
 * keyboard. The fix should have moved the composer flush to the keys, not most
 * of the way there, and the error was invisible to browser testing because a
 * desktop browser never raises a keyboard at all.
 *
 * So: lift by the full reported height. The small allowance is the hairline of
 * slack that keeps the top of the keyboard from clipping the field's border.
 *
 * @param keyboardHeight Height reported by the keyboard events, in points.
 */
export function composerKeyboardLift(keyboardHeight: number): number {
  if (!Number.isFinite(keyboardHeight) || keyboardHeight <= 0) return 0;
  return Math.round(keyboardHeight + KEYBOARD_CLEARANCE);
}

/**
 * Slack above the keyboard, so the composer's border is not clipped by the
 * keyboard's own edge. Small: this is a visual seam, not an ergonomic gap.
 */
export const KEYBOARD_CLEARANCE = 6;

/**
 * Whether the bottom furniture should be shown at all.
 *
 * A conversation is a focused view: the composer owns the bottom edge for as
 * long as it is open, not only while the keyboard is up. The tab bar and the
 * free-tier ad banner used to stay in place, which reserved a band roughly
 * 110pt tall between the composer and the bottom of the screen — measured in
 * the running app, and exactly the "empty space" this is here to remove. An
 * advertisement wedged between a member and the person they are talking to is
 * also simply the wrong place for it.
 *
 * Navigation is not lost: the conversation header carries Back, and the Android
 * hardware button still returns to the list.
 */
export function shouldShowBottomBar(params: {
  hasOpenChat: boolean;
  keyboardHeight: number;
}): boolean {
  if (params.hasOpenChat) return false;
  return params.keyboardHeight <= 0;
}
