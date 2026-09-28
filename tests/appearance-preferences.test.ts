import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE_PREFERENCES,
  GLASS_OPACITY_STEPS,
  GLASS_TINT_OPTIONS,
  MAX_GLASS_ALPHA,
  glassAlpha,
  glassBlur,
  glassEdge,
  glassSurfaceColor,
  glassTint,
  glassVeil,
  normalizeAppearancePreferences,
  normalizeGlassOpacity,
  normalizeGlassTint,
  parseAppearancePreferences,
} from "../lib/appearance-preferences";
import { GLASS_PRESETS, activeGlassTint, glassNestedSurfaceColor, glassSwatch, glassSwatchEdge, matchGlassPreset, setActiveGlassTint, tabBarAlpha } from "../lib/glass";

describe("appearance preferences", () => {
  it("provides a readable default appearance and opacity presets", () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES).toEqual({ glassOpacity: 80, glassTint: "sky", wallpaperVisible: true });
    expect(GLASS_OPACITY_STEPS).toContain(DEFAULT_APPEARANCE_PREFERENCES.glassOpacity);
  });

  it("clamps and rounds opacity values to supported bounds", () => {
    expect(normalizeGlassOpacity(42)).toBe(50);
    expect(normalizeGlassOpacity(67)).toBe(65);
    expect(normalizeGlassOpacity(100)).toBe(95);
    expect(normalizeGlassOpacity(Number.NaN)).toBe(80);
  });

  it("loads valid settings and safely falls back when saved data is malformed", () => {
    expect(parseAppearancePreferences(JSON.stringify({ glassOpacity: 90, wallpaperVisible: false }))).toEqual({ glassOpacity: 90, glassTint: "sky", wallpaperVisible: false });
    expect(parseAppearancePreferences("not json")).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseAppearancePreferences(null)).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(normalizeAppearancePreferences({ glassOpacity: 75, wallpaperVisible: "false" })).toEqual({ glassOpacity: 75, glassTint: "sky", wallpaperVisible: true });
  });

  it("applies opacity while preserving each glass surface's tint", () => {
    // A neutral surface becomes pale blue-white glass rather than the near-opaque
    // white fill it used to be, which is what stopped the wallpaper showing through.
    const surface = glassSurfaceColor("rgba(255, 255, 255, 0.79)", 80);
    // White is pulled most of the way toward the sky tint, which is what gives
    // the surface its cool glass cast instead of a flat white panel.
    expect(surface).toMatch(/^rgba\(241, 246, 252, 0\.\d+\)$/);
    const alpha = Number(surface.match(/, (0\.\d+)\)$/)![1]);
    expect(alpha).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
    expect(alpha).toBeGreaterThan(0.2);
  });

  it("keeps a saturated accent surface in its own hue", () => {
    // Tinting a coloured button blue would break the accent, so only neutral
    // surfaces are re-cast. The hue must survive untouched.
    const accent = glassSurfaceColor("rgba(241, 222, 85, 0.94)", 80);
    expect(accent).toContain("241, 222, 85");
  });

  it("never lets any surface or setting reach an opaque fill", () => {
    // The whole point of the recipe: glass stays glass. Even the strongest
    // setting on the heaviest surface must leave the wallpaper visible.
    for (const surface of ["card", "panel", "row", "chip", "tab", "field"] as const) {
      for (const setting of [50, 80, 95]) {
        expect(glassAlpha(surface, setting)).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
      }
    }
  });

  it("makes a lighter setting more transparent than a heavier one", () => {
    // The stored 50-95 scale keeps its direction, so the control still means
    // what its labels say.
    /*
     * The direction the screen promises.
     *
     * This assertion used to read the other way round, which is what let the
     * setting be inverted for so long: the suite agreed with the bug. The scale
     * is labelled "More wallpaper" at 50 and "More opaque" at 95, so 95 must be
     * the heavier surface.
     */
    expect(glassAlpha("card", 95)).toBeGreaterThan(glassAlpha("card", 50));
    expect(glassTint("card", 50)).not.toBe(glassTint("card", 95));
  });

  it("blurs strongly enough to diffuse the backdrop", () => {
    // A weak blur leaves the wallpaper legible through the surface, which reads
    // as a coloured stain instead of frost.
    for (const surface of ["card", "panel", "row", "chip", "tab", "field"] as const) {
      expect(glassBlur(surface)).toBeGreaterThanOrEqual(40);
    }
    expect(glassBlur("card")).toBeGreaterThan(glassBlur("chip"));
  });

  it("returns a rim and a sheen so the glass reads as a lit surface", () => {
    expect(glassEdge("card")).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/);
    expect(glassVeil("card", 80)).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/);
  });

  it("passes unrecognised colour formats straight through", () => {
    // Hex is understood now, so a hex white is glassed like any other neutral.
    expect(glassSurfaceColor("#FFFFFF", 70)).toMatch(/^rgba\(241, 246, 252, 0\.\d+\)$/);
    expect(glassSurfaceColor("papayawhip", 70)).toBe("papayawhip");
  });
});

describe("glass colour choice", () => {
  afterEach(() => setActiveGlassTint("sky"));

  it("offers exactly the two supported casts and defaults to the cool one", () => {
    expect(GLASS_TINT_OPTIONS).toEqual(["sky", "lemon"]);
    expect(DEFAULT_APPEARANCE_PREFERENCES.glassTint).toBe("sky");
  });

  it("falls back to sky for anything it does not recognise", () => {
    // A stored value from an older build, or a typo, must not produce a
    // half-tinted surface.
    expect(normalizeGlassTint("lemon")).toBe("lemon");
    expect(normalizeGlassTint("Sky")).toBe("sky");
    expect(normalizeGlassTint(undefined)).toBe("sky");
    expect(normalizeGlassTint(42)).toBe("sky");
  });

  it("keeps the existing choice when older saved settings omit it", () => {
    // Settings written before this option existed must still load, and they must
    // not lose their opacity.
    expect(parseAppearancePreferences(JSON.stringify({ glassOpacity: 60, wallpaperVisible: false })))
      .toEqual({ glassOpacity: 60, glassTint: "sky", wallpaperVisible: false });
  });

  it("colours a neutral surface according to the chosen cast", () => {
    const sky = glassSurfaceColor("rgba(255, 255, 255, 0.9)", 80, "sky");
    const lemon = glassSurfaceColor("rgba(255, 255, 255, 0.9)", 80, "lemon");
    expect(sky).not.toBe(lemon);
    // Sky is cooler than lemon: blue must lead in one and lose in the other.
    const parse = (c: string) => c.match(/(\d+), (\d+), (\d+)/)!.slice(1).map(Number);
    const [sr, , sb] = parse(sky);
    const [lr, , lb] = parse(lemon);
    expect(sb - sr).toBeGreaterThan(0);
    expect(lb - lr).toBeLessThan(0);
  });

  it("still keeps a saturated accent in its own hue regardless of the cast", () => {
    // The member's own bubble is a warm accent; the glass colour must not
    // repaint it, or the two bubble sides would stop being distinguishable.
    for (const tint of GLASS_TINT_OPTIONS) {
      expect(glassSurfaceColor("rgba(233, 227, 193, 0.94)", 80, tint)).toContain("233, 227, 193");
    }
  });

  it("applies the chosen cast to surfaces that do not name one", () => {
    // Most sheets resolve their own colour without passing a tint. They must
    // still follow the member's choice.
    setActiveGlassTint("lemon");
    expect(activeGlassTint()).toBe("lemon");
    const implicit = glassSurfaceColor("rgba(255, 255, 255, 0.9)", 80);
    expect(implicit).toBe(glassSurfaceColor("rgba(255, 255, 255, 0.9)", 80, "lemon"));

    setActiveGlassTint("sky");
    expect(glassSurfaceColor("rgba(255, 255, 255, 0.9)", 80))
      .toBe(glassSurfaceColor("rgba(255, 255, 255, 0.9)", 80, "sky"));
  });

  it("treats an unrecognised active cast as the cool default", () => {
    setActiveGlassTint("chartreuse" as never);
    expect(activeGlassTint()).toBe("sky");
  });

  it("shows a legible colour chip for each cast", () => {
    // The tint itself is far too thin to read as a colour over a pale panel, so
    // the picker needs a solid chip. It must be opaque and clearly the hue.
    const sky = glassSwatch("sky");
    const lemon = glassSwatch("lemon");
    expect(sky).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(lemon).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(sky).not.toBe(lemon);

    const parse = (c: string) => c.match(/(\d+), (\d+), (\d+)/)!.slice(1).map(Number);
    const [sr, sg, sb] = parse(sky);
    const [lr, lg, lb] = parse(lemon);
    // Sky leads with blue; lemon leads with red and is barely blue at all.
    expect(sb).toBeGreaterThan(sr);
    expect(sb).toBeGreaterThan(sg);
    expect(lr).toBeGreaterThan(lb);
    expect(lg).toBeGreaterThan(lb);
  });

  it("outlines a swatch so a pale chip does not vanish into its own selection", () => {
    // The selected chip is filled with the tint it represents, so the chip needs
    // a darker version of the same hue to stay visible inside it.
    const parse = (c: string) => c.match(/(\d+), (\d+), (\d+)/)!.slice(1).map(Number);
    for (const tint of GLASS_TINT_OPTIONS) {
      const chip = parse(glassSwatch(tint));
      const edge = parse(glassSwatchEdge(tint));
      expect(glassSwatchEdge(tint)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
      // Every channel must be darker than the chip, so the rim reads on any hue.
      edge.forEach((channel, index) => expect(channel).toBeLessThan(chip[index]));
    }
  });
});
describe("glass presets", () => {
  it("offers a small set of named looks and recognises the current one", () => {
    expect(GLASS_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of GLASS_PRESETS) {
      // Each preset must be reachable through the normal controls, so applying
      // one can never store a value the manual picker could not produce.
      expect(preset.glassOpacity).toBeGreaterThanOrEqual(50);
      expect(preset.glassOpacity).toBeLessThanOrEqual(95);
      expect(["sky", "lemon"]).toContain(preset.glassTint);
      expect(matchGlassPreset(preset.glassOpacity, preset.glassTint)).toBe(preset.id);
    }
  });

  it("reports no preset when the values are hand-tuned", () => {
    // 70 and sky is a valid manual choice but not one of the presets.
    expect(matchGlassPreset(70, "sky")).toBeNull();
  });

  it("keeps every preset distinct", () => {
    const keys = GLASS_PRESETS.map((p) => `${p.glassOpacity}-${p.glassTint}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("per-tab glass weight", () => {
  it("nudges the bar's weight per tab while staying within the glass range", () => {
    const tabs = ["chats", "friends", "meetups", "you"] as const;
    const alphas = tabs.map((t) => tabBarAlpha(t, 80));
    // The denser tab is lighter and the emptier tab is heavier, so the bar does
    // not read as a different component: the whole spread stays small.
    expect(alphas[0]).toBeLessThan(alphas[3]);
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeLessThan(0.1);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0.16);
      expect(a).toBeLessThanOrEqual(0.46);
    }
  });

  it("falls back to the plain tab weight with no tab", () => {
    expect(tabBarAlpha(null, 80)).toBeCloseTo(tabBarAlpha("friends", 80), 5);
  });
});

describe("nested surfaces", () => {
  it("keeps a nested row lighter than the sheet it sits on", () => {
    const opacity = 80;
    const sheet = glassTint("panel", opacity, "sky");
    const sheetAlpha = Number(sheet.match(/([\d.]+)\)$/)![1]);
    for (const declared of ["rgba(255, 255, 255, 0.5)", "rgba(255, 255, 255, 0.6)", "rgba(255, 255, 255, 0.75)"]) {
      const nested = glassNestedSurfaceColor(declared, opacity, "sky");
      const alpha = Number(nested.match(/([\d.]+)\)$/)![1]);
      expect(alpha).toBeLessThan(sheetAlpha);
    }
  });

  it("preserves the ordering the design declared", () => {
    // Before this, every declared alpha below 0.6 collapsed onto the same
    // weight, so a quiet row and a prominent tile were indistinguishable.
    const opacity = 80;
    const alphaOf = (declared: string) =>
      Number(glassNestedSurfaceColor(declared, opacity, "sky").match(/([\d.]+)\)$/)![1]);
    const quiet = alphaOf("rgba(255, 255, 255, 0.5)");
    const mid = alphaOf("rgba(255, 255, 255, 0.6)");
    const loud = alphaOf("rgba(255, 255, 255, 0.75)");
    expect(quiet).toBeLessThan(mid);
    expect(mid).toBeLessThan(loud);
  });
});
