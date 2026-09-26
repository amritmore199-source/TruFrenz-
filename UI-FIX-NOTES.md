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
