/**
 * Glass tokens.
 *
 * Real glassmorphism is a blue-white, low-alpha tint sitting over a heavily
 * blurred backdrop, with a bright rim that catches the light. The app had the
 * blur but not the recipe: the member's glass-opacity setting was wired
 * straight into the surface alpha, so the default of 80 painted a 0.79-alpha
 * white card. That is opaque paint — the wallpaper could not show through, and
 * no amount of blur behind it was visible.
 *
 * Two ideas that were tangled together are separated here:
 *
 *   weight — how much of the wallpaper survives into the surface. This is the
 *            member's setting, and their intent is preserved: higher still
 *            means a more present surface, it just no longer climbs to solid.
 *   tint   — the cool (or warm) cast layered on top, always light enough to
 *            read as glass rather than paint.
 *
 * Neutral surfaces become blue-white glass, which is the look in the reference.
 * Saturated surfaces keep their own hue, so accent buttons stay themselves.
 *
 * Pure module: no React and no platform imports, so it is safe to unit test.
 */

/** How a neutral surface is coloured. Sky is the default; lemon is warmer. */
export type GlassTint = "sky" | "lemon";

/** A named surface, so each kind can carry its own weight. */
export type GlassSurface = "card" | "panel" | "row" | "chip" | "tab" | "field";

/** The brightest glass weight for any surface. Beyond this it stops being glass. */
export const MAX_GLASS_ALPHA = 0.46;

/** Every surface starts here, then the tint weight and the setting adjust it. */
const BASE_ALPHA = 0.24;

/** How much a surface's own declared alpha can add, at most. */
const MAX_DECLARED_WEIGHT = 0.11;

/** How much the member's lightest setting can add, at most. */
const MAX_SETTING_WEIGHT = 0.1;

/** How far a neutral surface is pulled toward the glass tint. */
const NEUTRAL_TINT_MIX = 0.62;

/** Colour spread at or below which a surface counts as neutral (grey/white). */
const NEUTRAL_CHROMA = 26;

const TINTS: Record<GlassTint, Rgb> = {
  // The blue-white of the reference sheet and the blue glass mockup.
  sky: { r: 233, g: 241, b: 250 },
  // A warm lemon wash that keeps the app's accent family.
  lemon: { r: 247, g: 240, b: 205 },
};

/** The sheen laid over the tint, which reads as a lit sheet of glass. */
const VEIL: Record<GlassTint, Rgb> = {
  sky: { r: 255, g: 255, b: 255 },
  lemon: { r: 255, g: 254, b: 244 },
};

type Rgb = { r: number; g: number; b: number };

/** Extra weight per surface class, so a row stays lighter than a card. */
const SURFACE_WEIGHT: Record<GlassSurface, number> = {
  card: 0.06,
  panel: 0.08,
  row: 0.02,
  chip: 0,
  tab: 0.05,
  field: 0.07,
};

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) return BASE_ALPHA;
  return Math.min(MAX_GLASS_ALPHA, Math.max(0.16, value));
}

function parseColor(color: string): { rgb: Rgb; alpha: number | null } | null {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return { rgb: { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }, alpha: null };
  }
  const rgba = color.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (!rgba) return null;
  return {
    rgb: { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) },
    alpha: rgba[4] === undefined ? null : Number(rgba[4]),
  };
}

function isNeutral({ r, g, b }: Rgb): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) <= NEUTRAL_CHROMA;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  };
}

/**
 * The member's setting, inverted into extra transparency.
 *
 * The stored 50-95 range keeps its original meaning so existing preferences and
 * their labels stay valid: higher means a stronger, more present surface. What
 * changed is the mapping. It now moves inside the glass range instead of
 * sweeping all the way to solid.
 */
export function transparencyFromSetting(glassOpacity: number): number {
  if (typeof glassOpacity !== "number" || !Number.isFinite(glassOpacity)) return 0;
  const clamped = Math.min(95, Math.max(50, glassOpacity));
  // 50 (lightest) -> full extra transparency, 95 (strongest) -> none.
  return MAX_SETTING_WEIGHT * ((95 - clamped) / 45);
}

/** Alpha for one named surface, before any tint is applied. */
export function glassAlpha(surface: GlassSurface, glassOpacity: number): number {
  const weight = SURFACE_WEIGHT[surface] ?? 0;
  return clampAlpha(BASE_ALPHA + weight + transparencyFromSetting(glassOpacity));
}

/** The resolved glass colour for a named surface. */
export function glassTint(
  surface: GlassSurface,
  glassOpacity: number,
  tint: GlassTint = "sky",
): string {
  const { r, g, b } = TINTS[tint];
  return `rgba(${r}, ${g}, ${b}, ${glassAlpha(surface, glassOpacity).toFixed(3)})`;
}

/** The sheen laid over the tint. */
export function glassVeil(
  surface: GlassSurface,
  glassOpacity: number,
  tint: GlassTint = "sky",
): string {
  const { r, g, b } = VEIL[tint];
  const alpha = Math.min(0.3, glassAlpha(surface, glassOpacity) * 0.55);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/**
 * Blur strength for `expo-blur`'s intensity, which is a 0-100 scale. Frosted
 * glass needs a genuinely heavy blur or the backdrop stays legible through the
 * surface and the tint reads as a stain rather than frost.
 */
export function glassBlur(surface: GlassSurface): number {
  const base: Record<GlassSurface, number> = {
    card: 62,
    panel: 66,
    row: 54,
    chip: 46,
    tab: 58,
    field: 44,
  };
  return base[surface] ?? 58;
}

/** The rim highlight that makes the surface feel physical. */
export function glassEdge(surface: GlassSurface, tint: GlassTint = "sky"): string {
  const strength: Record<GlassSurface, number> = {
    card: 0.72,
    panel: 0.6,
    row: 0.58,
    chip: 0.52,
    tab: 0.55,
    field: 0.5,
  };
  const { r, g, b } = tint === "lemon" ? { r: 255, g: 253, b: 235 } : { r: 255, g: 255, b: 255 };
  return `rgba(${r}, ${g}, ${b}, ${strength[surface] ?? 0.6})`;
}

/** A soft, cool shadow. Warm shadows muddy a blue-white surface. */
export const GLASS_SHADOW = "rgba(90, 108, 128, 0.16)";

/**
 * Resolve any surface's declared colour into glass.
 *
 * Every component already calls this with its own tint, so the fix reaches the
 * whole app from one place. The declared colour is treated as two hints rather
 * than a literal fill:
 *
 *   - its alpha says how much presence that surface wants, scaled down hard
 *   - its hue is kept when it is saturated, so accent surfaces stay true
 *   - when it is neutral (white or grey) it becomes blue-white glass
 */
export function glassSurfaceColor(
  color: string,
  opacity: number,
  tint: GlassTint = "sky",
  surface: GlassSurface = "card",
): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const declaredWeight = Math.min(
    MAX_DECLARED_WEIGHT,
    Math.max(0, ((parsed.alpha ?? 0) - 0.6) * 0.35),
  );
  const alpha = clampAlpha(BASE_ALPHA + declaredWeight + transparencyFromSetting(opacity));

  const rgb = isNeutral(parsed.rgb) ? mix(parsed.rgb, TINTS[tint], NEUTRAL_TINT_MIX) : parsed.rgb;

  // A named surface can raise the weight further, but never past the ceiling.
  const weight = SURFACE_WEIGHT[surface] ?? 0;
  const finalAlpha = Math.min(MAX_GLASS_ALPHA, Math.max(alpha, BASE_ALPHA + weight));

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${finalAlpha.toFixed(3)})`;
}