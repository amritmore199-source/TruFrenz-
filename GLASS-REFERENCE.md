# Glass reference measurements

Values read directly out of the member's supplied reference images with PIL, not
eyeballed. Kept because every "the glass looks flat" report traced back to one of
these numbers being wrong somewhere in the app.

## Source images

| File | What it is |
|------|------------|
| `537501.jpg` | Sky-blue app mockup, phone at an angle |
| `537502.jpg` | Monochrome app mockup, phone at an angle |
| `535235.png` | Lemon spritzer glass card, 1408x768 |
| `535236.png` | Sky blue spritzer glass card, 1408x768 — **the clearest single sample** |

## The card structure (from `535236.png`)

Traced by walking a horizontal line across the card at `y=200` and a vertical line
down its centre at `x=704`.

| Band | Width | Value | What it is |
|------|-------|-------|------------|
| outside | ~10px | `rgb(224,225,227)` | the drop shadow, fading to a `rgb(255,255,255)` studio background |
| outer rim | 1–2px | `rgb(255,238,255)` | near-white, effectively pure white |
| gap | ~15px | `rgb(206,232,247)` | pale, cool |
| **inner hairline** | ~5px | `rgb(141,200,232)` | **bright saturated sky blue** — the accent |
| inner edge | ~3px | `rgb(203,232,246)` | pale again |
| face | — | `rgb(212,225,233)` | pale blue-grey |

### The single most important reading

> The inner hairline (`rgb(141,200,232)`) is **232−141 = 91 units more saturated**
> than the face behind it (`rgb(212,225,233)`, spread 21).

The hairline carries the accent. The face does not. A card whose two rim lines are
both near-white has no double rim — it has one edge drawn twice, which is what this
app shipped and what the member kept reporting.

## Depth

Both casts are fitted to the **same luminance** so choosing between them changes
temperature and never depth:

| Cast | Value | Luminance |
|------|-------|-----------|
| White (default) | `rgb(221,221,221)` | 0.7263 |
| Sky | `rgb(206,216,228)` | ~0.726 |

The neutral cast is **achromatic**. It was `rgb(224,220,228)` — spread 8, a
mauve-tinted grey — which is a third hue rather than a neutral, and made the
White/Sky choice read as neither.

## The five layers

Every surface must carry all five. A surface with only the first two renders as a
flat tinted rectangle and passes every colour check, because the *tint* is real and
it is the *layers* that are missing. This fault arrived three times in three places:
the welcome panel, the chat rows, the search field.

1. **Blur** — `GlassBlur`, which on web is a plain View carrying `backdrop-filter`
   (RN Web emits the `-webkit-` prefix itself), and on native is `expo-blur` with
   `tint="default"`.
2. **Cast** — `glassTint(surface, opacity, cast)`.
3. **Sheen** — `glassVeil(...)`. Must be **lighter** than the pane or it is a
   shadow. It was `rgb(190,190,190)`, a leftover from the dark-glass pass, and over
   a pale cast it darkened the surface by 12 per channel.
4. **Top glow** — `GlassGlow`, a **radial SVG gradient**. A View is a rectangle, so
   a solid band of light ends in a step: measured 20 per channel across the middle
   of the welcome panel. The gradient ramps `0.46 → 0.19 → 0`, and the ellipse is
   more than twice as wide as it is tall so the light falls away at the upper
   corners rather than forming a circular hotspot.
5. **Double rim** — outer from `glassEdge()`, inner hairline from `glassInnerRim()`
   inset `GLASS_RIM_INNER_INSET`. The inset is **2pt**: at 4pt the two lines read as
   separate rules with a gap, and in the samples they sit 1–1.5px apart at phone
   scale, closer than either line is thick.

## Floors, solved rather than chosen

| Element | Floor | Solved value |
|---------|-------|--------------|
| Body ink on the card | 4.5:1 | `#4B4651` at 10.0:1 |
| Secondary ink | 4.5:1 | `#666070` at 5.7:1 |
| A control's boundary | 3:1 | mauve **fully opaque** — 3.01:1 at 1.0, 2.65:1 at 0.9 |
| Icon on the bar | 3:1 | per cast |
| Quiet label on the bar | 4.5:1 | per cast |
| Dividers | 1.7:1 | they separate rather than identify |

**A translucent face can never carry 3:1.** Over the welcome panel the best a white
face reaches is 1.30:1 at alpha 0.7. That is why a ghost button is defined by its
outline and not its body — and why the Log In button, with its outline at 1.76:1,
dissolved where the curve met the straight edge and read to the member as
"rounded corners as well as square corners".

## Where these live in code

- `lib/glass.ts` — casts, alpha model, resolver, edge, hairline, veil, glow colour
- `components/glass-blur.tsx` — the blur layer
- `components/glass-glow.tsx` — the radial glow
- `components/glass-surface.tsx` — the recipe, assembled
- `tests/glass-structure.test.ts` — guards the recipe and the double rim
- `tests/glass-night.test.ts` — guards the contrast floors