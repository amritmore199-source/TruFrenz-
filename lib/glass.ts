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
export type GlassSurface = "card" | "panel" | "row" | "chip" | "tab" | "field" | "floater";

/** The brightest glass weight for any surface. Beyond this it stops being glass. */
export const MAX_GLASS_ALPHA = 0.46;

/** Every surface starts here, then the tint weight and the setting adjust it. */
const BASE_ALPHA = 0.24;

/** How much a surface's own declared alpha can add, at most. */
const MAX_DECLARED_WEIGHT = 0.11;

/*
 * The band a nested surface's weight falls in. It tops out below the lightest
 * sheet weight so a row can never out-weigh the surface it sits on, and it has
 * enough spread that two rows declaring different alphas still differ.
 */
const NESTED_MIN_WEIGHT = -0.02;
const NESTED_MAX_WEIGHT = 0.04;

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

/**
 * The tint every surface uses unless it is told otherwise.
 *
 * Around twenty components resolve their own glass colour, and nearly all of
 * them are sheets or modals rendered by a screen that owns the appearance
 * setting. Threading a tint prop through each of them would be a large, risky
 * change for what is one global preference, so the provider writes the choice
 * here and the resolvers default to it.
 *
 * The pure functions still take the tint explicitly, which keeps them testable
 * and keeps this default from being the only way to reach the behaviour. Callers
 * that pass a tint are unaffected; the provider re-renders the tree when the
 * choice changes, so a render never reads a stale value.
 */
let activeTint: GlassTint = "sky";

/** Called by the appearance provider when the member changes the glass colour. */
export function setActiveGlassTint(tint: GlassTint): void {
  activeTint = tint === "lemon" ? "lemon" : "sky";
}

/** The tint currently in effect. Exposed for tests and diagnostics. */
export function activeGlassTint(): GlassTint {
  return activeTint;
}

/**
 * The member's glass weight, mirrored from the provider.
 *
 * The tint above is already mirrored here for one reason: around twenty
 * components resolve their own glass colour and threading a prop through each of
 * them would be a large, risky change for one global preference. The weight needs
 * the same treatment for the same reason, and for one more.
 *
 * The white patches were not one mistake, they were a pattern: 515 surfaces across
 * the app declared a near-opaque white inline, in a `StyleSheet.create` table at
 * module scope. A style table is built once when the file is imported, long before
 * the provider has read the member's setting, so those values could never follow
 * it — which is exactly why they were hardcoded in the first place. Mirroring the
 * weight here means the fix can be applied at a render site by calling
 * `glassFill(...)`, with no hook, no prop, and no signature change at the call
 * site: the component already re-renders when the provider's value changes, so the
 * read is never stale.
 *
 * A caller that passes its own opacity still wins; this is only the default.
 */
let activeOpacity = 80;

/** Called by the appearance provider when the member changes the glass weight. */
export function setActiveGlassOpacity(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  activeOpacity = Math.min(95, Math.max(50, value));
}

/** The glass weight currently in effect. Exposed for tests and diagnostics. */
export function activeGlassOpacity(): number {
  return activeOpacity;
}

/**
 * Resolve a declared fill into glass at render time.
 *
 * For a surface sitting over the wallpaper: a card, a sheet, a bar. Takes the
 * colour the old code declared inline and returns the glass version of it, using
 * whatever tint and weight the member has chosen.
 *
 * This exists so that removing a white patch is a one-line change at the call
 * site — `backgroundColor: glassFill("rgba(255, 255, 255, 0.72)")` — rather than a
 * prop threaded through a component tree.
 */
export function glassFill(color: string, surface: GlassSurface = "card"): string {
  return glassSurfaceColor(color, activeOpacity, activeTint, surface);
}

/**
 * The same, for a surface sitting *inside* another glass surface.
 *
 * This is the common case for the patches: a row, a tile, or a button inside a
 * sheet. Those must stay lighter than the sheet behind them, so they resolve
 * through the nested band instead of the card weight. Using `glassFill` here
 * would make a row as heavy as the sheet it sits on, which is the flat-panel look
 * the nesting band was added to fix.
 */
export function glassNestedFill(color: string): string {
  return glassNestedSurfaceColor(color, activeOpacity, activeTint);
}

/**
 * One-tap glass presets.
 *
 * Tuning six values by hand to find a look is work, and most members only ever
 * want one of a few sensible settings. Each preset is just a setting plus a
 * cast, so it stays inside the same tested range as the manual controls and the
 * preset can be recognised again from the current values.
 */
export const GLASS_PRESETS = [
  { id: "subtle", label: "Subtle", glassOpacity: 50, glassTint: "sky" },
  { id: "balanced", label: "Balanced", glassOpacity: 80, glassTint: "sky" },
  { id: "strong", label: "Strong", glassOpacity: 95, glassTint: "lemon" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  glassOpacity: number;
  glassTint: GlassTint;
}>;

export type GlassPreset = (typeof GLASS_PRESETS)[number];
export type GlassPresetId = GlassPreset["id"];

/** Which preset, if any, the current values match. */
export function matchGlassPreset(
  glassOpacity: number,
  tint: GlassTint,
): GlassPresetId | null {
  const found = GLASS_PRESETS.find(
    (preset) => preset.glassOpacity === glassOpacity && preset.glassTint === tint,
  );
  return found ? found.id : null;
}

/**
 * Per-tab glass weight.
 *
 * The tab bar is one surface, but the content behind it differs a lot: the chat
 * list is dense with small rows while Meetups is mostly open wallpaper. A single
 * weight made the bar look heavy over the denser tab and washed out over the
 * emptier one, so each tab nudges the weight a little. The offsets stay small
 * enough that the bar never reads as a different component.
 */
/**
 * The sections the bar can be sitting over, plus the two destinations that are
 * reached from elsewhere. "meetups" and "you" are kept because those screens
 * still exist behind the avatar and the chat header, and the bar keeps its
 * weight while they are showing.
 */
export type TabAccent =
  | "chats"
  | "groups"
  | "friends"
  | "bizz"
  | "meetups"
  | "you";

const TAB_ACCENT_OFFSET: Record<TabAccent, number> = {
  chats: -0.03,
  // Groups is a dense list of rows, like the chat inbox but shorter, so it sits
  // between the two extremes rather than repeating the inbox's lightest weight.
  groups: -0.01,
  friends: 0,
  // Bizz starts as a mostly empty screen, so its bar leans heavier.
  bizz: 0.03,
  meetups: 0.02,
  you: 0.04,
};

/** Alpha for the tab bar over a given tab. */
export function tabBarAlpha(tab: TabAccent | null, glassOpacity: number): number {
  const offset = tab ? TAB_ACCENT_OFFSET[tab] ?? 0 : 0;
  const weight = (SURFACE_WEIGHT.tab ?? 0) + offset;
  return clampAlpha(BASE_ALPHA + weight + weightFromSetting(glassOpacity));
}

/** Resolved tab bar colour for a given tab. */
export function tabBarTint(
  tab: TabAccent | null,
  glassOpacity: number,
  tint: GlassTint = activeTint,
): string {
  const { r, g, b } = TINTS[tint];
  return `rgba(${r}, ${g}, ${b}, ${tabBarAlpha(tab, glassOpacity).toFixed(3)})`;
}

type Rgb = { r: number; g: number; b: number };

/** Extra weight per surface class, so a row stays lighter than a card. */
const SURFACE_WEIGHT: Record<GlassSurface, number> = {
  card: 0.06,
  panel: 0.08,
  row: 0.02,
  chip: 0,
  tab: 0.05,
  field: 0.07,
  // A surface that floats over another surface rather than over the wallpaper.
  // Slightly lighter than a card so a nested panel reads as inset rather than as
  // a second card sitting on the first.
  floater: 0.01,
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
 * How much extra presence the member's setting asks for.
 *
 * The stored 50-95 range keeps its original meaning so existing preferences stay
 * valid, and the screen labels the ends of the scale: 50 sits under "More
 * wallpaper" and 95 under "More opaque". Higher therefore has to mean a heavier,
 * more present surface.
 *
 * This used to be inverted — the function was written as an extra *transparency*
 * and subtracted from 95 — so the setting did the opposite of what it said.
 * Dragging to "More opaque" made every surface lighter, which is why the glass
 * looked wrong no matter which end the member chose, and why raising the setting
 * never fixed the patches. A test pinned the inverted ordering as correct, so the
 * suite certified it and the bug survived every previous pass; the test now pins
 * the direction the label promises instead.
 */
export function weightFromSetting(glassOpacity: number): number {
  if (typeof glassOpacity !== "number" || !Number.isFinite(glassOpacity)) {
    // An unreadable value lands in the middle of the range rather than at an end,
    // so a corrupt preference cannot silently produce an invisible surface.
    return MAX_SETTING_WEIGHT * 0.5;
  }
  const clamped = Math.min(95, Math.max(50, glassOpacity));
  // 50 (lightest) -> no extra weight, 95 (strongest) -> the full extra weight.
  return MAX_SETTING_WEIGHT * ((clamped - 50) / 45);
}

/** Alpha for one named surface, before any tint is applied. */
export function glassAlpha(surface: GlassSurface, glassOpacity: number): number {
  const weight = SURFACE_WEIGHT[surface] ?? 0;
  return clampAlpha(BASE_ALPHA + weight + weightFromSetting(glassOpacity));
}

/** The resolved glass colour for a named surface. */
export function glassTint(
  surface: GlassSurface,
  glassOpacity: number,
  tint: GlassTint = activeTint,
): string {
  const { r, g, b } = TINTS[tint];
  return `rgba(${r}, ${g}, ${b}, ${glassAlpha(surface, glassOpacity).toFixed(3)})`;
}

/** The sheen laid over the tint. */
export function glassVeil(
  surface: GlassSurface,
  glassOpacity: number,
  tint: GlassTint = activeTint,
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
    // A nested surface blurs what is already blurred, so it needs less.
    floater: 50,
  };
  return base[surface] ?? 58;
}

/** The rim highlight that makes the surface feel physical. */
export function glassEdge(surface: GlassSurface, tint: GlassTint = activeTint): string {
  const strength: Record<GlassSurface, number> = {
    card: 0.72,
    panel: 0.6,
    row: 0.58,
    chip: 0.52,
    tab: 0.55,
    field: 0.5,
    floater: 0.46,
  };
  const { r, g, b } = tint === "lemon" ? { r: 255, g: 253, b: 235 } : { r: 255, g: 255, b: 255 };
  return `rgba(${r}, ${g}, ${b}, ${strength[surface] ?? 0.6})`;
}

/** A soft, cool shadow. Warm shadows muddy a blue-white surface. */
export const GLASS_SHADOW = "rgba(90, 108, 128, 0.16)";

/**
 * A solid colour chip showing what a tint looks like.
 *
 * The tint itself is far too thin to read as a colour: over a pale panel a
 * 0.33-alpha swatch is indistinguishable from the panel behind it, so a member
 * choosing between the two casts could not see what they were picking. This
 * shows the same hue at a weight that is legible as a colour, which is what a
 * swatch is for.
 */
export function glassSwatch(tint: GlassTint): string {
  const { r, g, b } = TINTS[tint];
  // Deepen by scaling every channel by the same factor, which keeps the hue's
  // channel ordering intact, then push the result away from its own mean to
  // raise saturation. Scaling channels independently is what would let a cool
  // tint drift warm.
  const scale = 0.9;
  const [sr, sg, sb] = [r * scale, g * scale, b * scale];
  const mean = (sr + sg + sb) / 3;
  const saturation = 1.7;
  const shift = (channel: number) => Math.max(0, Math.min(255, Math.round(mean + (channel - mean) * saturation)));
  return `rgb(${shift(sr)}, ${shift(sg)}, ${shift(sb)})`;
}

/**
 * The outline for a swatch chip.
 *
 * The selected chip is filled with its own tint, so a pale swatch inside it has
 * almost no contrast — the lemon chip in particular disappeared into its own
 * selected state. This rim is a darkened version of the same hue, which
 * separates the chip from both the panel and its own selection fill without
 * introducing a colour that is not part of the palette.
 */
export function glassSwatchEdge(tint: GlassTint): string {
  const { r, g, b } = TINTS[tint];
  const [dr, dg, db] = [r, g, b].map((channel) => Math.round(channel * 0.58));
  return `rgba(${dr}, ${dg}, ${db}, 0.85)`;
}

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
  tint: GlassTint = activeTint,
  surface: GlassSurface = "card",
): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const declaredWeight = Math.min(
    MAX_DECLARED_WEIGHT,
    Math.max(0, ((parsed.alpha ?? 0) - 0.6) * 0.35),
  );
  const alpha = clampAlpha(BASE_ALPHA + declaredWeight + weightFromSetting(opacity));

  const rgb = isNeutral(parsed.rgb) ? mix(parsed.rgb, TINTS[tint], NEUTRAL_TINT_MIX) : parsed.rgb;

  // A named surface can raise the weight further, but never past the ceiling.
  const weight = SURFACE_WEIGHT[surface] ?? 0;
  const finalAlpha = Math.min(MAX_GLASS_ALPHA, Math.max(alpha, BASE_ALPHA + weight));

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${finalAlpha.toFixed(3)})`;
}

/**
 * Resolve a surface that sits *inside* another glass surface.
 *
 * `glassSurfaceColor` treats any declared alpha below 0.6 as wanting no extra
 * presence, so a nested row declaring 0.5, 0.56, or 0.6 all collapse onto the
 * same weight and become indistinguishable from each other and from the sheet
 * behind them. That is right for a card over the wallpaper and wrong for
 * anything inside one: the member sees a flat panel where the design intended a
 * row, a tile, and a highlighted tile to read as three different depths.
 *
 * This keeps the declared alpha as an *ordering* rather than a magnitude. The
 * whole spread is squeezed into a narrow band below the parent's weight, so a
 * nested surface is always lighter than the sheet it sits on, while still being
 * heavier than a sibling that declared less. That is what makes hierarchy
 * visible without turning each row into a second card.
 */
export function glassNestedSurfaceColor(
  color: string,
  opacity: number,
  tint: GlassTint = activeTint,
): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  // The declared alpha runs roughly 0.4 (quietest) to 1 (most present). Map it
  // onto a band that stays under a sheet's weight.
  const declared = parsed.alpha ?? 0.6;
  const position = Math.min(1, Math.max(0, (declared - 0.4) / 0.5));
  const nestedWeight = NESTED_MIN_WEIGHT + position * (NESTED_MAX_WEIGHT - NESTED_MIN_WEIGHT);

  const rgb = isNeutral(parsed.rgb) ? mix(parsed.rgb, TINTS[tint], NEUTRAL_TINT_MIX) : parsed.rgb;
  const alpha = clampAlpha(BASE_ALPHA + nestedWeight + weightFromSetting(opacity));

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
}
