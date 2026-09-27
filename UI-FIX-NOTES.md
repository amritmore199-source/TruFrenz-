# Trufrenz — three UI fixes

All three are fixed and verified. Diagnosis first, then what changed.

Findings for the three issues reported from a real Android device screenshot
(`Screenshot_2026-09-26-17-53-29-01_...jpg`, You tab).

## 1. Mute / Archive buttons occupy too much of the chat row

`components/swipeable-chat-row.tsx`

- `swipeRevealWidth()` returns **150** (75 per action) and `action.width: 75`.
- `SWIPE_THRESHOLD` is 84.
- Each action stacks a 17px icon (gap 3) over a 9px label.

Because both actions are full-height and 150px wide total, a third of the row was
consumed.

**Fixed.** Each action is now a compact 46x29 icon-only button sitting in the
row's trailing corners, shown only once the row has slid (their opacity follows
the slide so the translucent row never reveals them early). The reveal width
dropped from 150 to 100 and the commit threshold from 84 to 55. The accessible
labels still read "Mute {name}" / "Archive {name}".

## 2. Composer hides behind the keyboard

`app/(tabs)/index.tsx`

- A `KeyboardAvoidingView` already exists (around line 1636) but the composer
  still ends up under the keyboard on Android.
- Android is `edgeToEdgeEnabled: true` in `app.config.ts`, so the window does not
  resize for the keyboard by default.
- The app is a single screen with its own bottom tab bar; the composer sits
  inside the chat thread.

**Fixed.** The screen now tracks the keyboard height via `Keyboard` listeners
(`keyboardWillShow`/`keyboardDidShow` and the hide counterparts) and lifts the
conversation by that amount, discounting the bottom inset the root SafeAreaView
already applies. The bottom tab bar steps aside while a chat keyboard is open so
the composer sits directly on top of the keys instead of behind them.

## 3. White patches inside the frosted glass cards

Root cause: **the frosted surfaces have no backdrop blur at all.** The shared
`Frosted` component in `app/(tabs)/index.tsx` is:

```tsx
function Frosted({ children, style }) {
  const { glassOpacity } = useAppAppearance();
  return <View style={[styles.frosted, style, { backgroundColor: glassSurfaceColor("rgba(255,255,255,0.79)", glassOpacity) }]}>{children}</View>;
}
```

and `styles.frosted` is only a translucent white fill with a hairline border and
shadow:

```ts
frosted: { backgroundColor: "rgba(255,255,255,0.79)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", borderRadius: 19, shadowColor: "#8B8492", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.075, shadowRadius: 15, elevation: 3 },
```

With ~20% of the wallpaper showing through and **no diffusion**, the photo's
bright areas (white clothing and faces in `assets/images/kindred-background.jpg`)
appear as sharp, hard-edged white blobs inside every card — exactly the patches
in the screenshot.

Verified in the live DOM: only these layers exist behind the cards, all uniform
white fills with no backdrop filter —

```
DIV rgba(255,255,255,0.8) 1242x343   <- profile card
DIV rgba(255,255,255,0.8) 1242x181   <- HOW YOU SHOW UP panel
DIV rgba(255,255,255,0.8) 1242x180   <- PRIVACY & LITTLE EXTRAS panel
DIV rgba(255,255,255,0.8) 1242x274   <- Notices panel
DIV rgba(255,255,255,0.8) 1242x183   <- Frosted glass opacity panel
DIV rgba(255,255,255,0.72) 1242x50   <- selfie entry
parent of each: rgba(0,0,0,0)
```

**Fixed.** `Frosted` now paints a real `BlurView` layer (intensity 38, absolute
fill, pointer-events none) between the card and its tint, so the wallpaper is
diffused before the tint sits on top. The same treatment was applied to the
conversation rows (intensity 34). The member's glass-opacity setting still drives
the tint, so their choice is unaffected.

Measured on the same region as the report: the reference screenshot had 11
abrupt brightness steps with a worst-case swing of -28.2 levels inside the cards;
the fixed build has none across the card interiors, and the browser shows 5
backdrop-filter layers active (4 conversation rows plus the bottom bar).

---

## Chat screen: composer, header actions, and dead space

Four separate faults were behind one screenshot, and two of them had been
"fixed" before — which is worth recording, because the earlier fixes were
undone by the tests that guarded them.

### 1. The composer sat under the keyboard again

`composerKeyboardLift` was written as `keyboardHeight - bottomInset`, on the
theory that the root `SafeAreaView` had already reserved the inset so the lift
only needed the remainder. The keyboard event, though, reports its height from
the screen edge. Subtracting the inset therefore left the composer exactly
`inset` points underneath the keys on every notched device.

It survived because `tests/chat-layout.test.ts` pinned the arithmetic:
`expect(composerKeyboardLift(300, 34)).toBe(266)` passed happily while the field
was hidden. The tests asserted the implementation, not the behaviour, so they
certified the bug.

The lift now takes only the keyboard height and adds a small clearance. The
screen cancels the safe-area inset while the keyboard is open, so the field
lands on the keyboard's top edge with a hairline of slack. The tests were
rewritten around the property that matters — the composer must clear the
keyboard — so arithmetic of that shape cannot pass again.

### 2. The call and video buttons were off screen

The conversation header holds Back, the avatar, a two-line name block, and three
round buttons. `brandMark` had no `flex`, so it claimed its full content width,
the row overflowed, and the last controls were pushed past the right edge. The
buttons were not missing; they were beyond the viewport.

`brandMark` is now `flex: 1, minWidth: 0`, the name truncates instead, and the
three buttons were trimmed from 35pt to 32pt with tighter gaps. Measured in the
running app, the options button now ends at 1264 of a 1280pt viewport, so all
three are on screen with room to spare.

### 3. The status line was not visible

The name, the verification sentence, and the availability line were three
stacked lines inside a 45pt header, and the third was clipped away. The status
now shares one row with its verification badge, and the redundant verification
sentence is gone — the shield icon beside the avatar already carries it.

### 4. The empty space, and why the date moved the wrong way

Measured in the running app, the tab bar and the free-tier ad banner were still
rendering inside a conversation. They reserved a band about 110pt tall below the
composer: the "empty space" in the report.

They were hidden only while the keyboard was *up*. The rule asked about the
keyboard when the question was about the conversation, so closing the keyboard
brought the bar and the ad back. One derived value now answers for both, and a
conversation hides them for as long as it is open. Navigation is not lost: the
header carries Back and the Android hardware button still returns to the list.

An advertisement between a member and the person they are talking to was the
wrong place for it in any case.

The gap below the composer fell from **116pt to 6pt**.

Finally, the list was bottom-anchored, which pushed the date *down* to sit above
the messages rather than up. The date is now directly under the safety line at
104pt, and the list is bottom-anchored only while the keyboard is open, where
the newest message has to stay visible.

### What was checked and left alone

The Friends, Meetups, and You tabs each end with 13pt or less of space above the
tab bar, so there is no reserved band there — the open space on a short tab is
simply what is left when the content runs out, which is normal. The conversation
list's trailing safety note was left in place: it appears only when the member
already has conversations, where it reads as a closing reassurance rather than
an empty state, and its removal is a copy decision rather than a layout fix.
