import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE_PREFERENCES,
  GLASS_OPACITY_STEPS,
  MAX_GLASS_ALPHA,
  glassAlpha,
  glassBlur,
  glassEdge,
  glassSurfaceColor,
  glassTint,
  glassVeil,
  normalizeAppearancePreferences,
  normalizeGlassOpacity,
  parseAppearancePreferences,
} from "../lib/appearance-preferences";

describe("appearance preferences", () => {
  it("provides a readable default appearance and opacity presets", () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES).toEqual({ glassOpacity: 80, wallpaperVisible: true });
    expect(GLASS_OPACITY_STEPS).toContain(DEFAULT_APPEARANCE_PREFERENCES.glassOpacity);
  });

  it("clamps and rounds opacity values to supported bounds", () => {
    expect(normalizeGlassOpacity(42)).toBe(50);
    expect(normalizeGlassOpacity(67)).toBe(65);
    expect(normalizeGlassOpacity(100)).toBe(95);
    expect(normalizeGlassOpacity(Number.NaN)).toBe(80);
  });

  it("loads valid settings and safely falls back when saved data is malformed", () => {
    expect(parseAppearancePreferences(JSON.stringify({ glassOpacity: 90, wallpaperVisible: false }))).toEqual({ glassOpacity: 90, wallpaperVisible: false });
    expect(parseAppearancePreferences("not json")).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseAppearancePreferences(null)).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(normalizeAppearancePreferences({ glassOpacity: 75, wallpaperVisible: "false" })).toEqual({ glassOpacity: 75, wallpaperVisible: true });
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
    expect(glassAlpha("card", 50)).toBeGreaterThan(glassAlpha("card", 95));
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
