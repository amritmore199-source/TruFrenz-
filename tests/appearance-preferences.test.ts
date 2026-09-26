import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE_PREFERENCES,
  GLASS_OPACITY_STEPS,
  glassSurfaceColor,
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
    expect(glassSurfaceColor("rgba(255,255,255,0.79)", 60)).toBe("rgba(255, 255, 255, 0.6)");
    expect(glassSurfaceColor("rgba(234,223,235,0.94)", 90)).toBe("rgba(234, 223, 235, 0.9)");
    expect(glassSurfaceColor("#FFFFFF", 70)).toBe("#FFFFFF");
  });
});
