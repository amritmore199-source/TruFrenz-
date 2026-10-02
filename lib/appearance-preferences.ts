export const APPEARANCE_STORAGE_KEY = "trufrenz.appearance.v1";
/*
 * The glass recipe lives in its own module so it can be reasoned about and
 * tested on its own. It is re-exported here because every surface in the app
 * already imports `glassSurfaceColor` from this file, which means the corrected
 * glass reaches all of them without touching twenty call sites.
 */
export {
  GLASS_SHADOW,
  MAX_GLASS_ALPHA,
  TEXT_ON_GLASS,
  glassAlpha,
  glassBlur,
  glassEdge,
  glassFill,
  glassNestedFill,
  glassNestedSurfaceColor,
  glassSurfaceColor,
  glassTint,
  glassVeil,
  weightFromSetting,
  type GlassSurface,
  type GlassTint,
} from "./glass";
import type { GlassTint } from "./glass";

export const DEFAULT_GLASS_OPACITY = 80;
export const GLASS_OPACITY_STEPS = [50, 60, 70, 80, 90, 95] as const;

/**
 * The glass casts a member can choose between.
 *
 * Dusk is the night-glass look: the same frosted surfaces, cast in a deeper
 * slate so the app carries bright white text rather than dark. It is an option
 * rather than a replacement, so a member who liked the pale daytime glass keeps
 * it and nothing about the default changes for them.
 */
export const GLASS_TINT_OPTIONS = ["white", "sky"] as const;

/*
 * White and black, then sky blue and white - the two combinations the member
 * asked to choose between. Ash grey and lemon were retired with them: four casts
 * that all rendered almost identically, because none of them was calibrated to a
 * depth that could be seen, is a choice that is not really a choice.
 *
 * White is the default. Its fill is a true neutral, so the glass carries no
 * colour of its own; the black is the ink on it. Both casts are fitted to the
 * same luminance, so choosing a colour changes only the hue and never how visible
 * the glass is.
 */
export const DEFAULT_GLASS_TINT: GlassTint = "white";

export type AppearancePreferences = {
  glassOpacity: number;
  glassTint: GlassTint;
  wallpaperVisible: boolean;
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  glassOpacity: DEFAULT_GLASS_OPACITY,
  glassTint: DEFAULT_GLASS_TINT,
  wallpaperVisible: true,
};

/** What each cast is called where the member chooses one. */
export const GLASS_TINT_LABEL: Record<GlassTint, string> = {
  white: "White",
  sky: "Sky blue",
};

/**
 * Falls back to the cool default for anything unrecognised.
 *
 * Dusk used to be a third cast: a slate tint deep enough to carry white text,
 * paired with a dark wallpaper. The member's artwork is bright paper, and over
 * it the dusk surface resolves to mid-grey where neither ink reaches AA — dark
 * text stops at 3.4:1 over the drawing's shadows and white text at 2.7:1. So
 * the cast is retired and a saved "dusk" folds back to the cool default rather
 * than resolving to a colour picker no longer offers.
 */
export function normalizeGlassTint(value: unknown): GlassTint {
  /*
   * Compared case-insensitively. The value comes from stored settings that a
   * previous build may have written in any casing, and a saved "Sky" that fell
   * through to the default would silently reset a member's choice — which is the
   * sort of change that looks like a bug rather than a new default.
   */
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "white" || text === "sky") {
    return text;
  }
  /*
   * Anything else — a typo, a number, a value this build has no cast for — takes
   * the system default. A stored cast that is still valid is honoured rather than
   * migrated, so only a genuinely unrecognised value changes appearance.
   */
  return DEFAULT_GLASS_TINT;
}

export function normalizeGlassOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_GLASS_OPACITY;
  const clamped = Math.min(95, Math.max(50, value));
  return Math.round(clamped / 5) * 5;
}

export function normalizeAppearancePreferences(value: unknown): AppearancePreferences {
  if (!value || typeof value !== "object") return DEFAULT_APPEARANCE_PREFERENCES;
  const candidate = value as Partial<AppearancePreferences>;
  return {
    glassOpacity: normalizeGlassOpacity(candidate.glassOpacity),
    glassTint: normalizeGlassTint(candidate.glassTint),
    wallpaperVisible: typeof candidate.wallpaperVisible === "boolean"
      ? candidate.wallpaperVisible
      : DEFAULT_APPEARANCE_PREFERENCES.wallpaperVisible,
  };
}

export function parseAppearancePreferences(serialized: string | null): AppearancePreferences {
  if (!serialized) return DEFAULT_APPEARANCE_PREFERENCES;
  try {
    return normalizeAppearancePreferences(JSON.parse(serialized));
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
}
