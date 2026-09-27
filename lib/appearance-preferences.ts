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
  glassAlpha,
  glassBlur,
  glassEdge,
  glassSurfaceColor,
  glassTint,
  glassVeil,
  transparencyFromSetting,
  type GlassSurface,
  type GlassTint,
} from "./glass";
import type { GlassTint } from "./glass";

export const DEFAULT_GLASS_OPACITY = 80;
export const GLASS_OPACITY_STEPS = [50, 60, 70, 80, 90, 95] as const;

/** The two glass casts a member can choose between. */
export const GLASS_TINT_OPTIONS = ["sky", "lemon"] as const;

export const DEFAULT_GLASS_TINT: GlassTint = "sky";

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

/** Falls back to the cool default for anything unrecognised. */
export function normalizeGlassTint(value: unknown): GlassTint {
  return value === "lemon" ? "lemon" : "sky";
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
