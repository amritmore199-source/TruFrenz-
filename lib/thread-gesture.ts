/**
 * The gesture that leaves a conversation.
 *
 * Leaving a thread meant finding the Back button in the header, which sits in
 * the corner the thumb does not reach on a phone held in one hand. The natural
 * gesture for "put this away" is to drag the screen down, so that is the one
 * this supports — with the same discipline as the chat row swipes: a decision
 * function that is pure and tested, and a spring back when the drag does not
 * commit.
 *
 * Two guards matter more than the threshold itself.
 *
 * The drag must be mostly vertical. A conversation scrolls, so a mostly
 * horizontal drag belongs to the list, and a diagonal flick while scrolling must
 * never close the screen.
 *
 * The drag must start from the top of the thread. Pulling down from the middle
 * of a long conversation is how a member reads back through messages, so only a
 * drag begun at the top edge is treated as "put this away".
 */
export type ThreadDragInput = {
  /** Horizontal travel in points. Negative is leftwards. */
  dx: number;
  /** Vertical travel in points. Positive is downwards. */
  dy: number;
  /** How far the list is scrolled, in points. 0 means the very top. */
  scrollOffset: number;
  /** Viewport height in points, used to scale the threshold. */
  viewportHeight: number;
  /** Whether the keyboard is open; a raised keyboard owns the drag. */
  keyboardOpen: boolean;
};

/** How far down the screen the member must pull, as a fraction of its height. */
export const CLOSE_DRAG_RATIO = 0.18;

/** The shortest pull that can ever commit, so a small screen is still reachable. */
export const MIN_CLOSE_DRAG = 64;

/** Above this many points of scroll the drag belongs to the list, not the screen. */
export const TOP_EDGE_TOLERANCE = 4;

/** How much more vertical than horizontal the drag must be. */
export const VERTICAL_DOMINANCE = 1.4;

/** The distance, in points, that counts as a committing pull on this screen. */
export function closeDragThreshold(viewportHeight: number): number {
  return Math.max(MIN_CLOSE_DRAG, Math.round(viewportHeight * CLOSE_DRAG_RATIO));
}

/**
 * How far the screen should travel for a given drag.
 *
 * Downwards only, and damped, so the screen follows the thumb without the
 * member dragging the whole app off the display.
 */
export function closeDragOffset(dy: number): number {
  if (dy <= 0) return 0;
  return Math.round(dy * 0.6);
}

export type ThreadDragDecision = { close: boolean; offset: number; progress: number };

/**
 * Decides what a drag on the conversation should do.
 *
 * `progress` is what a fade is driven from, so the screen dims as the member
 * pulls and comes back cleanly when the drag does not commit.
 */
export function decideThreadDrag(input: ThreadDragInput): ThreadDragDecision {
  const threshold = closeDragThreshold(input.viewportHeight);
  const offset = closeDragOffset(input.dy);

  // A raised keyboard owns the drag: the member is dismissing keys, not leaving.
  if (input.keyboardOpen) return { close: false, offset: 0, progress: 0 };

  // Scrolled into the conversation, a pull reads backwards through messages.
  if (input.scrollOffset > TOP_EDGE_TOLERANCE) return { close: false, offset: 0, progress: 0 };

  // A horizontal or diagonal drag belongs to whatever the finger is over.
  if (Math.abs(input.dx) * VERTICAL_DOMINANCE > Math.abs(input.dy)) return { close: false, offset: 0, progress: 0 };

  const progress = Math.min(1, Math.max(0, input.dy / threshold));
  return { close: input.dy >= threshold, offset, progress };
}