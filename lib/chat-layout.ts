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
 * How far to lift the composer so it sits directly above the keyboard.
 *
 * @param keyboardHeight Height reported by the keyboard events, in points.
 * @param bottomInset    Bottom safe-area inset the root view already applies.
 */
export function composerKeyboardLift(keyboardHeight: number, bottomInset: number): number {
  if (!Number.isFinite(keyboardHeight) || keyboardHeight <= 0) return 0;
  const inset = Number.isFinite(bottomInset) && bottomInset > 0 ? bottomInset : 0;
  return Math.max(0, Math.round(keyboardHeight - inset));
}

/**
 * Whether the bottom tab bar should step aside while the member is typing.
 *
 * The bar is only hidden in a conversation, where the composer needs the room.
 * In the list views the bar stays put so navigation is never lost mid-typing in
 * the search field.
 */
export function shouldHideTabBarForKeyboard(params: {
  keyboardHeight: number;
  hasOpenChat: boolean;
}): boolean {
  return params.keyboardHeight > 0 && params.hasOpenChat;
}