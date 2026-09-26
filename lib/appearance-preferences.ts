export const APPEARANCE_STORAGE_KEY = "trufrenz.appearance.v1";
export const DEFAULT_GLASS_OPACITY = 80;
export const GLASS_OPACITY_STEPS = [50, 60, 70, 80, 90, 95] as const;

export type AppearancePreferences = {
  glassOpacity: number;
  wallpaperVisible: boolean;
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  glassOpacity: DEFAULT_GLASS_OPACITY,
  wallpaperVisible: true,
};

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

/** Keep each surface's own tint and apply the user's chosen opacity. */
export function glassSurfaceColor(color: string, opacity: number): string {
  const match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (!match) return color;
  const alpha = normalizeGlassOpacity(opacity) / 100;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}
