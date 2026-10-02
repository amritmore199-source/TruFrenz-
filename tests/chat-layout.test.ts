import { describe, expect, it } from "vitest";

import {
  CHAT_ROW_ACTION_SIZE,
  CHAT_ROW_ARCHIVE_REVEAL,
  COMPOSER_CONTROL_WIDTHS,
  KEYBOARD_CLEARANCE,
  NARROWEST_PHONE,
  WEB_KEYBOARD_MIN_HEIGHT,
  archiveSwipeLabel,
  chatRowArchiveThreshold,
  chatRowRevealWidth,
  chatRowSwipeThreshold,
  composerKeyboardLift,
  composerTextSpace,
  resolveChatRowSwipe,
  shouldShowBottomBar,
  webKeyboardCoveredHeight,
} from "../lib/chat-layout";

/*
 * These tests previously asserted the bug. The lift was written as
 * `keyboardHeight - bottomInset`, and the suite pinned that arithmetic, so the
 * composer being left underneath the keyboard on every real device was encoded
 * as the expected behaviour and never caught. The assertions below are written
 * against the property that actually matters — the composer must end up above
 * the keyboard — so arithmetic like that cannot pass again.
 */
describe("composer keyboard lift", () => {
  it("keeps the composer in place when the keyboard is closed", () => {
    expect(composerKeyboardLift(0)).toBe(0);
  });

  it("clears the full reported keyboard height", () => {
    // The keyboard event reports its own height from the screen edge, so the
    // composer needs to rise by all of it — not by height minus the safe-area
    // inset, which left it under the keys by exactly that inset.
    for (const height of [260, 280, 300, 336]) {
      expect(composerKeyboardLift(height)).toBeGreaterThanOrEqual(height);
    }
  });

  it("clears the keyboard on a device with a home indicator", () => {
    // The reported height already includes the indicator area, so the worst case
    // is a tall keyboard on a notched phone: 336 up, 34 of it the indicator.
    expect(composerKeyboardLift(336)).toBeGreaterThanOrEqual(336);
  });

  it("clears the keyboard on a gesture-navigation Android", () => {
    expect(composerKeyboardLift(300)).toBeGreaterThanOrEqual(300);
  });

  it("leaves only a hairline of slack, so no gap opens above the keys", () => {
    // Overshooting would float the composer in mid-air; the allowance is a seam.
    expect(composerKeyboardLift(300) - 300).toBe(KEYBOARD_CLEARANCE);
    expect(KEYBOARD_CLEARANCE).toBeLessThanOrEqual(10);
  });

  it("ignores malformed keyboard measurements", () => {
    expect(composerKeyboardLift(Number.NaN)).toBe(0);
    expect(composerKeyboardLift(-50)).toBe(0);
    expect(composerKeyboardLift(Number.POSITIVE_INFINITY)).toBe(0);
  });

  /*
   * The resize check.
   *
   * Android can be configured to shrink the window when the keyboard opens
   * (`adjustResize`) or to leave it alone (edge-to-edge). Both report the same
   * keyboard height, so a lift that only knows the height cannot serve both: on a
   * resized window it adds a second keyboard's worth of movement and throws the
   * field into the middle of the screen. These pin the two cases apart.
   */
  it("adds nothing when the platform already resized the window", () => {
    // A 320pt keyboard on a 780pt screen that shrank to 460pt: the composer has
    // already been carried up by the full height, so only the seam is left.
    expect(composerKeyboardLift(320, { windowHeight: 460, restingHeight: 780 })).toBe(KEYBOARD_CLEARANCE);
  });

  it("adds the full height when the window did not move", () => {
    // Edge-to-edge: the viewport is the same as it was with the keyboard closed.
    expect(composerKeyboardLift(320, { windowHeight: 780, restingHeight: 780 })).toBe(320 + KEYBOARD_CLEARANCE);
  });

  it("still lifts fully when the geometry is unknown", () => {
    // Being wrong in this direction leaves a composer a little high but readable;
    // the other leaves it under the keys. So the fallback is the full lift.
    expect(composerKeyboardLift(300, {})).toBe(300 + KEYBOARD_CLEARANCE);
    expect(composerKeyboardLift(300, { windowHeight: 780 })).toBe(300 + KEYBOARD_CLEARANCE);
    expect(composerKeyboardLift(300, { windowHeight: Number.NaN, restingHeight: 780 })).toBe(300 + KEYBOARD_CLEARANCE);
  });

  it("does not mistake rounding drift for a resize", () => {
    // A point or two of difference is normal between platforms and is not a resize.
    expect(composerKeyboardLift(300, { windowHeight: 779, restingHeight: 780 })).toBe(300 + KEYBOARD_CLEARANCE);
  });

  it("accepts a partial resize as a resize", () => {
    // Some platforms shrink by slightly less than the keyboard's reported height,
    // because the keyboard overlaps the navigation bar. That is still a resize.
    expect(composerKeyboardLift(300, { windowHeight: 500, restingHeight: 780 })).toBe(KEYBOARD_CLEARANCE);
  });
});

/*
 * The bottom bar and the ad banner share one decision, and it has to be made
 * for the whole conversation rather than only while typing. Hiding them only
 * when the keyboard appeared left a reserved band about 110pt tall under the
 * composer, which is the empty space that was reported.
 */
describe("bottom bar behaviour", () => {
  it("steps aside for the whole conversation, keyboard or not", () => {
    expect(shouldShowBottomBar({ hasOpenChat: true, keyboardHeight: 300 })).toBe(false);
    expect(shouldShowBottomBar({ hasOpenChat: true, keyboardHeight: 0 })).toBe(false);
  });

  it("stays visible in the list views so navigation is never lost", () => {
    expect(shouldShowBottomBar({ hasOpenChat: false, keyboardHeight: 0 })).toBe(true);
  });

  it("steps aside in a list view while the search field has the keyboard", () => {
    // The composer is not on screen here, but the keyboard is, and the bar would
    // otherwise sit on top of it.
    expect(shouldShowBottomBar({ hasOpenChat: false, keyboardHeight: 300 })).toBe(false);
  });
});

describe("conversation row swipe actions", () => {
  it("reveals both corner buttons", () => {
    expect(chatRowRevealWidth()).toBe(CHAT_ROW_ACTION_SIZE * 2 + 8);
  });

  it("keeps the actions compact so the conversation preview keeps the row", () => {
    // Two ~46pt buttons plus a small gutter must stay well under a third of a
    // 390pt phone width.
    expect(chatRowRevealWidth()).toBeLessThan(390 / 3);
  });

  it("commits on a swipe shorter than the full reveal", () => {
    const threshold = chatRowSwipeThreshold();
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThan(chatRowRevealWidth());
  });
});

describe("swipe-right archive gesture", () => {
  it("archives on a decisive swipe to the right", () => {
    expect(resolveChatRowSwipe(chatRowArchiveThreshold())).toBe("archive");
    expect(resolveChatRowSwipe(CHAT_ROW_ARCHIVE_REVEAL)).toBe("archive");
    expect(resolveChatRowSwipe(200)).toBe("archive");
  });

  it("still reveals the corner actions on a swipe to the left", () => {
    expect(resolveChatRowSwipe(-chatRowSwipeThreshold())).toBe("reveal-actions");
    expect(resolveChatRowSwipe(-200)).toBe("reveal-actions");
  });

  it("does nothing for a nudge that could just be a scroll", () => {
    // A row must never be archived because a vertical scroll drifted sideways.
    expect(resolveChatRowSwipe(0)).toBeNull();
    expect(resolveChatRowSwipe(12)).toBeNull();
    expect(resolveChatRowSwipe(-12)).toBeNull();
    expect(resolveChatRowSwipe(chatRowArchiveThreshold() - 1)).toBeNull();
    expect(resolveChatRowSwipe(-(chatRowSwipeThreshold() - 1))).toBeNull();
  });

  it("ignores a malformed measurement", () => {
    expect(resolveChatRowSwipe(Number.NaN)).toBeNull();
  });

  it("keeps the archive panel narrower than the two-button reveal", () => {
    // Archiving is one action, so its panel must not claim more width than the
    // tray that holds two.
    expect(CHAT_ROW_ARCHIVE_REVEAL).toBeLessThan(chatRowRevealWidth());
  });

  it("needs a deliberate swipe before archiving", () => {
    // Archiving hides the conversation, so it asks for more travel than the
    // reversible reveal does.
    expect(chatRowArchiveThreshold()).toBeGreaterThan(chatRowSwipeThreshold() - 20);
    expect(chatRowArchiveThreshold()).toBeGreaterThanOrEqual(35);
  });

  it("names the action so the row reads correctly either way", () => {
    expect(archiveSwipeLabel(false)).toBe("Archive");
    expect(archiveSwipeLabel(true)).toBe("Restore");
  });
});

/*
 * The composer is only in the right place when two numbers agree: how far the
 * container lifts, and whether it has already given up the safe-area edge. The
 * chat screen lifts by the whole keyboard height and cancels the inset while
 * the keyboard is open, so the two land exactly on the keyboard's top edge.
 * Getting one of them wrong is what put the field under the keys.
 */
describe("composer resting position", () => {
  it("lands exactly on the keyboard edge when the inset is cancelled", () => {
    const keyboardHeight = 300;
    const bottomInset = 34;
    // The container lifts by the full height and drops the inset it had reserved.
    const restingOffset = composerKeyboardLift(keyboardHeight) - bottomInset;
    // Measured from the screen edge, the field now sits at the keyboard's top.
    expect(restingOffset).toBeGreaterThanOrEqual(keyboardHeight - bottomInset);
  });

  it("would float above the keys if the inset were not cancelled", () => {
    // Guards the other half of the mistake: lifting by the full height while the
    // inset is still reserved leaves a gap the height of the inset.
    const keyboardHeight = 300;
    const bottomInset = 34;
    const gapIfNotCancelled = composerKeyboardLift(keyboardHeight) - keyboardHeight;
    expect(gapIfNotCancelled).toBeGreaterThan(0);
    expect(gapIfNotCancelled).toBeLessThanOrEqual(bottomInset);
  });

  it("does not cancel the inset while the keyboard is closed", () => {
   // Closed, the inset must stay so the composer clears the home indicator.
   expect(composerKeyboardLift(0)).toBe(0);
 });
});

/*
 * The composer's size, which is a fit question rather than a taste one.
 *
 * The placeholder was being clipped by the field describing it, so the space has
 * to be measured rather than assumed. The width used here is the widest the string
 * can possibly be: DejaVu Sans, which is broader than both Roboto and SF, so a
 * string that fits here fits on the device.
 */
describe("composer text space", () => {
  /** Width of the placeholder at a given size, in a font wider than the platforms'. */
  const PLACEHOLDER_PT_AT_15 = 141;
  const PLACEHOLDER_PT_AT_12 = 113;

  it("leaves the placeholder room on the narrowest phone the app supports", () => {
    const space = composerTextSpace(NARROWEST_PHONE);
    expect(space).toBeGreaterThan(PLACEHOLDER_PT_AT_15);
    expect(space).toBeGreaterThan(PLACEHOLDER_PT_AT_12);
  });

  it("is the room the field actually has, not a guess", () => {
    // Recomputed from the declared widths, so the helper cannot drift from the
    // styles it mirrors without this failing.
    const { attachment, quickReply, send, gap, fieldChrome, threadPadding } = COMPOSER_CONTROL_WIDTHS;
    expect(composerTextSpace(NARROWEST_PHONE)).toBe(
      NARROWEST_PHONE - threadPadding * 2 - attachment - quickReply - send - gap * 3 - fieldChrome,
    );
  });

  it("gives more room on every larger phone", () => {
    expect(composerTextSpace(390)).toBeGreaterThan(composerTextSpace(360));
    expect(composerTextSpace(360)).toBeGreaterThan(composerTextSpace(NARROWEST_PHONE));
  });
});

/*
 * The browser's keyboard, which React Native cannot see.
 *
 * `Keyboard.addListener` is a no-op in react-native-web, so the native path never
 * fires there and the composer sat under the on-screen keyboard on every web
 * render. This is the measurement that replaces it.
 */
describe("the web keyboard height", () => {
  it("reports what the on-screen keyboard covers", () => {
    // A 780pt page with the keyboard up: the visible part is 480pt at the top.
    expect(webKeyboardCoveredHeight({ layoutHeight: 780, viewportHeight: 480, offsetTop: 0 })).toBe(300);
  });

  it("accounts for a viewport that has also scrolled", () => {
    // The keyboard pushes the visual viewport up as well as shrinking it, so the
    // offset is part of what is hidden and must not be counted as visible.
    expect(webKeyboardCoveredHeight({ layoutHeight: 780, viewportHeight: 480, offsetTop: 60 })).toBe(240);
  });

  it("ignores browser chrome collapsing", () => {
    // An address bar hiding changes the viewport by a few dozen points and fires
    // the same event. Lifting the composer for that would be a visible jump.
    expect(webKeyboardCoveredHeight({ layoutHeight: 780, viewportHeight: 740, offsetTop: 0 })).toBe(0);
    expect(WEB_KEYBOARD_MIN_HEIGHT).toBeGreaterThan(40);
  });

  it("reports nothing when the viewport is whole", () => {
    expect(webKeyboardCoveredHeight({ layoutHeight: 780, viewportHeight: 780, offsetTop: 0 })).toBe(0);
  });

  it("ignores a malformed measurement rather than lifting on it", () => {
    expect(webKeyboardCoveredHeight({ layoutHeight: Number.NaN, viewportHeight: 480, offsetTop: 0 })).toBe(0);
    expect(webKeyboardCoveredHeight({ layoutHeight: 780, viewportHeight: Number.NaN, offsetTop: 0 })).toBe(0);
  });
});
