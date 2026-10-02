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
export function composerKeyboardLift(
  keyboardHeight: number,
  geometry: KeyboardGeometry = {},
): number {
  if (!Number.isFinite(keyboardHeight) || keyboardHeight <= 0) return 0;

  /*
   * Did the layout already move?
   *
   * The lift is added on top of whatever the platform has already done, so it has
   * to know whether the platform did anything. Android's `adjustResize` shrinks
   * the window by the keyboard's height, which moves the composer's container up
   * on its own; adding the full keyboard height again then throws the composer a
   * whole keyboard above the keys, and the member sees their own text floating in
   * the middle of the screen. Edge-to-edge (`adjustNothing`, which this app
   * enables) does the opposite and resizes nothing, so there the full lift is
   * required.
   *
   * Telling the two apart cannot be done from the keyboard event: both report the
   * same height. It can be done from the viewport, which only shrinks in the first
   * case. A window that has already given up the keyboard's worth of height needs
   * no lift at all beyond the seam.
   */
  const { windowHeight, restingHeight } = geometry;
  if (
    Number.isFinite(windowHeight) &&
    Number.isFinite(restingHeight) &&
    (restingHeight as number) - (windowHeight as number) >= keyboardHeight * KEYBOARD_RESIZE_FRACTION
  ) {
    return KEYBOARD_CLEARANCE;
  }

  return Math.round(keyboardHeight + KEYBOARD_CLEARANCE);
}

/**
 * What the lift needs to know beyond the keyboard's own height.
 *
 * Both are optional, and the lift falls back to the full height without them,
 * because that is the safe direction to be wrong in: a composer sitting a little
 * too high is legible, and one sitting under the keys is not.
 */
export interface KeyboardGeometry {
  /** The viewport's height right now, in points. */
  windowHeight?: number;
  /** The viewport's height with the keyboard closed, in points. */
  restingHeight?: number;
}

/**
 * How much smaller the viewport must be, as a share of the keyboard, to count as
 * resized.
 *
 * Not a fixed number of points, because a real resize is not always the keyboard's
 * full height: on Android the keyboard overlaps the navigation bar, so the window
 * gives up rather less than the height the event reports. Half the keyboard's
 * height separates the two cases with a wide margin in both directions - a resize
 * is at least this much and rounding drift is a point or two - so neither a
 * partial resize nor a rounding difference is misread.
 */
export const KEYBOARD_RESIZE_FRACTION = 0.5;

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

/**
 * The composer's own widths, so the field's text space can be measured rather
 * than estimated.
 *
 * These mirror the styles in the chat screen. They are duplicated here because a
 * style table cannot be read from a test, and the number that matters - how much
 * room the text inside the field actually has - is the difference between four
 * declared values and the phone's width. Guessing at that is how the placeholder
 * came to be clipped by the field describing it.
 */
export const COMPOSER_CONTROL_WIDTHS = {
  attachment: 32,
  quickReply: 29,
  send: 34,
  /** The gap between each pair of controls, including the field's own. */
  gap: 6,
  /** The field's horizontal padding and its two 1pt borders. */
  fieldChrome: 24,
  /** The conversation's own horizontal padding. */
  threadPadding: 16,
} as const;

/** The narrowest phone the app supports, in points. */
export const NARROWEST_PHONE = 320;

/**
 * How much room the text inside the composer field has, in points.
 *
 * Used to keep the field's font size honest: the placeholder has to fit the space
 * that exists, and at 320pt that space is not generous.
 */
export function composerTextSpace(screenWidth: number = NARROWEST_PHONE): number {
  const { attachment, quickReply, send, gap, fieldChrome, threadPadding } = COMPOSER_CONTROL_WIDTHS;
  const field = screenWidth - threadPadding * 2 - attachment - quickReply - send - gap * 3;
  return field - fieldChrome;
}

/**
 * How much of the page an on-screen keyboard is covering, in the browser.
 *
 * The web has no keyboard for React Native's `Keyboard` to measure - its
 * `addListener` is a no-op there and never fires - so the composer went under the
 * on-screen keyboard on every web render while the native path was correct. That
 * mismatch is why the fault kept coming back after being fixed: the fix was real
 * and the check was blind.
 *
 * The browser does expose what is actually visible. The layout viewport is the
 * page's own height; the visual viewport shrinks when a keyboard opens and also
 * shifts, so the covered area is what is left after subtracting both its height
 * and its offset from the layout height.
 *
 * The floor matters as much as the sum. A browser toolbar collapsing changes the
 * viewport by a few dozen points and fires the same event, and treating that as a
 * keyboard would lift the composer for no reason. A keyboard is a large fraction
 * of the screen; a toolbar is not.
 */
export function webKeyboardCoveredHeight(params: {
  layoutHeight: number;
  viewportHeight: number;
  offsetTop: number;
  minimum?: number;
}): number {
  const { layoutHeight, viewportHeight, offsetTop } = params;
  const minimum = params.minimum ?? WEB_KEYBOARD_MIN_HEIGHT;
  if (![layoutHeight, viewportHeight, offsetTop].every(Number.isFinite)) return 0;
  const covered = layoutHeight - viewportHeight - offsetTop;
  if (covered < minimum) return 0;
  return Math.round(covered);
}

/**
 * Below this, a shrunken viewport is browser chrome rather than a keyboard.
 *
 * An on-screen keyboard is around a third of a phone screen; a collapsing address
 * bar is a small fraction of that. The gap between them is wide, so this sits in
 * the middle of it rather than at either edge.
 */
export const WEB_KEYBOARD_MIN_HEIGHT = 120;
