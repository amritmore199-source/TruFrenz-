# Why the app did not read as frosted glass

Measured from the running app and the member's own screenshots, not inferred.

## The finding

The app's glass tint was `rgba(233, 241, 250)` at an alpha that resolved a card to
about 38%. The wallpaper is white paper, so the **page behind every card is already
`(240, 246, 246)`**.

A tint of `(233, 241, 250)` laid over `(240, 246, 246)` differs by two or three
levels per channel. Rendered, a card came out at **1.009:1** against the page it sat
on — the same colour. That is the whole complaint: the surfaces were transparent,
they were just transparent versions of the page colour, so they read as nothing.
Measured off screenshot 536027, a chat row came out at 1.03:1 against the page.

The reference samples the member supplied were measured the same way. Their cards
sit at **1.17:1 to 1.25:1** against their own ground. So the samples are not subtler
than the app — they are *more* defined, because their ground is genuinely darker
than their card.

## The decisions taken

1. **The three casts were solved, not picked.** Each is walked along its own hue
   (every channel scaled by one factor, so the hue cannot drift) until the rendered
   card sits at about **1.14:1** against the page, which is inside the reference
   range. Solved values:
   - sky `rgb(167, 188, 212)` → card renders `(223, 232, 238)`
   - lemon `rgb(195, 187, 141)` → card renders `(231, 231, 218)`
   - white `rgb(181, 186, 193)` → card renders `(227, 231, 233)`
   Contrast held: heading 8.1:1 and body 6.4:1 at the default weight.

2. **The white cast is no longer pure white.** White over a white page resolves to
   the page at every alpha, so choosing "white glass" produced the *least* visible
   glass in the app — the most literal form of the white patch reported. It now
   carries a faint cool lean.

3. **The ambient pools were cut to about a third** (`0.36` → `0.13`). They are the
   "mixing of colours" on the tall profile card: the card is a faithful view of the
   big blue and lemon discs behind it, so it read as colour patches rather than as
   glass.

4. **The rims were strengthened**, especially on the small surfaces: row `0.6` →
   `0.78`, chip `0.5` → `0.72`, tab `0.8` → `0.86`. A light translucent fill over a
   light page barely differs at any alpha, so the rim is what separates it. That is
   exactly how the reference cards work, and it is the part that was missing on the
   chat rows and the tab pills.

## The real defect under all of it — now fixed

**One hundred and fifty-five fill sites in `app/(tabs)/index.tsx` call
`glassFill(...)` / `glassNestedFill(...)` inside a module-scope `StyleSheet.create`
table**, plus about 220 more across twenty components. A style table is evaluated
once when the file is imported, long before the member's glass weight has been read
from storage. So those entries were frozen at the *default* weight for the whole
session and ignored every setting, including the opacities the member dragged to.

The fills were not wrong; they were stale. This is why the member kept reporting no
improvement after changing the setting, and why the surfaces were audited as "already
glass" while still looking flat.

### The repair

`liveGlass()` in `lib/glass.ts` treats a resolved fill as a *value* rather than a
colour. It recovers what the fill was declared as and re-resolves it against the
setting in effect right now:

- **Colour.** The resolver computes `mix(declared, cast, m)` — one equation in two
  unknowns, so the declared neutral and the cast it was resolved against both have
  to be recovered. It is still exactly solvable, because the cast can only be one of
  four known values: for each candidate the neutral is
  `(resolved - cast * m) / (1 - m)`, and only the correct candidate yields a
  plausible declared surface. Anything that is *not* a resolved neutral — every
  saturated accent — cannot be inverted at all, because solving the lemon button
  `#F1DE55` against any cast demands a channel above 255. That is the guard, and it
  is a consequence of the algebra rather than a threshold, so the accent family can
  never be re-tinted.
- **Weight.** Alpha is always `base + declaredWeight + weightFromSetting(opacity)`.
  A style table freezes at the module's own initial weight, 80, so subtracting that
  fixed contribution and adding the current one moves the fill to where it belongs,
  at every setting and every surface class.

The screen then rebuilds its table from that function when the setting changes.
Measured across every cast, weight and declared alpha: **either exact or within
3 of 255 per channel** (integer rounding), and within 0.001 alpha.

## The casts were also a level too light

Measured against the page the cards sit on, before this pass:

| cast | rendered card | vs page |
|---|---|---|
| sky (old) | 232, 239, 243 | 1.063:1 |
| lemon (old) | 237, 239, 231 | 1.062:1 |
| white (old) | 235, 238, 240 | 1.066:1 |

Against the 1.17-1.25:1 the reference cards hold. All three sat below the range,
which is why switching between them made almost no visible difference — none of them
was a visible pane at all. All four are now fitted to the same reference depth, and
**ash grey is the system default** because it is the only cast that carries no colour
of its own and so never competes with the member's wallpaper:

| cast | tint | rendered card | vs page | ink | body |
|---|---|---|---|---|---|
| **ash** (default) | 144, 144, 144 | 228, 231, 231 | 1.138:1 | 8.10 | 6.37 |
| white | 140, 144, 149 | 227, 231, 232 | 1.140:1 | 8.09 | 6.37 |
| sky | 129, 146, 164 | 226, 231, 235 | 1.140:1 | 8.09 | 6.37 |
| lemon | 151, 145, 109 | 229, 231, 225 | 1.141:1 | 8.08 | 6.36 |

The body ink was deepened from `#53514C` to `#4F4D48`, because the deeper surfaces
dropped the old value to 4.51:1 on the worst case — a hair under AA, held up only by
a rounding.

## Also worth knowing

- The bottom-bar tab pills show cyan rings because they were following the sky cast;
  they now follow whichever cast is selected, ash included. A per-tab weight offset
  exists for the bar and the neutral ring now suits the grey icons.
- The ambient colour field behind the glass remains faint (`0.10-0.13`) by design. It
  was reduced from `0.34-0.38` in an earlier pass because the member read the strong
  pools as "a mixing of colours" — the tall profile card is a faithful view of the
  field behind it. If the field should be visible again, it is one table in
  `glassAmbient`.
- The live re-resolver covers fills declared in a style table. A surface that already
  declares a transparent background and reads its fill at the render site was always
  live and needed no repair.
---

# Resolution: white-and-black and sky-blue-and-white

## What the member asked for, and what was wrong with four casts

The request was to retire ash grey and lemon and keep two combinations: **white and
black** as the default, **sky blue and white** as the option. The reason four casts
never felt like a choice is the same reason the glass never felt like glass: **none of
them was calibrated to a depth that could be seen.** Ash, white and sky resolved within
a couple of levels of each other, so switching between them changed almost nothing.

## The two decisions that had to be made together

Deepening the glass and darkening the ink are one decision, not two. The old ink ramp
was mid-grey (`#43423D`), and a mid-grey ink *needs a light card* to clear AA — so the
surfaces could never go deep. Fitting the surfaces to the samples forced the ink to
near-black, which is what the samples' own text is anyway.

| | value | note |
|---|---|---|
| `TINTS.white` | `57, 57, 57` | a true neutral: all three channels equal |
| `TINTS.sky` | `50, 50, 85` | fitted to the **same luminance**, so the cast changes hue and never depth |
| `NEUTRAL_TINT_MIX` | `0.62` | both casts, identical — this is the wash that pulls a declared white down to the cast |
| ink `heading / body / secondary` | `#1C1B19 / #2B2A27 / #45433F` | measured 10.0:1 / 8.3:1 / 5.7:1 on the card |

`white` is a neutral, not a light value, and that is the point: a *pure-white* fill
resolves to the page at every alpha, which is the "white patch" that kept coming back.
At `57` the neutral card renders **198** against a page of **246** — a 1.56:1 step the
eye reads immediately, and the neutral cast is still unmistakably neutral.

## Three defects found by measuring rather than reading

1. **The pill lift was above its own cap.** `EMPTY_TILE_LIFT` (2.4 × the field) pushed
   the richest section past `TAB_PILL_ALPHA_CAP` (0.8), so Hangouts and Bizz rendered
   the *same* pill. The lift is now 1.3 and the cap 0.8: all five sections differ, in
   both casts.
2. **The field's clamp silently flattened the sections.** `AMBIENT_ALPHA_CAP` was 0.28
   while the richest pool needed 0.30, so Bizz and Hangouts both collapsed onto the cap.
   The cap is now 0.30 and the bases are set to fit under it — with the coupling
   asserted in the tests, because changing any one of the three numbers can undo the
   others.
3. **Both casts shared the same field RGB.** `sky` differed from `white` only in alpha,
   so choosing "sky blue" changed the *strength* of the backdrop and never its hue —
   the one thing the choice is supposed to change. The sky pools now lead with blue.

## The tab bar, solved rather than eyeballed

The inactive icon and label, the active pill's ink, and the field border were each
solved to the lightest value that still clears its floor, against the worst backdrop
that can actually occur:

| element | floor | solved | measured |
|---|---|---|---|
| inactive icon | 3:1 | `#606060` / `#5C6064` | 3.24 / 3.22 |
| inactive label | 4.5:1 | `#464646` / `#42464A` | 4.86 / 4.84 |
| active pill ink | 4.5:1 | `#222222` … `#373737` | 4.61 – 4.65 |
| field border | 3:1 | `rgba(82,82,82,0.66)` / `rgba(75,83,91,0.66)` | 3.22 / 3.23 |

## Validation

TypeScript clean; **1014 tests pass**, 1 pre-existing skip across 69 files; lint 0 errors
(28 pre-existing warnings, none new); `git diff --check` clean; the Metro bundle
compiles at HTTP 200 and carries the new palette.

---

# The actual root cause — found after all of the above

Everything above was real work on real defects, and none of it could be seen,
because of one line in a dependency.

**`expo-blur`'s web build ignores the colour a caller passes.** It computes its own
and appends it *after* the caller's style, so the caller's fill never reaches the
screen:

```js
// node_modules/expo-blur/build/BlurView.web.js
return (<View {...props} style={[style, blurStyle]} .../>);

// node_modules/expo-blur/build/getBackgroundColor.js
case 'light':
  return `rgba(249,249,249,${opacity * 0.78})`;
```

Every surface in the app rendered a `rgba(249,249,249,0.33)` film instead of the
tint `lib/glass.ts` had resolved for it. All 40 `BlurView` call sites passed
`tint="light"`.

This is the single explanation for the whole history of the complaint:

- **The "white patch" was never a surface's own fill.** It was the blur layer's. It
  appeared on every card, tab, toggle and sheet at once, which is why patching fills
  one at a time never removed it and why it kept being reported as "everywhere".
- **"It doesn't feel like frosted glass"** was the same film: a near-white overlay
  raises local luminance and flattens contrast, which is what "flat" looks like.
- **Changing the cast did nothing visible** because the layer doing the visible
  compositing was not reading the cast at all.

Measured in the browser, member's setting `{glassOpacity: 80, glassTint: "white"}`:

| | before | after |
|---|---|---|
| surface fill | `rgba(249,249,249,0.33)` | `rgba(86,86,86,0.31)` |

`249` is expo-blur's constant. Our resolver returns the second value. The fix:
`components/glass-blur.tsx` owns the blur layer — a plain `View` with
`backdropFilter` plus our resolved fill on web, `BlurView` on native where `style`
really is honoured. All 40 sites migrated; two structural tests pin it, including a
guard that no screen may reach for expo-blur's `BlurView` directly again.

Two ordering variants that survive unchanged are worth recording so they are not
"fixed" later: putting the fill on the same element as the filter, versus painting it
in a sibling layer underneath, **composites identically**. The filtered backdrop is
composited over the fill either way, so the result is `fill over blur(scene)`
regardless of paint order. Both orderings diffuse the scene; neither one puts the
fill below the blur.
