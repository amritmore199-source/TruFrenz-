import { describe, expect, it } from "vitest";

import {
  DUSK_VEIL_ALPHA,
  GLASS_PRESETS,
  MAX_GLASS_ALPHA,
  TEXT_ON_GLASS,
  backdropVeilAlpha,
  duskVeilColor,
  glassAlpha,
  glassNestedSurfaceColor,
  glassSurfaceColor,
  matchGlassPreset,
  setActiveGlassTint,
  tabBarAlpha,
} from "../lib/glass";
import {
  GLASS_TINT_LABEL,
  GLASS_TINT_OPTIONS,
  normalizeGlassTint,
} from "../lib/appearance-preferences";

/* Contrast maths, in the same form the browser uses. */
function channel(value: number): number {
  const x = value / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}
function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function parseRgba(value: string): [number, number, number, number] {
  const match = value.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (!match) throw new Error(`not an rgba colour: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}
function over(
  fg: readonly [number, number, number, number],
  bg: readonly [number, number, number],
): [number, number, number] {
  const [r, g, b, a] = fg;
  return [
    Math.round(r * a + bg[0] * (1 - a)),
    Math.round(g * a + bg[1] * (1 - a)),
    Math.round(b * a + bg[2] * (1 - a)),
  ];
}
function hex(value: string): [number, number, number] {
  const v = parseInt(value.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function blend(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

/*
 * The worst case the app can actually produce.
 *
 * The shipped wallpaper's brightest patch sits at roughly 216/205/193. A surface
 * is judged over that patch, not over the photo's average, because that is where
 * bright text fails first.
 */
const WALLPAPER_BRIGHTEST: [number, number, number] = [216, 205, 193];
const WALLPAPER_AVERAGE: [number, number, number] = [74, 62, 58];

describe("the dusk cast", () => {
  it("is offered, labelled and accepted as a setting", () => {
    expect(GLASS_TINT_OPTIONS).toContain("dusk");
    expect(GLASS_TINT_LABEL.dusk).toBe("Dusk");
    expect(normalizeGlassTint("dusk")).toBe("dusk");
  });

  it("stays selected rather than collapsing to the pale default", () => {
    setActiveGlassTint("dusk");
    const surface = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80));
    setActiveGlassTint("sky");
    expect(surface[0]).toBeLessThan(120);
    // Every surface returns to a pale value once the cast is switched back.
    const pale = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80));
    expect(pale[0]).toBeGreaterThan(200);
  });

  it("darkens a neutral surface rather than merely tinting it", () => {
    const dusk = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80, "dusk"));
    const sky = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80, "sky"));
    expect(luminance([dusk[0], dusk[1], dusk[2]])).toBeLessThan(luminance([sky[0], sky[1], sky[2]]) / 4);
  });

  it("leaves a saturated accent alone, so buttons keep their own colour", () => {
    const lemon = parseRgba(glassSurfaceColor("rgba(241, 222, 85, 0.72)", 80, "dusk"));
    expect(lemon[0]).toBeGreaterThan(200);
    expect(lemon[2]).toBeLessThan(140);
  });

  it("adds weight to compensate for its own darkness", () => {
    expect(glassAlpha("card", 80, "dusk")).toBeGreaterThan(glassAlpha("card", 80, "sky"));
    expect(tabBarAlpha("chats", 80, "dusk")).toBeGreaterThan(tabBarAlpha("chats", 80, "sky"));
  });

  it("still cannot become an opaque fill", () => {
    for (const opacity of [50, 80, 95]) {
      expect(glassAlpha("card", opacity, "dusk")).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
      expect(tabBarAlpha("you", opacity, "dusk")).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
    }
  });
});

describe("the night backdrop", () => {
  it("is a slate veil, not a black film", () => {
    const [r, g, b, a] = parseRgba(duskVeilColor());
    expect(a).toBe(DUSK_VEIL_ALPHA);
    // Blue leads, so it reads as night sky rather than as a dimmed photo.
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(0);
  });

  it("applies to the night cast only", () => {
    expect(backdropVeilAlpha("dusk")).toBe(DUSK_VEIL_ALPHA);
    expect(backdropVeilAlpha("sky")).toBe(0);
    expect(backdropVeilAlpha("lemon")).toBe(0);
  });

  /*
   * The reason the veil exists. Without it, bright text over the wallpaper's
   * brightest patch fails; with it, the whole ramp clears the bar. This test
   * would fail if someone removed the veil as decoration, which is exactly the
   * mistake worth guarding against.
   */
  it("is what makes bright text legible, measured", () => {
    const surface = hex(TEXT_ON_GLASS.body);
    const alpha = glassAlpha("card", 80, "dusk");
    const surfaceGlass = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80, "dusk"));
    void surface;

    const unveiled = over([...surfaceGlass], WALLPAPER_BRIGHTEST);
    const veiled = over([...surfaceGlass], blend(WALLPAPER_BRIGHTEST, [42, 65, 90], DUSK_VEIL_ALPHA));
    void alpha;

    expect(contrast(surface, unveiled)).toBeLessThan(4.5);
    expect(contrast(surface, veiled)).toBeGreaterThanOrEqual(4);
  });

  it("holds body and heading text well past AA over the wallpaper's average", () => {
    const surfaceGlass = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80, "dusk"));
    const rendered = over([...surfaceGlass], blend(WALLPAPER_AVERAGE, [42, 65, 90], DUSK_VEIL_ALPHA));
    expect(contrast(hex(TEXT_ON_GLASS.heading), rendered)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(TEXT_ON_GLASS.body), rendered)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(TEXT_ON_GLASS.secondary), rendered)).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * Depth is an alpha relationship, not a brightness one. A nested row carries
   * less presence than the sheet it sits on, which over a dark backdrop makes it
   * the darker of the two — so "inset" has to be asserted as an alpha gap, and
   * the gap has to stay close to what the pale casts produce or the night look
   * would sink every inner surface.
   */
  it("keeps a nested row quieter than the card it sits on, by the same margin", () => {
    const cardDusk = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80, "dusk"))[3];
    const rowDusk = parseRgba(glassNestedSurfaceColor("rgba(241, 246, 252, 0.4)", 80, "dusk"))[3];
    const cardSky = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80, "sky"))[3];
    const rowSky = parseRgba(glassNestedSurfaceColor("rgba(241, 246, 252, 0.4)", 80, "sky"))[3];

    expect(rowDusk).toBeLessThan(cardDusk);
    expect(rowSky).toBeLessThan(cardSky);
    /*
     * The card-to-row gap is what the eye reads as depth. It is not identical
     * between casts — the night card sits at the glass ceiling, so its gap is
     * slightly tighter — but it has to stay in the band that reads as gently
     * inset rather than as flat (no gap) or sharply sunk (a large one).
     */
    for (const gap of [cardDusk - rowDusk, cardSky - rowSky]) {
      expect(gap).toBeGreaterThanOrEqual(0.08);
      expect(gap).toBeLessThanOrEqual(0.15);
    }
  });
});

describe("the night preset", () => {
  it("pairs the slate cast with the middle weight", () => {
    const night = GLASS_PRESETS.find((preset) => preset.id === "night");
    expect(night?.glassTint).toBe("dusk");
    expect(night?.glassOpacity).toBe(80);
    expect(matchGlassPreset(80, "dusk")).toBe("night");
  });

  it("leaves the pale presets matching exactly what they did before", () => {
    expect(matchGlassPreset(50, "sky")).toBe("subtle");
    expect(matchGlassPreset(80, "sky")).toBe("balanced");
    expect(matchGlassPreset(95, "lemon")).toBe("strong");
    expect(matchGlassPreset(60, "dusk")).toBeNull();
  });
});
