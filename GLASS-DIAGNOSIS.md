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