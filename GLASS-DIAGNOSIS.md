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

---

## The composer behind the keyboard, and the pill ink that went stale

### Why the composer kept going under the keyboard after being "fixed"

The native lift was correct. It was being checked in a browser, and a browser was
the one environment the lift could not reach.

`Keyboard.addListener` is a **no-op in react-native-web**. It returns a handle whose
`remove` does nothing and which never fires, so every web render measured the
keyboard as zero and the composer sat under the on-screen keyboard. That is the
whole reason the fault kept returning: the fix was real, the check was blind.

The composer now has two paths into the same state, so the lift, the tab bar and the
thread padding all take one route rather than two:

| environment | source of the height |
|---|---|
| iOS / Android | `keyboardWillShow` / `keyboardDidShow` (unchanged) |
| web | `visualViewport` `resize`/`scroll`; covered height = `innerHeight − vv.height − vv.offsetTop`, floored at 120pt so a collapsing toolbar is not read as a keyboard |

### The second failure mode: lifting twice

Android can be configured to shrink the window (`adjustResize`) or leave it alone
(edge-to-edge, which this app enables). Both report the *same* keyboard height, so a
lift that only knows the height cannot serve both — on a resized window it adds a
second keyboard's worth of movement and throws the field into the middle of the
screen. `composerKeyboardLift` now takes optional `{windowHeight, restingHeight}` and
returns only the seam when the viewport has already given up at least half the
keyboard's height. The fraction is not a fixed number of points because a real
resize is not always the full height: on Android the keyboard overlaps the navigation
bar, so the window gives up rather less than the event reports.

The fallback when the geometry is unknown is the **full** lift, because that is the
safe direction to be wrong in: a composer slightly too high is readable, one under
the keys is not.

### The active pill's label, and why the five-grey table had to go

The five solved greys were solved against pills that all shared one blue. Making the
backdrop fields per-section moved two pills out from under their inks and dropped the
label to **4.43:1**. That is a maintenance trap rather than a bug: every future change
to a field would need the ink table re-solved, and nothing would fail loudly if it was
not.

Black cannot go stale. Measured across five sections × two casts on the darkest
backdrop a pill can sit over: **4.92–6.34:1** on white, **4.43–5.07:1** on sky. The
pill's own alpha is ≥ 0.447 everywhere, and black clears 4.5:1 from an alpha of
0.225, so the fill is never the binding constraint. The label is legible by
construction, and it is the "white glass, black ink" combination that was asked for.

### The composer's size

The field was 12pt — the same size as the timestamps around it, so what the member
typed was the smallest text on the screen — and it carried a 1pt border and 12pt of
horizontal padding inside a row that already had gaps and two 30pt controls. At 360pt
of screen width the text had roughly 220pt and "Write a message…" was clipped by the
field describing it. `paddingVertical` inside a `minHeight` does nothing on Android,
where a single-line `TextInput` ignores it.

Now 15pt on a 20pt line box in a 46pt field, on a 55pt row; `flexGrow`/`flexShrink`
with a zero basis so a long draft narrows the field rather than the row, and the
icons keep fixed widths so the field is the only thing that gives.

### The composer's size, the second cause: its style was never applied

The style table was not the problem. The field was declared `style={styles.composerInputNight}`
— the *night* override only. The base style, `composerInput`, which carries every
sizing property, was never passed to the element at all, so the field fell back to the
browser's default input: measured in the running app, **16pt tall, 14px text, zero
padding**, inside a 55pt row.

This is why raising the numbers in the table changed nothing on screen. It is also the
same shape as the earlier defects: the declaration was correct and the wiring was not.

Measured before and after, in the running app at the same viewport:

| | before | after |
|---|---|---|
| field height | 16pt | 46pt |
| font | 14px | 15px / 20px line |
| horizontal padding | 0 | 11pt |
| flex basis | auto | 0, grow 1 |

### The dead band above the composer

With the field fixed, the space between the last message and the composer was visible
for what it was: the message list was top-aligned, so the leftover height landed
*between the conversation and the field* rather than above the conversation. The list is
now bottom-anchored, which is what every messaging app does and what makes the newest
message and the composer read as one thing.

This reverses an earlier decision, and the reason it reverses is recorded in the style
comment rather than left implicit: that decision was taken while a one-line safety
reminder sat above the date, and bottom-anchoring then pushed the date away from the
reminder. The reminder has since been removed, so the same anchoring now separates the
two elements that most need to touch.

---

## The dark restructure: why the glass could never look like the references

### The measurement that settled it

The member supplied two references — a sky-blue glass travel UI and its monochrome
twin — and the instruction was to rebuild the app to match, black-and-white as the
default and sky as the option. Before changing anything, the references were sampled
directly. Two numbers mattered:

- the reference's blue module sits at about **RGB(112, 176, 223)** with **white** type
- its dark modules sit at **RGB(46, 46, 46) – (77, 77, 77)** with **white** type

Both variants carry white ink. The app carried dark ink on pale glass. That is not a
difference of taste; it is a different system.

### Why the old system could not get there

A card renders at `alpha * fill + (1 - alpha) * backdrop`. Every previous pass tried to
reach a visible card by moving `fill` — deepening the cast, raising the alpha. That has
a hard ceiling: with white ink on it, a card has to reach luminance 0.175 or below to
clear 4.5:1, and over the old pale page that needed **alpha 0.86**. At 0.86 the
wallpaper contributes 14% of the surface. The blur has nothing left to act on, so the
card is opaque paint wearing a glass label — which is exactly the "flat" the member
kept reporting, and exactly why raising the fill weight made it worse rather than
better.

The lever that works is the one *underneath*: **darken the backdrop and leave the alpha
alone.** At the shipped alpha of 0.28 a card over a dark field resolves to about 46,
where white ink clears 15:1, and the surface is still 72% backdrop — genuinely
translucent, genuinely blurred, with the artwork showing through at just under a fifth.

### What changed

| | before | after |
|---|---|---|
| page backdrop | `rgba(250,248,247,0.10)` over a pale screen | `rgba(16,18,22,0.82)` over `#0E1014` |
| `TINTS.white` | `57,57,57` | `14,14,14` |
| `TINTS.sky` | `50,50,85` | `8,34,78` |
| text ramp | `#1C1B19 / #2B2A27 / #45433F` (dark) | `#FFFFFF / #F2F3F5 / #B9BEC4` (light) |
| accent | `#2B6C8F` as ink | `#2B6C8F` as *fill*, `#7FC0E8` as ink |
| tab pill ink | one black label | one white label |
| quiet tab ink | `#606060 / #464646` | `#C8C8C8 / #BDC8D6` |
| ambient field | pale washes, alpha 0.18–0.22 | dark pools, alpha 0.36–0.42 |
| section accents | dark inks on pale tiles | light inks on the same tiles |
| `CHAT_NIGHT` | pale bubbles, dark ink | faint lifts, white ink; outgoing bubble takes the accent |

784 ink declarations and 473 field fills were converted in one pass, hue-preserving:
each dark ink was inverted to a light one at the same *relative* weight, so the
typographic hierarchy survived the flip rather than flattening onto one grey.

### The catch that the tests found, twice

The `AMBIENT_ALPHA_CAP` clamp sat at 0.30 while the new pools run to 0.42. The clamp is
what stops the field pushing the ink below AA — but when the base already exceeds it, the
clamp silently flattens every section onto one alpha, which is the precise failure its
own comment warns about. It is now 0.50, above the richest pool, and the coupling is
asserted.

The same shape appeared in the swatch rim: it was a *darkened* version of the chip,
which was right when chips were pale and wrong once they were deep — a dark chip
vanishing into dark glass. It is now a *lit* version of the same hue.

### Verified

TypeScript clean; **1031 tests pass** with 1 pre-existing skip across 69 files; lint 0
errors and the same 28 pre-existing warnings; `git diff --check` clean; both bundle
routes serve HTTP 200. Measured in the running app rather than inferred: page
luminance **0.076**, chat-row fill **0.076–0.199** carrying the blue field, white
heading ink at **15.1:1** on the card and the quiet tier at **5.3:1**.

### The tests were rewritten, not weakened

Every floor moved with the surface rather than being lowered to fit. The contrast card
became the *lightest* dark card (64,67,72) — the worst case for white ink, exactly as
the darkest pale card was the worst case for dark ink. The pill's worst-case backdrop
flipped from the darkest field to the brightest. The inactive-ink helper now measures
the bar where it lands over the field instead of over a page it no longer sits on. One
guard was exempted by *name* rather than by rule: `backgroundWash` is the page, not a
surface, and it is the value the whole system is built on — so the next surface that
tries to look like it is still caught.

---

## The structural error: the cards were lighter than the page

### What was wrong, stated plainly

Three passes in a row produced "this still doesn't look like frosted glass". The
numbers were all defensible and the tests were all green, because the tests were
measuring the wrong relationship. Sampling the two supplied references against the
device render settles it:

| | page | cards | heading ink |
|---|---|---|---|
| reference B (monochrome) | `#F1F1F1`–`#FDFDFB` | `#303030`–`#4C4E4D` | **black on the page** |
| reference A (sky blue) | `#DCE0E3`–`#EDF0F5` | `#6FABDD` | **black on the page** |
| what the app rendered | `#616C80` | `#8AA2BA` | white everywhere |

**In both references the cards are darker than the page.** The app had them *lighter*
than the page, and the page itself was mid-grey. There was no separation between
pane and ground, so nothing could read as a pane — which is why it looked like mud
regardless of how carefully the alphas were tuned.

### The root cause, which the tests could not see

`tests/text-contrast.test.ts` modelled exactly one surface: `CARD`. Every one of the
784 ink declarations was measured against it. So the suite could certify that white
ink was legible on dark glass while the app had black headings on a bare page at
**1.9:1** — and it did, for three passes. A single-surface model cannot describe a
two-ground design, and this design has two grounds: the artwork, and the glass.

The second half of the same blind spot: the reference's page headings are *black*.
When they were measured against a card they failed, and the "fix" the suite pushed
toward was to lighten them — the exact opposite of the reference.

### The repair

The structure is now the reference's:

- **the page is the artwork**, nearly unwashed (`rgba(255,255,255,0.12)`), with black
  headings (`#141310`, `#1C1B19`, `#3A3833`) sitting directly on it
- **the glass is dark** — a neutral charcoal for the shipped cast, a deep sky blue
  for the option — and it carries white ink
- `TINTS.white` is `40,40,40`, genuinely achromatic; a three-point cool bias reads as
  a deliberate tint at card size and as a mistake on a bar
- the **active pill** now derives from the section's *field* rather than its
  empty-state tile. The tile inverted with the glass and became a pale wash, and a
  pill derived from a pale wash over a bright page comes out pale — the one thing an
  active control must not be. Solved to 5.5:1 for white ink.
- the **field is two tables**: the shipped cast's pools are achromatic at 0.24–0.36,
  because a blue wash under a monochrome interface is the mixing that was rejected;
  the sky cast keeps the sections' hues at their original strength. A single shifted
  table could not do this — rotating a neutral grey returns a grey.
- the **veil** dropped from 0.34 to 0.07. At 0.34 a light sheen lifted a dark card to
  mid-grey with no depth left; the reference's highlight is the bright rim and the top
  glow, both drawn separately.

### The tests were extended, not weakened

Every floor moved with its surface. Two changes are substantive:

1. A **second ground** was added to the contrast suite. `PAGE_LEVEL_STYLES` names the
   five headings that render on the artwork, and a new assertion holds them to 4.5:1
   against `PAGE = [250,250,251]`. It fails if a heading is ever lightened to satisfy
   the card test — the failure mode that produced three wasted passes.
2. The field test now asserts **two casts with two jobs**: the neutral field on
   strength and neutrality (and that its three pools differ, so it is a composition
   rather than a flat wash), the coloured field on hue and its original strength.

### Verified

TypeScript clean; **1032 tests pass** with 1 pre-existing skip across 69 files; lint 0
errors and the same 28 pre-existing warnings; `git diff --check` clean; the Metro
bundle serves HTTP 200. Measured in the running app: **page luminance 0.847–0.880,
cards 0.070–0.089** — a 10:1 separation in the direction the reference uses, where the
previous build had the cards *lighter* than the page.

---

## The pale surfaces: the resolver trusted its callers

### The report

Groups, Hangouts and the Chats suggestion cards came back from the device with light
glass and white type on it — unreadable. Chat rows, the bottom bar and the premium
strip were correct, so it was not the whole material.

### The cause

Two resolver paths can leave a surface light while the ink on it is white:

1. A **neutral** declared fill was pulled toward its cast by `neutralMixFor`, which was
   calibrated when the cast was a faint wash over a pale page. With the cast now the
   pane itself, a declared near-white landed part-way — light enough that the white
   label on it disappeared. The mix is now 1: the cast *is* the surface.
2. A **saturated** declared fill was passed through with only a low alpha, so a tinted
   fill at 0.34 composited to something close to the page. The guard that exists to stop
   exactly this measured the declared colour rather than the colour the surface actually
   *lands* on — so `rgba(150,200,240,0.34)` looked adequate as a value and was nearly
   white once composited. It measured 2.78:1.

### The repair

`darkenToInkFloor` now bisects on the **landed** colour — `alpha * fill + (1-alpha) *
page` — and pulls the surface down until white ink clears AA on the result, with margin
(0.175 luminance, which measures 4.71:1, rather than the exact 4.5 crossing at 0.184,
so a channel rounding the wrong way cannot push it back under). Both resolvers apply it.

The distinction that matters is **pane versus accent**, and it is the same chroma test
the resolver already used: a neutral fill is a pane and takes the cast, then the floor;
a saturated fill is an action button, a badge or a shared card and keeps its own hue.
Applying the floor to accents as well was my first attempt and it failed six tests —
correctly, because darkening an accent washes it into the surface.

A second defect fell out of the probe: `AMBIENT_ALPHA_CAP` was set to 0.38 while the
sections' own bases ran to 0.45, so **Hangouts and Bizz were silently clipped onto a
single value** and rendered identically. The cap is now 0.52, above the bases, and all
five sections differ again.

### Verified

Measured across **every surface class, both casts, four opacity settings, both the
frozen and the live-resolved fill**: the worst white-ink contrast anywhere is **4.67:1**
and no combination falls below AA. TypeScript clean; 1032 tests pass with 1 pre-existing
skip; lint 0 errors and the same 28 pre-existing warnings; `git diff --check` clean;
bundle HTTP 200.

## The pass that removed the inner rim, lifted the outer one, and gave the surfaces a grain

### The inner rim was removed, and the outer one had to be lifted to compensate

The member asked for the inner hairline to go from everywhere it appeared. It had been
built deliberately, because the reference samples genuinely show *two* lines — a bright
outer edge with a cast-coloured hairline a few pixels inside it — and the reasoning that
the pair reads as the ground edge of a sheet of glass is sound. The measurement was not:
at this app's card sizes the two lines land a pixel or two apart, which the eye reads as
one slightly muddy edge, or on a small surface as a double outline.

**Removing it is not a one-line deletion, and this is the part worth recording.** The
outer rim's strengths were tuned to sit *under* the inner hairline, which was the
stronger of the two. Deleting the hairline and leaving the rim as it was would have left
the app with no visible edge at all. Every strength was therefore lifted by roughly the
third the removed line was contributing — card and bar to full opacity, and the smaller
surfaces to within a tenth of them — so a card reads at the same edge strength as before
with one line instead of two.

Four sites carried a hairline, not one: the shared `GlassSurface`, the welcome panel, the
chat rows, **and the bottom bar**, which had its own copy rather than going through
`GlassSurface`. The bar's was the one that would have been missed by reading the
component and assuming it covered everything, and a test now walks every file that paints
a glass surface to catch exactly that class of second implementation.

The pair survives in one place: the appearance picker's edge sample, where it is drawn at
four times life size and the two lines are far enough apart to read as thickness. That is
the only scale at which the original reasoning holds.

### The outer rim sits elevated because the shadow was raised, not because the line changed

The member asked for the outer rim to be "little elevated". A single line cannot express
height on its own — what says *this surface is above that one* is the shadow it drops.
`GLASS_SHADOW_OPACITY` moved 0.30 → 0.42, which is the point where the lift is legible
over the artwork without the card appearing to float free of the page.

### The grain: the layer that was actually missing

A frosted pane rendered as a single flat fill reads as a painted rectangle however good
its colour is. Real frosted glass has *tooth* — a fine surface texture that catches light
unevenly — and that tooth is most of what tells the eye it is looking at a material
rather than at a tint. The reference samples have it. This app's surfaces did not, which
is the difference between "translucent card" and "frosted glass" that the member kept
pointing at across many passes.

`components/glass-texture.tsx` is that layer, and it is built from **real vector geometry
rather than a raster tile**: a raster PNG would need one asset per density, would blur
when scaled, and would sit at a fixed pixel size on a 3x screen. It is a cross-hatch of
two hairlines at 45° and 135°, which tiles seamlessly, costs nothing, and gives the same
fine tooth at the scale a card is read at. `feTurbulence` would have been the obvious
alternative and is not implemented on every platform this app runs on.

The ink is a hairline of the member's own cast rather than black or white, so the grain
belongs to the glass rather than sitting on top of it. Its alpha is bounded on both sides
by test: enough to register as tooth, never enough to compete with a label.

**Measured on the rendered screen**, adjacent-pixel step (the high-frequency content):

| surface | adjacent-pixel step, mean | p95 |
|---|---|---|
| the glass panel | **3.807** | 8.67 |
| the page beside it | 0.228 | 1.33 |

That is **17× the page's high-frequency content** on the glass and almost none on the
page — the tooth is unambiguously present on the surfaces and absent from the backdrop,
which is exactly what the layer exists to do. It is within the alpha ceiling, so it reads
as material rather than as a visible grid.

### The palette was dull because an exactly neutral grey has no light in it

The neutral cast went through a strictly-neutral phase at `rgb(221,221,221)`, on the
argument that the word "White" should mean an achromatic pane. On the device that
argument lost: an exactly neutral grey over a warm off-white page reads as *dull*, because
there is no colour in it for the light to have come from. That is a property of the
material rather than a preference.

It is now `rgb(226,222,216)` — a spread of 6, amber over blue — which is the least that
reads as light rather than as grey while still reading as "White" beside the sky cast. It
is at the **same luminance** as the neutral it replaces, so the depth every other value
was calibrated against is untouched and only the temperature moves.

### Two square-cornered surfaces, found by scanning the render rather than by reading the code

Scanning the live DOM for surfaces with a zero top-left radius found two, and neither was
where reading the styles would have suggested:

- **The swipe actions** (mute and archive). `borderRadius: 11` on a 44pt-tall target
  measures as a square at the size these render, and they are the two controls the member
  reaches for most often inside a row. They are now pills — the radius is half the height,
  so the shape is round by construction rather than by a number that can drift out of step
  with the size.
- **The bottom bar**, which was square at the top and read as a slab with a lid rather
  than as the floating pane the rest of the app is made of. It is now rounded at the top
  corners only, which is what makes the content look like it slides under it.

### The log-out hang

Signing out left the member looking at "Back to your conversations / A little closer, one
moment." over the welcome screen, with no way forward.

The overlay is dismissed from the section-change animation's completion callback, and that
callback only clears the flag when the animation reports `finished`. A state change as
large as a sign-out interrupts the animation, so the callback runs with `finished ===
false`, neither branch fires, and the flag stays set over a screen that has nothing to do
with it. Two fixes, because the flag should not depend on an animation at all:

1. `signOut` clears the flag **synchronously**, so signing out cannot leave a spinner
   behind whatever the animation does.
2. A **1200ms failsafe** clears it regardless. The normal handoff finishes in about 520ms
   (340ms of motion plus a 180ms beat), so it is never reached in ordinary use and only
   covers the case where the callback did not run at all.

Verified on the rendered app: after signing out, the overlay text is absent and the
welcome controls are present.

## The inversion: what was actually wrong, after many passes

Read the two references as *values* rather than as pictures and one thing is constant,
and it had never been built:

| | page | card | card : page |
|---|---|---|---|
| sky sample | rgb(233,239,245) | rgb(132,186,222) | **1.80 : 1** |
| monochrome sample | rgb(241,241,241) | rgb(48,48,48) | **10.6 : 1** |
| **this app, as it was** | rgb(212,209,205) | rgb(226,222,217) | **0.88 : 1** |

The card was *lighter* than the page. A pane lighter than the ground is not a pane: there
is no separation to read, so every surface came out the same tone as the wallpaper and
the whole screen read grey. That is the dullness that was reported again and again, and
this is why retuning the pale values never fixed it - the direction was wrong, not the
amount. Light comes from the page *through* the glass, so the glass is the shadowed side
of the sheet and the ink on it is white.

**The model, inverted.** `TINTS.white` is now matte charcoal rgb(62,60,58); `sky` is
rgb(40,48,62). Measured on the rendered panel it lands at lum 0.099 against a page of
0.290 - a 2.9:1 step, in the right direction. `TEXT_ON_GLASS` is white, the cast's quiet
tab ink is white, and the ink-floor guard now solves *downward* (it was `lightenToInkFloor`,
solving for dark ink on a pale pane; the mechanism is unchanged - the landed colour is what
gets measured, never the declared one - but the direction is toward black).

**Matte, not brown.** The first charcoal carried an eleven-point warm lean so the glass
would "belong to the warm artwork". On a large panel that spread reads as **brown**. The
reference's charcoal is dead neutral (r-b = 0); the shipped value leans two points, which
is too little to read as a colour. Freshness comes from the neutral and the light page, not
from tinting the pane.

**Light-on-light, the systemic fault.** 696 ink values were dark on what is now dark glass.
Rather than invert by guesswork, the scanner's card constant was pointed at the *real*
rendered card (`[74,72,70]` instead of a pale `[232,229,235]`) so it could enumerate the
work, and the page-level styles - the headings that sit on the artwork - were restored to
dark individually. The scanner had two bugs of its own, both found by this pass:

* it took the worse of a fill's declared and landed colour for *every* fill, which is right
  for a translucent one and wrong for an opaque chip - a solid light island must be judged
  on its actual colour. The rule is now conditional on alpha.
* it read the style table with a line-anchored pattern, so a style declaring two
  properties on one line had its second value missed entirely.

Finally, an audit of every opaque light fill carrying white text returned **zero**; the
welcome screen's two buttons, its slide tiles and its company panel were the last, and the
primary action now takes the solid brand mauve because two identical outlined pills gave
the member no hierarchy.

## Two defects found by looking rather than by testing

* **The incoming-requests panel rendered twice.** A straight duplicated JSX line, present
  in the previous checkpoint, which is why the pending request appeared once directly under
  "RECENT CHATS" and again in a panel further down.
* **The interest chips rendered as five tall boxes.** A horizontal `ScrollView` stretches
  its content along the cross axis and lets a child with the default `flexGrow` take an
  equal share of the main axis, so five one-word labels became five empty rectangles.
  `flexGrow: 0` + `alignSelf: center` pins each chip to its own text.

## The glow, measured down three times

`glassTopGlow` was 0.46, correct when it lit a pale pane. Over a dark face a light pool
that covers a third of the surface is not a highlight, it is the face: it lifted the
welcome panel from charcoal to a muddy grey. 0.46 -> 0.20 -> 0.09, where the panel's top
edge lifts by about four points of value - visible as light along the edge rather than as a
different surface. The sheen cap came down with it (0.07 -> 0.05) for the same reason: it
covers the whole face, so even a small alpha is a wash on dark. `BASE_ALPHA` stayed at 0.70
deliberately - 0.76 filled the nesting band's headroom and a row inside a sheet then landed
on the sheet's own alpha, which is the flat-panel defect the band exists to prevent.

Validation: TypeScript clean, **1038 tests pass** with 1 pre-existing skip across 69 files,
lint 0 errors (28 pre-existing warnings), `git diff --check` clean, web bundle HTTP 200.

### The grey wash and the invisible text: both were the same mistake in two places

The member reported three things on the welcome screen - unreadable text, a white glow, and a
card that should be more transparent - and one on every screen: cards that still did not look
like frosted glass. Two of these were real defects with one cause between them, and one was a
layer that should never have been on a dark pane.

**The panel was a mid-grey, and the glow was why.** Measured down the centre of the member's
own screenshot, the panel read rgb(155,155,155) where an 82% charcoal fill composites to about
110 over that page. Profiling the whole column made the shape of it obvious: the *bottom*
card, which carries the same fill and no glow, read about 130, and the top of the panel was
lighter than its bottom. The top glow was a pool of light along the upper edge, and at 0.46
it was lifting the entire surface. It had already been halved twice (0.46 -> 0.20 -> 0.09) and
had never become right, which is the signal that the layer is wrong rather than too strong: on
a dark pane there is no bright edge to catch, so a light pool is light *in* the surface rather
than light *on* it. It is retired, and the edge is carried by the opaque outer rim. The panel
now measures 87,85,81 against a 250 page - a 7.1:1 separation, and the heading on it clears
5.5:1.

**The blur was adding light on Android, which is the native half of the web bug fixed in
6ca0ea03.** The same 155 reading had a second contributor. expo-blur's Android view
(`ExpoBlurView.kt`) draws its blurred backdrop *over* the view's background, and for the
DEFAULT tint that backdrop is `rgba(255,255,255, 0.44 * intensity/100)` - a white film at 0.185
for this app's intensity. Our fill was therefore being diluted by a white overlay nobody asked
for, and because iOS composites the other way round this read as an Android-only difference in
depth. The fill now renders as a sibling *behind* the BlurView and the native tint is `dark`,
so the overlay is the shadowed counterpart of the charcoal glass. Both the layer order and the
tint are asserted, because either one alone leaves the white film in place - the first attempt
at this fix moved the fill and left the tint, which would not have changed anything on device.

**The text that was invisible was on the page, not on the panel.** The carousel titles, the
slide bodies and the swipe hint were white, which over this artwork is about 1.0:1 - not faint,
invisible. The rule is that anything outside a pane takes the page's ink and only what sits on
a pane takes the white one; the page ramp is now a named pair so a page-level style cannot
drift back by being copied from a card-level one. Measured after: slide ink 34,33,31 on a
226 ground, 12.4:1. The slide tiles were the same error in the other direction - a pale pastel
with a white glyph, white on #E4EFF5 at 1.1:1 - and are now panes like every other surface.

**The 2D texture.** Three attempts at this are worth recording, because two failed for the
same reason. A 24pt diagonal mesh was read, correctly, as "wired fencing": a texture the member
can name is a pattern, not a material. A 5pt diagonal hairline crossed in both directions was
still a mesh at a finer scale. What is on the surface now is grain - three irregular pinpricks
repeating on a 13pt cadence at a 0.035-alpha cap, which moves a pixel by less than a point. It
is drawn over the blur and under the content, in the member's own cast, and it is applied by
the shared `GlassSurface` primitive so every card, chip, sheet and row gets it without asking.
The contract pins the cadence from both sides (a mesh above, banding below) and forbids the
tooth being built from lines at all.

**One stray colour.** The web build renders a link as a real `<a>`, and an `<a>` with no colour
of its own takes the user agent's platform blue. `global.css` now sets `color: inherit` on
anchors, which is the correct answer rather than a value: the right ink depends on whether the
link sits on a pane or on the page, and inherit is exactly that.

Validation: TypeScript clean; 1041 tests pass with 1 pre-existing skip across 69 files; lint 0
errors and the 28 pre-existing warnings; `git diff --check` clean; the Metro bundle serves HTTP
200 with the tooth compiled in.

## The sign-in flow: why it was unreadable, and why OTP appeared to stop working

Two defects, both of which made signing in impossible rather than merely ugly.

**The sheet was an opaque slab.** `modalSafe` declared `backgroundColor: "#C6C4C1"`, and
every ink inside the flow is the light pane ink `#F5F5F7` — so the title, the labels, the
field values and the footer all sat at roughly **1.5:1**. Measured in the running app, the
title was `rgb(245,245,247)` on a ground of `rgb(198,196,193)`. The slab also carried no
blur, no rim and no sheen, so the largest surface in the app was the one place the glass
recipe had never been applied — while the welcome panel one tap away was built properly.

The fix moves the fill onto a card (`modalCard`) and leaves the sheet transparent, so the
artwork shows through. The header takes the page ink ramp (`#141310` / `#2B2A27`) because it
now genuinely sits on the artwork, and the card takes the same light pane ink as before
because it is a dark pane. That is why two different grounds can share an ink.

The one part that is *not* the sign-in flow — the photo and about steps — keeps an opaque
ground (`modalBodyCard`), because it was laid out as a form screen and its own inks were
solved against a slab. Only the sign-in flow is a pane.

**The demo code was announced but never shown.** `demoCode` was set from the response and
then only interpolated into a transient notice; it was rendered nowhere on the code screen
(`grep -c demoCode` over the code step returned 0). With no SMS or mail provider connected
that code is the *only* code that exists, so a member who looked away for four seconds could
not finish signing in — and could not ask for it again, because the resend button only
produces another code they also cannot read. It is now rendered in the pane, large, with the
reason stated. `openSignup` still clears it, so a fresh sign-in does not show a stale code.

Verified end to end rather than by inspection: the full email path was driven in the browser
from the welcome screen through the code step to landing on Chats, with the code read off the
screen (`042100`) and accepted.

## The square corners and the opaque toggles (2026-10-02)

Two defects the member photographed on a real Android device. Neither was a wrong
colour; both were wrong *paint*, which is why every colour-level test passed while the
screen looked broken.

**The square corners were Android's shadow.** `elevation` is not a blur. The platform
draws it as its own shape behind the view, so at the app's radii it rendered as a pure
black 1px rim standing proud of every card on all four sides, with square corners — the
"wired fencing" in the screenshot. It existed in 27 places in the main screen and 44
across the components, and it had been added at the same time as the iOS shadow without
the platform difference being considered. All 71 are gone; iOS keeps `shadowRadius`,
which is a real blur and is clipped to the radius.

**The near-black hairlines.** `borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)")` was
used as a generic divider on the welcome panel, every modal sheet and every inner row.
A black border at low alpha lands *darker* than the glass it encloses, so on a card at
the top of its alpha range it read as a drawn outline rather than an edge. 79 of them
now resolve through `glassFieldBorder()`, which is the groove resolver and knows the
card it sits in; the active tab pill was the one that should be *lit* rather than
grooved, and now uses `glassEdge("tab")`.

**The toggles were opaque.** The switch tracks were declared at
`rgba(214, 210, 216, 0.92)` and `rgba(142, 111, 145, 0.95)` — a painted bar, whatever it
sat on was invisible through it. These were declared as *opaque* values during the
light-glass pass and never revisited when the system inverted to dark panes over a light
page. Now `rgba(198, 196, 204, 0.42)` and `rgba(142, 111, 145, 0.66)`: the card shows
through, state is carried by hue as well as by position, and the "on" track still
measures 2.4:1 against a card so the control remains a visible object.

**One wrong file against the design.** `tabIconActive` was `rgba(255, 255, 255, 0.55)`
— a light pill, left from the light-glass pass. It was also the only groove border that
was genuinely inside a `GlassSurface`, so it was overriding the shared lit rim. It is now
over the cast, with the shared rim restored.

Two source-level guards were added, because these defects are only visible at the level
of "what property, on what platform" and no resolved-value assertion can catch them: no
`elevation:` may appear in any component or screen, and no `borderColor` may be declared
as a raw low-alpha black.

---

## The OTP lockout, and why the login card was opaque

Two reports arrived together and they turned out to be independent.

### "login is not happening, no OTP is generated"

Not a delivery problem. The endpoint answered correctly and the code was issued
— the member's own number was being *refused* before a code was ever minted.

The refusal was `destination-long`: six codes already spent against that number
inside the daily window, accumulated naturally while the sign-in screen was being
built and tested. The bypass for this existed and passed the right flag, but the
flag was computed *after* `decideSend` had already run, so it never reached the
decision. `freeSend` was always false and the per-destination caps always applied.

What made it worse than a normal rate limit was the wording. The server returned
the honest wait — 86,400 seconds — and the client turned it into a button
counting down from a day, which reads as "about to reopen" when the real answer
is "tomorrow". A member in that state concludes the feature is broken, which is
exactly what was reported.

Both halves are fixed:

- `decideSend` now exempts only the cost-bearing rules when nothing can actually
  deliver a code — the resend cooldown and the per-number hourly and daily caps.
  The *caller* ceilings stay in force, and that distinction is deliberate: those
  are what stop one device minting codes for a thousand numbers, and exempting
  them would have reopened the endpoint the guard was written to close. Both
  halves are asserted, including that a device that has spent its day is still
  refused.
- A wait longer than an hour is now stated as a limit rather than counted down,
  and points at the one thing that does work, since the limit is per number.

Verified end to end against the live database: request → verify → session issued,
returning the member's own account.

### The login card would not become transparent

The member asked twice for this sheet to be see-through and both attempts changed
nothing. The reason is a floor, not a bug: `glassSurfaceColor` treats any declared
alpha below 0.6 as wanting no extra presence, then clamps the result up to
`BASE_ALPHA`. Every "lighter" value therefore resolved to the same 0.80 — the
heaviest surface in the app, on the one screen whose whole point is the artwork.

A floor is the right behaviour for a card: a card must sit distinctly above the
page, and a quieter declared alpha must not erode that. It is the wrong behaviour
for a sheet, which has the opposite job — it frames artwork that is the subject,
so at a card's depth it stops being a frame and becomes a dark screen with a
picture faintly behind it. That is a different question, so it gets a different
entry point rather than a loosened floor: `glassSheetFill`, which starts one
measured step below the card weight. The ink floor still runs unconditionally, so
transparency can never cost legibility — if the lower alpha would leave white type
short of AA over the artwork, the pane's colour is taken down until it clears.

Measured in the running app: the sign-in card went from `rgba(62,60,58,0.80)` to
`rgba(62,60,58,0.57)`, and it now responds to the member's weight setting instead
of being frozen at one value.

Counts for this pass: TypeScript clean; 1051 tests pass with 1 pre-existing skip
across 68 files; lint 0 errors and the 28 pre-existing warnings; `git diff --check`
clean; the web bundle compiles at 11.4 MB with the new resolver in it.
