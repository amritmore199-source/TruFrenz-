import { describe, expect, it } from "vitest";

import {
  GLASS_PRESETS,
  MAX_GLASS_ALPHA,
  TEXT_ON_GLASS,
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

/*
 * The worst cases the app can actually produce.
 *
 * The wallpaper is the crew artwork: a drawing on white paper, published with
 * its black point raised to 200/255 so the drawing's darkest marks do not sink
 * small text below AA. Its paper field is the brightest thing a surface can sit
 * over, and its lifted shadows are the darkest.
 */
const WALLPAPER_BRIGHTEST: [number, number, number] = [255, 255, 255];
const WALLPAPER_DARKEST: [number, number, number] = [200, 200, 200];
const WALLPAPER_AVERAGE: [number, number, number] = [248, 248, 248];

describe("the casts on offer", () => {
  it("offers the three glass colours the member chooses between", () => {
    /*
     * White, sky blue and lemon. White is clear frosted glass carrying no hue of
     * its own; the other two are the warm and cool casts. The default stays sky
     * so an existing member keeps the app they already had.
     */
    expect(GLASS_TINT_OPTIONS).toEqual(["white", "sky", "lemon"]);
    expect(GLASS_TINT_LABEL.white).toBe("White");
    expect(GLASS_TINT_LABEL.sky).toBe("Sky blue");
    expect(GLASS_TINT_LABEL.lemon).toBe("Lemon");
  });

  it("carries dark ink on every one of them", () => {
    const ink = hex(TEXT_ON_GLASS.heading);
    for (const cast of GLASS_TINT_OPTIONS) {
      const surfaceGlass = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80, cast));
      const rendered = over([...surfaceGlass], WALLPAPER_DARKEST);
      expect(contrast(ink, rendered)).toBeGreaterThanOrEqual(4.5);
    }
  });

  /*
   * Dusk was a third cast: a slate tint deep enough to carry white text, which
   * only worked over a dark wallpaper. The member's artwork is bright paper, and
   * over it the dusk surface resolves to mid-grey where neither ink reaches AA —
   * dark text stops at 3.4:1 over the drawing's shadows and white text at 2.7:1,
   * while white text over the paper field manages 1.9:1. So the cast is retired,
   * and a member who had saved it lands on the cool default rather than on a
   * colour the picker no longer offers.
   */
  it("folds a saved dusk choice back to the cool default instead of stranding it", () => {
    expect(normalizeGlassTint("dusk")).toBe("sky");
    expect(normalizeGlassTint("lemon")).toBe("lemon");
    expect(normalizeGlassTint("white")).toBe("white");
    expect(normalizeGlassTint("nonsense")).toBe("sky");
  });

  it("keeps every preset reachable on the two surviving casts", () => {
    for (const preset of GLASS_PRESETS) {
      expect(GLASS_TINT_OPTIONS).toContain(preset.glassTint);
    }
  });

  it("still recognises the preset a member's settings add up to", () => {
    const balanced = GLASS_PRESETS.find((preset) => preset.id === "balanced");
    expect(balanced).toBeDefined();
    expect(matchGlassPreset(balanced!.glassOpacity, balanced!.glassTint)).toBe("balanced");
  });
});

describe("surfaces over the crew artwork", () => {
  it("tints a neutral surface rather than replacing it", () => {
    const lemon = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80, "lemon"));
    const sky = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80, "sky"));
    const white = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80, "white"));
    // The warm cast leads red, the cool cast leads blue, and white leads nowhere.
    expect(lemon[0]).toBeGreaterThan(lemon[2]);
    expect(sky[2]).toBeGreaterThan(sky[0]);
    expect(white[0]).toBe(white[1]);
    expect(white[1]).toBe(white[2]);
    // All three stay light enough to carry dark ink.
    for (const cast of [lemon, sky, white]) {
      expect(luminance([cast[0], cast[1], cast[2]])).toBeGreaterThan(0.7);
    }
  });

  it("leaves a saturated accent alone, so buttons keep their own colour", () => {
    const lemon = parseRgba(glassSurfaceColor("rgba(241, 222, 85, 0.72)", 80, "sky"));
    expect(lemon[0]).toBeGreaterThan(200);
    expect(lemon[2]).toBeLessThan(140);
  });

  it("cannot become an opaque fill at any setting", () => {
    for (const opacity of [50, 80, 95]) {
      for (const cast of ["sky", "lemon"] as const) {
        expect(glassAlpha("card", opacity, cast)).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
        expect(tabBarAlpha("profile", opacity, cast)).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
      }
    }
  });

  it("keeps a nested row quieter than the card it sits on", () => {
    for (const cast of ["sky", "lemon"] as const) {
      const card = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80, cast))[3];
      const row = parseRgba(glassNestedSurfaceColor("rgba(241, 246, 252, 0.4)", 80, cast))[3];
      expect(row).toBeLessThan(card);
    }
  });

  it("still follows the module-level cast when a call site is not explicit", () => {
    setActiveGlassTint("lemon");
    const warm = glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80);
    setActiveGlassTint("sky");
    const cool = glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80);
    expect(parseRgba(warm)[0]).toBeGreaterThan(parseRgba(cool)[0]);
  });
});

describe("text over the wallpaper", () => {
  /*
   * There is no backdrop veil any more. It existed to darken a dark photo so
   * white text stayed legible, and it needed half the picture to do it. Over the
   * member's artwork the same veil would need three quarters, which is not a
   * backdrop but a way of hiding the drawing the member chose. The artwork is
   * bright paper, so the app carries dark ink instead and needs no veil at all.
   */
  it("holds the ink past AA over the paper field and its lifted shadows", () => {
    const surfaceGlass = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80));
    for (const background of [WALLPAPER_BRIGHTEST, WALLPAPER_AVERAGE, WALLPAPER_DARKEST]) {
      const rendered = over([...surfaceGlass], background);
      expect(contrast(hex(TEXT_ON_GLASS.heading), rendered)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex(TEXT_ON_GLASS.body), rendered)).toBeGreaterThanOrEqual(4.5);
    }
  });

  /*
   * The assertion that stops the app being flipped back to white-on-light, which
   * is the one combination this wallpaper cannot support: white text over the
   * pale surfaces as they resolve over paper manages about 1.6:1.
   */
  it("keeps dark ink legible even at the thinnest glass over the darkest marks", () => {
    for (const weight of [50, 80, 95]) {
      const surfaceGlass = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", weight));
      const rendered = over([...surfaceGlass], WALLPAPER_DARKEST);
      expect(contrast(hex(TEXT_ON_GLASS.heading), rendered)).toBeGreaterThanOrEqual(4.5);
    }
  });
});