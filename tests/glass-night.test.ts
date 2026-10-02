import { describe, expect, it } from "vitest";

import {
  GLASS_PRESETS,
  MAX_GLASS_ALPHA,
  TEXT_ON_GLASS,
  ambientIntensityFor,
  AMBIENT_ALPHA_CAP,
  glassAlpha,
  glassEmptyAccent,
  glassQuietTabInk,
  glassTabAccent,
  glassAmbient,
  glassNestedSurfaceColor,
  glassSurfaceColor,
  matchGlassPreset,
  setActiveGlassOpacity,
  tabBarTint,
  setActiveGlassTint,
  tabBarAlpha,
} from "../lib/glass";
import {
  DEFAULT_GLASS_OPACITY,
  GLASS_TINT_LABEL,
  GLASS_TINT_OPTIONS,
  type GlassTint,
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
  it("offers the two glass colours the member chooses between", () => {
    /*
     * White and black, then sky blue and white. White is the shipped default: its
     * fill is a true neutral, so the glass carries no colour of its own and the
     * combination is exactly the "white glass, black ink" the member asked for.
     */
    expect(GLASS_TINT_OPTIONS).toEqual(["white", "sky"]);
    expect(GLASS_TINT_LABEL.white).toBe("White");
    expect(GLASS_TINT_LABEL.sky).toBe("Sky blue");
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
  it("folds a retired cast back to the default instead of stranding it", () => {
    // A member who had chosen ash, lemon or dusk lands on white rather than on a
    // surface with no cast at all.
    expect(normalizeGlassTint("dusk")).toBe("white");
    expect(normalizeGlassTint("ash")).toBe("white");
    expect(normalizeGlassTint("lemon")).toBe("white");
    expect(normalizeGlassTint("white")).toBe("white");
    expect(normalizeGlassTint("sky")).toBe("sky");
    expect(normalizeGlassTint("nonsense")).toBe("white");
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
    const sky = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80, "sky"));
    const white = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80, "white"));
    // The cool cast leads blue; the neutral cast leads nowhere at all.
    expect(sky[2]).toBeGreaterThan(sky[0]);
    expect(white[0]).toBe(white[1]);
    expect(white[1]).toBe(white[2]);
    /*
     * Both casts stay light enough to carry dark ink, but only just: they are
     * fitted to the reference cards' own depth rather than to a paper-white that
     * cannot be seen. The bound is set where the fitted values actually sit.
     */
    for (const cast of [sky, white]) {
      expect(luminance([cast[0], cast[1], cast[2]])).toBeGreaterThan(0.16);
    }
  });

  it("leaves a saturated accent alone, so buttons keep their own colour", () => {
    const lemon = parseRgba(glassSurfaceColor("rgba(241, 222, 85, 0.72)", 80, "sky"));
    expect(lemon[0]).toBeGreaterThan(200);
    expect(lemon[2]).toBeLessThan(140);
  });

  it("cannot become an opaque fill at any setting", () => {
    for (const opacity of [50, 80, 95]) {
      for (const cast of ["white", "sky"] as const) {
        expect(glassAlpha("card", opacity, cast)).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
        expect(tabBarAlpha("profile", opacity, cast)).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
      }
    }
  });

  it("keeps a nested row quieter than the card it sits on", () => {
    for (const cast of ["white", "sky"] as const) {
      const card = parseRgba(glassSurfaceColor("rgba(255, 255, 255, 0.94)", 80, cast))[3];
      const row = parseRgba(glassNestedSurfaceColor("rgba(241, 246, 252, 0.4)", 80, cast))[3];
      expect(row).toBeLessThan(card);
    }
  });

  it("still follows the module-level cast when a call site is not explicit", () => {
    setActiveGlassTint("white");
    const neutral = glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80);
    setActiveGlassTint("sky");
    const cool = glassSurfaceColor("rgba(255, 255, 255, 0.5)", 80);
    // The neutral cast carries equal channels; the cool one trails on red.
    expect(parseRgba(neutral)[0]).toBe(parseRgba(neutral)[2]);
    expect(parseRgba(cool)[0]).toBeLessThan(parseRgba(cool)[2]);
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
describe("the backdrop field", () => {
  /*
   * The field is the only colour behind the glass, so it is what the blur has to
   * work with. It was raised from 0.13 once the surfaces were fixed: at the old
   * value the pools were invisible through the corrected glass, which left the
   * blur diffusing a flat backdrop and the cards reading as tinted panels.
   */
  it("is strong enough for the blur to pick up", () => {
    for (const cast of ["white", "sky"] as const) {
      const field = glassAmbient(cast);
      for (const pool of [field.warm, field.cool, field.soft]) {
        const alpha = Number(pool.match(/([\d.]+)\)$/)![1]);
        expect(alpha).toBeGreaterThanOrEqual(0.15);
      }
    }
  });

  it("never runs past the point where the ink stops clearing AA", () => {
    // The clamp is the guarantee, so it is asserted directly rather than inferred
    // from the table's current numbers.
    for (const cast of ["white", "sky"] as const) {
      const field = glassAmbient(cast, 4);
      for (const pool of [field.warm, field.cool, field.soft]) {
        // The exported cap, so the assertion cannot drift from the clamp it names.
        expect(Number(pool.match(/([\d.]+)\)$/)![1])).toBeLessThanOrEqual(AMBIENT_ALPHA_CAP);
      }
    }
  });

  it("scales with the section without rearranging the pools", () => {
    // Scaling every pool by one factor is what keeps a screen reading as calmer or
    // richer rather than as a different composition.
    const base = glassAmbient("white", 1);
    const calm = glassAmbient("white", 0.78);
    const rich = glassAmbient("white", 1.25);
    const alpha = (s: string) => Number(s.match(/([\d.]+)\)$/)![1]);
    for (const key of ["warm", "cool", "soft"] as const) {
      expect(alpha(calm[key])).toBeLessThan(alpha(base[key]));
      expect(alpha(rich[key])).toBeGreaterThan(alpha(base[key]));
      // The same factor on every pool, so the relative weight is untouched.
      expect(alpha(calm[key]) / alpha(base[key])).toBeCloseTo(0.78, 2);
      expect(alpha(rich[key]) / alpha(base[key])).toBeCloseTo(1.25, 2);
    }
  });

  it("orders the sections by how dense their content is", () => {
    // A dense column of rows wants the quietest field, an open screen the richest.
    expect(ambientIntensityFor("chats")).toBeLessThan(ambientIntensityFor("profile"));
    expect(ambientIntensityFor("profile")).toBeLessThan(ambientIntensityFor("hangouts"));
    expect(ambientIntensityFor("hangouts")).toBeLessThan(ambientIntensityFor("bizz"));
    // An unknown section stays neutral rather than landing at an extreme.
    expect(ambientIntensityFor(null)).toBe(1);
    expect(ambientIntensityFor(undefined)).toBe(1);
  });
});

describe("the empty-state tile", () => {
  /*
   * Every empty state in the app used one fixed cream tile, so Chats, Groups and
   * Bizz announced themselves identically — on the one screen where there is
   * nothing else to look at, which is exactly where a section's identity should be
   * most legible.
   */
  it("follows the section it belongs to", () => {
    const alphas = (["chats", "groups", "profile", "hangouts", "bizz"] as const).map((s) =>
      Number(glassEmptyAccent(s).match(/([\d.]+)\)$/)![1]),
    );
    // Ordered like the field, so a denser screen gets a quieter tile.
    expect(alphas[0]).toBeLessThan(alphas[1]);
    expect(alphas[1]).toBeLessThan(alphas[2]);
    expect(alphas[2]).toBeLessThan(alphas[3]);
  });

  it("carries more presence than the field it comes from", () => {
    // A 53-point tile needs more of the colour than a full-screen pool does to read
    // as the same colour at all.
    const field = Number(glassAmbient("white", ambientIntensityFor("chats")).warm.match(/([\d.]+)\)$/)![1]);
    const tile = Number(glassEmptyAccent("chats").match(/([\d.]+)\)$/)![1]);
    expect(tile).toBeGreaterThan(field);
    // But it is still a tint over the wallpaper, not a painted swatch.
    expect(tile).toBeLessThan(0.6);
  });

  it("takes the cast, so the tiles are not all blue", () => {
    const neutral = glassEmptyAccent("chats", "white");
    const sky = glassEmptyAccent("chats", "sky");
    setActiveGlassTint("white");
    expect(neutral).not.toBe(sky);
    /*
     * The two tiles must differ in *hue*, not merely in alpha. They used to share
     * the same RGB values, so the sky cast was invisible in the backdrop it
     * produced - the choice changed the strength of the field and nothing else.
     */
    const [nr, , nb] = neutral.match(/[\d.]+/g)!.map(Number);
    const [sr, , sb] = sky.match(/[\d.]+/g)!.map(Number);
    expect(sb - sr).toBeGreaterThan(nb - nr);
  });

  it("falls back to the shipped cream for a section it does not know", () => {
    // A surface with no section keeps the tile it had rather than a new colour.
    expect(glassEmptyAccent(null)).toContain("rgba(");
    expect(glassEmptyAccent(undefined)).toContain("rgba(");
  });
});

describe("the active tab pill", () => {
  /*
   * The active tab used one fixed lemon for all five sections, so the bar said
   * "something is selected" but never *what*, while the sections had already been
   * given distinct backdrops and empty-state tiles.
   */
  it("takes its own section's colour", () => {
    const fills = (["chats", "groups", "hangouts", "bizz", "profile"] as const).map(
      (s) => glassTabAccent(s, "white").fill,
    );
    // At least three distinct fills, so the bar is genuinely per-section rather
    // than nominally so.
    expect(new Set(fills).size).toBeGreaterThanOrEqual(3);
  });

  it("is stronger than the empty-state tile it is derived from", () => {
    // A pill is a quarter the size of an empty-state tile and has to read as the
    // active control at a glance rather than as decoration.
    const tile = Number(glassEmptyAccent("profile", "white").match(/([\d.]+)\)$/)![1]);
    const pill = Number(glassTabAccent("profile", "white").fill.match(/([\d.]+)\)$/)![1]);
    expect(pill).toBeGreaterThan(tile);
  });

  it("keeps its label legible on every section and every cast", () => {
    // The old label colour was a dark lemon that only worked on a lemon pill. This
    // is the whole reason the ink is derived with the fill rather than fixed, so it
    // is checked across the full matrix rather than on one case.
    const lin = (v: number) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const contrast = (a: number[], b: number[]) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const over = (fg: number[], alpha: number, bg: number[]) =>
      fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
    // The worst backdrop the pill can sit over: the darkest wallpaper pixel under
    // the strongest pool the field can produce.
    const backdrop = over([96, 170, 232], 0.24, [80, 80, 80]);
    for (const cast of ["white", "sky"] as const) {
      for (const section of ["chats", "groups", "hangouts", "bizz", "profile"] as const) {
        const { fill, ink } = glassTabAccent(section, cast);
        const [r, g, b, a] = fill.match(/[\d.]+/g)!.map(Number);
        const inkRgb = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
        const pill = over([r, g, b], a, backdrop);
        expect(contrast(inkRgb, pill)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("uses one black label rather than five solved greys", () => {
    /*
     * The five-grey table was a maintenance trap: it was solved against pills that
     * all shared one blue, so making the fields per-section moved two pills out
     * from under their inks and dropped the label to 4.43:1. Black cannot go stale,
     * and it is the "white glass, black ink" combination that was asked for.
     */
    for (const cast of ["white", "sky"] as const) {
      for (const section of ["chats", "groups", "hangouts", "bizz", "profile"] as const) {
        expect(glassTabAccent(section, cast).ink).toBe("#000000");
      }
    }
  });

  it("carries enough fill that black is legible by construction", () => {
    /*
     * The stronger claim behind the black label: the pill's own alpha is well past
     * the point where black clears 4.5:1, so the label is not relying on a solved
     * value that a future change to a field could invalidate. Black clears the
     * floor once the pill's luminance reaches 0.175; each of these clears it.
     */
    const over3 = (fg: number[], alpha: number, bg: number[]) =>
      fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
    const backdrop = over3([96, 170, 232], 0.24, [80, 80, 80]);
    for (const cast of ["white", "sky"] as const) {
      for (const section of ["chats", "groups", "hangouts", "bizz", "profile"] as const) {
        const [r, g, b, a] = glassTabAccent(section, cast).fill.match(/[\d.]+/g)!.map(Number);
        expect(a).toBeGreaterThan(0.225);
        expect(luminance(over3([r, g, b], a, backdrop) as [number, number, number])).toBeGreaterThan(0.175);
      }
    }
  });

  it("falls back to the neutral pill for an unknown section", () => {
    // A bar with no section keeps a neutral glass rather than claiming a colour.
    expect(glassTabAccent(null).ink).toBe("#383838");
    expect(glassTabAccent(undefined).fill).toContain("rgba(");
  });
});

describe("the inactive tab ink", () => {
  /*
   * Both values shipped below their own accessibility floors against the bar they
   * sit on — the icon measured 1.79:1 against a 3:1 floor for a graphical object,
   * and the label 2.01:1 against 4.5:1 for text. Neither had been checked against
   * the light glass bar, only against the page.
   */
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const contrast = (a: number[], b: number[]) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const over = (fg: number[], alpha: number, bg: number[]) =>
    fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
  const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

  /** The lightest bar any section can produce for a cast — the worst case for dark ink. */
  function lightestBar(cast: GlassTint): number[] {
    setActiveGlassTint(cast);
    setActiveGlassOpacity(DEFAULT_GLASS_OPACITY);
    let lightest: number[] | null = null;
    for (const section of ["chats", "groups", "hangouts", "bizz", "profile"] as const) {
      const parsed = tabBarTint(section, DEFAULT_GLASS_OPACITY, cast).match(/[\d.]+/g)!.map(Number);
      const solid = over([parsed[0], parsed[1], parsed[2]], parsed[3] ?? 1, [246, 244, 238]);
      if (!lightest || lum(solid) > lum(lightest)) lightest = solid;
    }
    return lightest!;
  }

  it("clears 3:1 for the icon on every cast", () => {
    for (const cast of ["white", "sky"] as const) {
      expect(contrast(hex(glassQuietTabInk(cast).icon), lightestBar(cast))).toBeGreaterThanOrEqual(3);
    }
  });

  it("clears 4.5:1 for the label on every cast", () => {
    // The label is text, so it has the stricter floor of the two.
    for (const cast of ["white", "sky"] as const) {
      expect(contrast(hex(glassQuietTabInk(cast).label), lightestBar(cast))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("follows the cast, so the bar carries it even with nothing selected", () => {
    const icons = (["white", "sky"] as const).map((c) => glassQuietTabInk(c).icon);
    expect(new Set(icons).size).toBe(2);
    // The neutral ink is achromatic; the sky ink leads with blue.
    const [nr, ng, nb] = hex(glassQuietTabInk("white").icon);
    expect(nr).toBe(ng);
    expect(ng).toBe(nb);
    const [sr, , sb] = hex(glassQuietTabInk("sky").icon);
    expect(sb).toBeGreaterThan(sr);
  });

  it("keeps the icon and label a matched pair", () => {
    // Both are derived at the same hue weight, so neither reads as belonging to a
    // different colour scheme from the other.
    for (const cast of ["white", "sky"] as const) {
      const ink = glassQuietTabInk(cast);
      const iconWarm = hex(ink.icon)[0] - hex(ink.icon)[2];
      const labelWarm = hex(ink.label)[0] - hex(ink.label)[2];
      // Same sign: both lean warm, or both lean cool.
      expect(Math.sign(iconWarm)).toBe(Math.sign(labelWarm));
    }
  });
});
