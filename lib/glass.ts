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

/**
 * How a neutral surface is coloured.
 *
 */
export type GlassTint = "white" | "sky";

/** A named surface, so each kind can carry its own weight. */
export type GlassSurface = "card" | "panel" | "row" | "chip" | "tab" | "field" | "floater";

/**
 * The brightest glass weight for any surface. Beyond this it stops being glass.
 *
 * The card sits at 0.407 and the ceiling at 0.46. The ceiling is set by what still
 * reads as glass rather than by the text, because the text has a great deal of
 * room: the artwork is very pale (its darkest pixel is 226,225,230), so even at the
 * heaviest weight the card composites to roughly #C2C2C2 and near-black ink clears
 * 11:1 on it. A surface has to keep enough of the wallpaper to be glass at all, and
 * that — not contrast — is the binding constraint here.
 */
export const MAX_GLASS_ALPHA = 0.90;

/**
 * Every surface starts here, then the tint weight and the setting adjust it.
 *
 * Raised from 0.24 so a card is visibly a distinct plane against the artwork
 * rather than a faint haze on it. The reference sheet's card sits clearly above its
 * ground — it measures 199 against 251, a 1.61:1 separation — and at 0.24 the app's
 * cards were landing under that, which is why they read as washed rather than as
 * glass. This one step moves every surface class at once, which is the point: the
 * complaint was never about one card.
 */
const BASE_ALPHA = 0.74;

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
const NEUTRAL_TINT_MIX = 0.6;

/** Colour spread at or below which a surface counts as neutral (grey/white). */
const NEUTRAL_CHROMA = 26;
/*
 * The caps that bound the derived layers.
 *
 * These are a set with the tables below them, and the coupling is the point: the
 * base alphas in the field table must satisfy `base * maxIntensity <=
 * AMBIENT_ALPHA_CAP`, or the clamp silently flattens the per-section backdrop onto
 * a single value - which is exactly what it was doing. The tile and pill lifts
 * must satisfy the same for their own caps. Each is asserted in the tests,
 * because changing any one of them can quietly undo the others.
 */
export /*
 * Raised from 0.44. The cap was clipping Hangouts (0.425) and Bizz (0.45) onto a
 * single value, so two sections that had been given deliberately different weights
 * rendered identically - a cap set "just in case" silently undoing a decision.
 */
const AMBIENT_ALPHA_CAP = 0.52;
/** The lift and cap that turn a field pool into an empty-state tile. */
const EMPTY_TILE_LIFT = 1.15;
export const EMPTY_TILE_ALPHA_CAP = 0.60;
/** The lift and cap that turn a field pool into the active tab's pill. */
const TAB_PILL_LIFT = 1.3;
const TAB_PILL_ALPHA_CAP = 0.84;

const TINTS: Record<GlassTint, Rgb> = {
  /*
   * Light frosted glass, which is what this app shipped as before the lemon pass.
   *
   * The pane is a *pale* value here, and it composites over the warm off-white page
   * (250,248,247) to a soft frosted panel that carries dark mauve ink. The previous
   * values were near-black and were paired with white ink - that inversion was one of
   * the reference-chasing passes, and the member has asked for the original look back.
   *
   * Neither value is white: a pure-white fill resolves to the page at every alpha,
   * which is the "white patch" that was reported repeatedly. These sit a clear step
   * above the page so the pane reads as glass rather than as absence.
   */
  white: { r: 224, g: 220, b: 228 },
  /*
   * Sky - the optional cast, in the same light material: a cool pale blue rather than
   * a blue theme. The page and the ink do not change with it, so switching cast changes
   * the temperature of the glass and nothing else.
   */
  sky: { r: 205, g: 219, b: 234 },
};
/** The sheen laid over the tint, which reads as a lit sheet of glass. */
const VEIL: Record<GlassTint, Rgb> = {
  /*
   * A neutral sheen. Both casts carry white ink now, so the sheen's job has inverted
   * with them: it was lighting a pale pane, and it now has to light a dark one
   * without washing the ink off it. Kept well below white for that reason.
   */
  white: { r: 190, g: 190, b: 190 },
  /* A cool sheen, matching the sky sample's own highlight. */
  sky: { r: 176, g: 200, b: 232 },
};
/**
 * How far a neutral surface is pulled toward its cast.
 *
 * The pale casts only need a wash, so a little of them is enough. Dusk has to
 * actually darken the surface, and a 0.62 wash of a mid slate over a white card
 * would still be a light grey — every existing white surface in the app declares
 * a near-opaque white, so the cast has to outweigh it rather than merely tint it.
 */
const NEUTRAL_TINT_MIX_BY_TINT: Record<GlassTint, number> = {
  /*
   * Both casts are the pane now, so a neutral surface has to *become* the cast
   * rather than be tinted by it.
   *
   * At the old 0.6 a declared white resolved to `0.4 * white + 0.6 * cast`, which
   * over the artwork's paper lands around luminance 0.2 - a mid grey that carries
   * white ink at only 3.6:1 and reads as neither the reference's charcoal nor its
   * blue. The cast is the glass, so the surface takes it: white ink on a declared
   * white surface then lands where the cast itself lands, which is the depth the
   * reference's own cards have.
   */
  white: 0.94,
  sky: 0.94,
};
/* ------------------------------- text ramp ------------------------------- */

/*
 * The app's text ramp, as committed after the wallpaper changed.
 *
 * These are the values the app has always drawn in its own styles, gathered
 * here so the contrast they produce is asserted rather than assumed. They are
 * dark ink and they stay dark: the wallpaper is the crew artwork on white paper,
 * so the readable combination over it is dark text on light glass. White text is
 * the one thing this wallpaper cannot support — over the pale surfaces as they
 * resolve over paper it manages about 1.6:1.
 *
 * Measured against the artwork at the default weight, worst case over its lifted
 * shadows and typical case over its paper field:
 *
 *   heading   7.43:1 worst   8.57:1 typical
 *   body      6.44:1 worst   7.66:1 typical
 *   secondary 4.47:1 worst   5.31:1 typical
 *
 * Nothing here is used on a saturated fill: the labels on the app's lemon
 * buttons keep the separate darker ink that makes them readable.
 */
export const TEXT_ON_GLASS = {
  heading: "#4B4651",
  body: "#5A5560",
  secondary: "#666070",
} as const;

/** The mix for a cast, falling back to the pale wash for an unknown one. */
function neutralMixFor(tint: GlassTint): number {
  return NEUTRAL_TINT_MIX_BY_TINT[tint] ?? NEUTRAL_TINT_MIX;
}

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
let activeTint: GlassTint = "white";

/** Called by the appearance provider when the member changes the glass colour. */
export function setActiveGlassTint(tint: GlassTint): void {
  activeTint = tint === "sky" ? "sky" : "white";
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
 * Re-resolve a fill that was resolved too early, at render time.
 *
 * This exists because of how React Native style tables work, and it is the last
 * of the white/glass defects rather than a new feature.
 *
 * Every style in this app is declared in a module-scope `StyleSheet.create`
 * table. That table is evaluated **once**, when the file is first imported —
 * long before the member's glass weight has been read out of storage. So a fill
 * written as `glassNestedFill(...)` inside a style table is resolved against the
 * *default* weight and then frozen in that style object for the rest of the
 * session. The member drags the opacity control, the provider re-renders, and
 * every card, row, chip and toggle keeps the setting it was built with.
 *
 * That is why the complaint survived every earlier pass: the patches had been
 * converted to glass, and the glass was correct, but it could never move.
 *
 * The fix is to treat a resolved fill as a *value* rather than a colour. Rising
 * the weight within one cast moves every channel the same way, so comparing each
 * channel against the neutral mid-grey recovers the direction the fill was
 * resolved in; re-applying that difference to the cast currently selected
 * reproduces the same fill at the current weight, for every surface class and
 * every declared alpha, without carrying the tint or the weight around in the
 * style table.
 *
 * The convention this relies on is already the only one in the codebase: a
 * surface that wants no colour of its own declares a neutral — white or grey —
 * and a surface that wants to keep its hue declares a saturated fill. A
 * saturated fill is left exactly as it was resolved, which is what keeps the
 * lemon buttons lemon.
 */
export function liveGlass(color: string | undefined | null): string | undefined {
  if (!color) return color as undefined;
  const parsed = parseColor(color);
  if (!parsed) return color as string;

  /*
   * Undo the resolution to recover what was declared.
   *
   * The resolver computes `mix(declared, cast, m)`, so a resolved neutral is
   * `declared * (1 - m) + cast * m`. That is one equation in two unknowns — the
   * neutral that was declared and the cast it was resolved against — and both
   * were thrown away when the style table was built.
   *
   * It is still exactly solvable, because the cast can only be one of three known
   * values. For each candidate cast the neutral is `(resolved - cast * m) / (1 - m)`,
   * and only the correct candidate yields something that is actually a plausible
   * declared surface: light and close to grey. The wrong candidates produce
   * impossible colours — a channel below zero, or a strongly tinted "neutral".
   * So the solve is a search over three options scored on how neutral and light
   * the recovered value is, and it recovers the declared colour exactly rather
   * than approximating it.
   */
  const m = neutralMixFor(activeTint);
  let best: { neutral: Rgb; score: number } | null = null;
  for (const cast of Object.values(TINTS)) {
    const neutral = {
      r: (parsed.rgb.r - cast.r * m) / (1 - m),
      g: (parsed.rgb.g - cast.g * m) / (1 - m),
      b: (parsed.rgb.b - cast.b * m) / (1 - m),
    };
    const rounded: Rgb = {
      r: Math.round(neutral.r),
      g: Math.round(neutral.g),
      b: Math.round(neutral.b),
    };
    // A declared surface is a light neutral. Penalise anything that is not.
    const chroma = Math.max(rounded.r, rounded.g, rounded.b) - Math.min(rounded.r, rounded.g, rounded.b);
    const darkness = Math.max(0, 240 - Math.min(rounded.r, rounded.g, rounded.b));
    const outOfRange =
      [neutral.r, neutral.g, neutral.b].some((c) => c < -0.5 || c > 255.5) ? 1000 : 0;
    const score = chroma + darkness + outOfRange;
    if (!best || score < best.score) best = { neutral: rounded, score };
  }
  if (!best) return color as string;
  /*
   * The catch-all for everything that is *not* a resolved neutral.
   *
   * This is what separates the app's accents from its glass without keeping a
   * register of them. A saturated fill was passed through the resolver untouched,
   * so no candidate cast can invert it back into a light neutral: solving the
   * lemon button's `#666666` against any cast demands a channel above 255, which
   * is an impossible surface. Only a fill the resolver actually produced inverts
   * cleanly, so the guard is a consequence of the algebra rather than a threshold.
   *
   * Note the inversion is deliberately *not* gated on `isNeutral(resolved)`. A
   * resolved neutral legitimately carries more chroma than the neutral that went
   * in, because mixing it toward the cast adds the cast's own hue — the sky cast
   * alone takes it from at most 26 to about 38. Gating on the resolved colour's
   * chroma rejected the very values this function exists to fix, which is how the
   * first attempt silently returned every fill unchanged.
   */
  const recoveredChroma =
    Math.max(best.neutral.r, best.neutral.g, best.neutral.b) -
    Math.min(best.neutral.r, best.neutral.g, best.neutral.b);
  if (recoveredChroma > NEUTRAL_CHROMA) return color as string;

  // Now re-resolve the recovered surface against the cast in effect right now.
  const live = mix(best.neutral, TINTS[activeTint], m);
  /*
   * The weight, recovered by subtraction rather than by counting.
   *
   * Alpha is always `base + declaredWeight + weightFromSetting(opacity)`, and the
   * setting's contribution is the only term that varies at render time. A style
   * table is evaluated once, at import, before the member's stored weight has been
   * read — so every frozen fill carries the contribution of the module's own
   * initial weight, 80, and nothing else. Subtracting that fixed contribution and
   * adding the current one moves the fill to where it belongs at any setting,
   * including the nesting band and the per-surface weights, which are baked into
   * the value already.
   */
  const frozenSetting = weightFromSetting(80);
  const targetAlpha = clampAlpha(
    (parsed.alpha ?? BASE_ALPHA + frozenSetting) - frozenSetting + weightFromSetting(activeOpacity),
  );
  return `rgba(${live.r}, ${live.g}, ${live.b}, ${targetAlpha.toFixed(3)})`;
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
  /*
   * All three presets use the ash cast.
   *
   * A preset is a weight, and the cast is a separate question the chips below it
   * answer. Pointing the presets at the system default means the shipped
   * appearance lights "Balanced" when the member opens the panel, rather than
   * showing three unselected presets beside a cast they never chose. A member who
   * picks a colour keeps it — the presets only set weight — and picking a preset
   * afterwards returns the surface to ash.
   */
  { id: "subtle", label: "Subtle", glassOpacity: 50, glassTint: "white" },
  { id: "balanced", label: "Balanced", glassOpacity: 80, glassTint: "white" },
  { id: "strong", label: "Strong", glassOpacity: 95, glassTint: "white" },
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
 * The sections the bar can be sitting over, plus the plan feed, which is reached
 * from the chat header and shown by the Hangouts entry.
 */
export type TabAccent =
  | "chats"
  | "groups"
  | "hangouts"
  | "bizz"
  | "profile";

const TAB_ACCENT_OFFSET: Record<TabAccent, number> = {
  chats: -0.03,
  // Groups is a dense list of rows, like the chat inbox but shorter, so it sits
  // between the two extremes rather than repeating the inbox's lightest weight.
  groups: -0.01,
  // Hangouts is a short list of plan cards over artwork, so it sits mid-weight.
  hangouts: 0,
  // Bizz starts as a mostly empty screen, so its bar leans heavier.
  bizz: 0.03,
  // Profile is mostly settings panels, the densest reading surface in the app,
  // so its bar is the heaviest — the blur has to work hardest there.
  profile: 0.04,
};

/**
 * Alpha for the tab bar over a given tab.
 *
 * The cast is a parameter rather than read from the module, because the tab bar
 * is drawn at render time and a caller that has the value in hand should not
 * depend on the mirror being current.
 */
export function tabBarAlpha(
  tab: TabAccent | null,
  glassOpacity: number,
  tint: GlassTint = activeTint,
): number {
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
  /*
   * The bar is the one surface that deliberately did *not* follow BASE_ALPHA up.
   *
   * Its weights were calibrated as offsets from the base, and the bar carries the
   * app's only two-state control: an active pill with dark ink on it and an inactive
   * icon in a mid-grey. That pair only works while the bar stays light. Measured at
   * the raised base, the bar composite dropped to #A3A3A2, where a quiet icon needs
   * near-black to clear 3:1 — which is the same ink the active pill uses, so the
   * active and inactive states would have become indistinguishable.
   *
   * Absorbing the 0.04 here keeps the bar exactly where it was calibrated while every
   * card, panel, field and row gains the depth the member asked for.
   */
  tab: 0.08,
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

/**
 * Map a nested surface's declared alpha onto the nested weight band.
 *
 * The declared alpha runs roughly 0.4 (quietest) to 1 (most present). Keeping it
 * as an *ordering* rather than a magnitude is what stops a row, a tile, and a
 * highlighted tile inside one sheet from collapsing onto the same weight. Pulled
 * out of the resolver so the live re-resolver can apply the identical rule.
 */
function nestedWeightForDeclared(declared: number): number {
  const position = Math.min(1, Math.max(0, (declared - 0.4) / 0.5));
  return NESTED_MIN_WEIGHT + position * (NESTED_MAX_WEIGHT - NESTED_MIN_WEIGHT);
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

/**
 * The relative luminance of a colour, 0 (black) to 1 (white).
 *
 * Used to police the one invariant the whole material depends on: a glass surface is
 * a *pane*, so it is darker than the page behind it, and white ink on it is legible.
 */
function surfaceLuminance(c: Rgb): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * The deepest a glass surface is allowed to be, as a fraction of its distance to
 * black, and the factor that takes it there.
 *
 * The glass is a dark pane over the member's artwork, so it has to *be* dark - that
 * is the structure of the design, not a preference. Two paths could still produce a
 * light surface: a declared fill whose colour was recovered wrongly, and a nested
 * band that ended up below a cast it was meant to sit inside. Rather than trusting
 * every caller, this clamps the result: if a surface lands above the ink floor, it is
 * pulled down onto it. The floor is the point where white ink measures 4.5:1, so any
 * surface that survives this guard carries its own label.
 */
/*
 * The luminance a surface is pulled down to, chosen with margin rather than to the
 * exact crossing: 4.5:1 sits at 0.184, and 0.175 measures 4.71:1, which leaves room
 * for a channel rounding the wrong way without any surface falling back under AA.
 */
/**
 * The luminance every surface must reach for its own ink to be legible.
 *
 * This was 0.175 and was a *floor*: the app painted dark panes, so a surface had to be
 * darker than 0.175 for white type on it to clear AA. The app now paints light panes
 * with dark mauve ink, so the same constraint reads the other way - the surface must be
 * *lighter* than 0.52. That number is not a guess: the shipped ink #4B4651 has a
 * luminance of 0.065, so 4.5:1 needs the surface at 0.467, and 0.52 carries the margin
 * that stops a channel rounding the wrong way from dropping it back under.
 */
const INK_CEILING_LUMINANCE = 0.52;
const INK_FLOOR_LUMINANCE = INK_CEILING_LUMINANCE;

/**
 * The colour a translucent surface actually shows over the page.
 *
 * The ink sits on the *landed* colour, not on the declared one: `rgba(150,200,240,
 * 0.34)` is not a pale blue, it is whatever it composites to over the artwork - and at
 * a low alpha that is very close to the page. Measuring the declared value was the
 * hole in the first version of this guard, and it let a tinted fill through at 2.78:1.
 */
const PAGE_GROUND: Rgb = { r: 250, g: 248, b: 247 };
function landed(c: Rgb, alpha: number): Rgb {
  return {
    r: Math.round(c.r * alpha + PAGE_GROUND.r * (1 - alpha)),
    g: Math.round(c.g * alpha + PAGE_GROUND.g * (1 - alpha)),
    b: Math.round(c.b * alpha + PAGE_GROUND.b * (1 - alpha)),
  };
}

/**
 * Pull a surface down until it carries white ink once it has landed.
 *
 * Bisection on the darkest the surface may be, searching over the *landed* colour,
 * so a high-alpha surface and a low-alpha one are held to the same result rather than
 * to the same number.
 */
function lightenToInkFloor(c: Rgb, alpha: number): Rgb {
  /*
   * The guard, inverted for dark ink.
   *
   * The app now paints a *light* frosted pane carrying dark mauve ink, so the failure
   * mode is the opposite of the one this guard was written for: a surface that is too
   * **dark** for its own label. The mechanism is unchanged - solve the landed colour,
   * not the declared one, because a translucent fill only has a contrast ratio once it
   * has composited over the page - but the direction is now toward white.
   *
   * Mixing toward white rather than scaling the channels is what keeps the hue: a
   * multiply would drive a tinted surface to black, while a mix washes it toward the
   * ground evenly, so a mauve stays mauve and a sky-blue stays cool.
   */
  if (surfaceLuminance(landed(c, alpha)) >= INK_CEILING_LUMINANCE) return c;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const lifted: Rgb = {
      r: Math.round(c.r + (255 - c.r) * mid),
      g: Math.round(c.g + (255 - c.g) * mid),
      b: Math.round(c.b + (255 - c.b) * mid),
    };
    if (surfaceLuminance(landed(lifted, alpha)) >= INK_CEILING_LUMINANCE) hi = mid;
    else lo = mid;
  }
  const t = hi;
  return {
    r: Math.round(c.r + (255 - c.r) * t),
    g: Math.round(c.g + (255 - c.g) * t),
    b: Math.round(c.b + (255 - c.b) * t),
  };
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

/**
 * Alpha for one named surface, before the cast is applied.
 *
 * The two arguments are independent: the weight decides how much of the
 * wallpaper survives into the surface, and the cast decides the colour laid over
 * it. Only the cast changes the weight at all, and only for dusk.
 */
export function glassAlpha(
  surface: GlassSurface,
  glassOpacity: number,
  tint: GlassTint = activeTint,
): number {
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
  /*
   * A trace of light on the face, not a film over it.
   *
   * The sheen was 0.34 when it was lighting a pale pane. A dark pane over a bright
   * page has the opposite need: at 0.34 a light sheen lifts the card from #4E5054 to
   * #5E5E5E, which is a mid grey with no depth left in it. The reference's own
   * highlight is not a wash over the face - it is the bright *rim* plus a pool of
   * light along the top edge, both of which are drawn separately. So this keeps only
   * enough to stop the face reading as flat paint.
   */
  const alpha = Math.min(0.07, glassAlpha(surface, glassOpacity) * 0.09);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/**
 * Blur strength for `expo-blur`'s intensity, which is a 0-100 scale. Frosted
 * glass needs a genuinely heavy blur or the backdrop stays legible through the
 * surface and the tint reads as a stain rather than frost.
 */
export function glassBlur(surface: GlassSurface): number {
  const base: Record<GlassSurface, number> = {
    card: 78,
    panel: 82,
    row: 62,
    chip: 52,
    tab: 72,
    field: 50,
    // A nested surface blurs what is already blurred, so it needs less.
    floater: 58,
  };
  return base[surface] ?? 58;
}

/** The rim highlight that makes the surface feel physical. */
export function glassEdge(surface: GlassSurface, tint: GlassTint = activeTint): string {
  /*
   * The reference sheet's rim is opaque in the middle and fades at the corners,
   * which is what gives the card a physical edge rather than a drawn outline. The
   * card and the bar carry the brightest rim; a row inside a sheet needs less, or
   * every inner line competes with the sheet it sits on.
   */
  const strength: Record<GlassSurface, number> = {
    card: 0.92,
    panel: 0.86,
    // A row and a chip are the surfaces the member reads most often, and they
    // were the two carrying a rim too faint to see. A light translucent fill over
    // a light page barely differs from the page at any alpha — the rim is what
    // separates it, which is exactly how the reference cards work.
    row: 0.78,
    chip: 0.72,
    tab: 0.86,
    field: 0.56,
    floater: 0.66,
  };
  const { r, g, b } = tint === "sky" ? { r: 232, g: 244, b: 255 } : { r: 255, g: 255, b: 255 };
  return `rgba(${r}, ${g}, ${b}, ${strength[surface] ?? 0.6})`;
}

/**
 * The outline for an input, which has to be *seen* rather than caught.
 *
 * `glassEdge` is a highlight: a white rim over a pale page, which is what makes
 * a card look like a lit sheet of glass. The same white rim around an input is
 * useless — measured over the artwork it differs from the page by about 2% of
 * luminance, and the search box read as a rectangle with no border at all.
 *
 * A field needs the opposite polarity: a line slightly *darker* than the glass
 * it encloses, in the member's own cast, so it reads as a groove rather than a
 * glow. A cool cast gives a cool grey line and a warm one gives a warm grey, so
 * the box follows the same setting as everything else.
 *
 * The alpha is not a taste decision. A field boundary is a non-text element
 * that carries meaning — it is how an input is told apart from a card — so it
 * is held to 3:1 against the surface behind it, the same as the rating the
 * contrast tests apply to the rest of the app. Solved over the lightest glass
 * the app draws, 0.66 lands each cast at 3.2:1; 0.42, the value the sheet's
 * highlight uses, measured 1.5:1 and was invisible.
 */
export function glassFieldBorder(tint: GlassTint = activeTint): string {
  /*
   * Solved for 3:1 against the page at this alpha, not guessed. The neutral rule
   * is achromatic so it reads as a grey hairline over the scene; the sky rule
   * leads with blue so it belongs to the cool cast.
   */
  const line = tint === "sky" ? { r: 75, g: 83, b: 91 } : { r: 82, g: 82, b: 82 };
  return `rgba(${line.r}, ${line.g}, ${line.b}, 0.66)`;
}

/**
 * A soft, cool shadow, and the opacity to cast it at.
 *
 * The reference card's depth is a shadow rather than a dark fill: measured
 * beneath the card it runs about 11% darker than the page, which is what lifts
 * the glass off the wallpaper. A shadow is not a substitute for a light surface
 * either — the card still sits proud by being lighter than the page around it.
 */
export const GLASS_SHADOW = "rgba(58, 76, 98, 0.34)";
export const GLASS_SHADOW_OPACITY = 0.3;

/*
 * The rim, and the second hairline just inside it.
 *
 * Measured off the supplied samples, and this is what actually makes them read
 * as glass: a single flat border does not. Each card has a bright outer edge —
 * pure white in the sky and lemon samples, near-white in the neutral one — and
 * then, two or three pixels in, a thin inner line carrying the card's own cast,
 * bright blue in the sky sample and bright yellow in the lemon one. The pair is
 * what gives the sheet a physical thickness, like the ground edge of real glass.
 *
 * The first attempt at this app's glass had one rim at half opacity, which is
 * why it read as a drawn outline rather than as a lit edge.
 */
export const GLASS_RIM_INNER_INSET = 4;

/**
 * The colour field the glass sits over.
 *
 * This is the other half of why the samples read as glass, and the reason the
 * app's cards did not: their backdrops are saturated — a lemon, a blue ring, a
 * grey marble — so the blur has real colour to soften and the card visibly picks
 * that colour up. The app's backdrop was a pale drawing under a wash that had
 * been flattened to a near-uniform cream, so every card came out the same cream
 * as the page behind it and there was no depth to see.
 *
 * These are the three pools of colour laid behind the content, tuned per cast, so
 * a card over one of them genuinely shows it through.
 */
/**
 * How present the backdrop field is on each section.
 *
 * This is the per-screen half of the glass weight. The bar already carries a
 * per-tab alpha offset, but the *content* did not follow it, so the bar read
 * heavy over a dense list and washed out over an open screen while the cards
 * behind it stayed identical.
 *
 * The section's weight is expressed here, in the thing behind the glass, rather
 * than as a second hidden alpha offset. That is a deliberate choice: a per-section
 * alpha would have to be threaded through every resolver *and* through
 * `liveGlass`'s recovery of the frozen style tables, and getting that wrong would
 * put the render-site fills and the style-table fills out of step — the exact
 * class of bug this file spent a pass removing. Changing the backdrop instead
 * cannot desynchronise anything, because it is one value read in one place.
 *
 * It is also the honest lever for the problem: a dense list of small rows wants a
 * calmer field so the rows stay the subject, and an open screen wants a richer one
 * because there is room for the glass to show something. The spread is bounded by
 * contrast — the strongest setting here is 1.25x, which puts the field at 0.275 and
 * still leaves the body ink at 4.7:1 over the darkest wallpaper pixel.
 */
export type AmbientSection = "chats" | "groups" | "hangouts" | "bizz" | "profile";

const AMBIENT_INTENSITY: Record<AmbientSection, number> = {
  // A dense column of small rows. The field is quietest here so the rows stay the
  // subject rather than the backdrop.
  chats: 0.78,
  groups: 0.9,
  // A short list of plan cards over artwork, with room for the glass to show.
  hangouts: 1.15,
  // Mostly an open screen, so the field carries more of the page.
  bizz: 1.25,
  // Settings panels: the densest reading surface in the app, so neutral.
  profile: 1.0,
};

/** The backdrop field's intensity for a section. Unknown sections stay neutral. */
export function ambientIntensityFor(section: AmbientSection | null | undefined): number {
  return (section && AMBIENT_INTENSITY[section]) ?? 1;
}

/**
 * The tile behind an empty state's icon, tinted with that section's own field.
 *
 * An empty state is the one screen where there is nothing else to look at, so it
 * is where the section's identity should be most legible — and it is currently the
 * least: every empty state in the app used one fixed cream tile, so Chats, Groups
 * and Bizz all announced themselves identically.
 *
 * Rather than invent a palette per section, this reuses the colour that section's
 * backdrop already has. The tile is therefore literally tinted with the field
 * behind it, which is both the cheapest possible way to make the sections
 * distinguishable and the most honest: the member is not learning a new code, they
 * are seeing more of what is already on screen.
 *
 * The alpha is the field's own alpha lifted to where a small tile can carry it. A
 * tile is 53 points across, far smaller than a pool, so it needs more presence than
 * the field to read as the same colour — but it sits under an icon, not under text,
 * so it is not bound by the AA floor that constrains the field itself.
 */
/**
 * The active tab pill's fill and the ink that sits on it, for a section.
 *
 * The active tab used one fixed lemon for all five sections, so the bar said
 * "something is selected" but never *what* — while the sections had already been
 * given distinct backdrops and empty-state tiles. This finishes that: the pill is
 * filled with the same colour the section's field is made of, so the active tab
 * matches the screen it is sitting under.
 *
 * The ink is derived rather than fixed. The old label colour was a dark lemon that
 * only worked because every pill was lemon; on the sky and ash pills it would sit
 * as a muddy yellow on blue. Each section's ink is chosen to clear 4.5:1 on that
 * section's own pill over the darkest wallpaper pixel, which is the condition the
 * label actually renders under.
 */
const TAB_INK: Record<AmbientSection, string> = {
  /*
   * One ink for all five sections, and it is dark mauve.
   *
   * The pill is a light mauve pane now, so its label has to be an ink rather than a
   * highlight - white on this surface would be the light-on-light that made the bar
   * unreadable. One value for all five because the five pills share a depth: a
   * five-way table is a maintenance trap, and it only existed when the pills had been
   * given five different hues.
   */
  chats: "#3A3440",
  groups: "#3A3440",
  hangouts: "#3A3440",
  bizz: "#3A3440",
  profile: "#3A3440",
};

export function glassTabAccent(
  section: AmbientSection | null | undefined,
  tint: GlassTint = activeTint,
): { fill: string; ink: string } {
  /* A caller with no section gets the shipped mauve rather than silently taking
     Chats' colour, which would claim a selection that does not exist. */
  if (!section || !(section in TAB_INK)) return { fill: "rgba(169, 150, 172, 0.72)", ink: "#3A3440" };
  const key = section as AmbientSection;

  /*
   * The pill is a light pane of the section's own colour.
   *
   * It used to be a dark chip carrying white type, which belonged to the dark system.
   * On a light page the active control is the *more present* one, and presence here
   * means saturation rather than depth - so the pill is the page mixed toward the
   * section's accent, which keeps the section identifiable and keeps the bar calm.
   */
  const accent = (tint === "sky" ? SKY_SECTION_ACCENT : SECTION_ACCENT)[key].tile;
  const h = accent.replace('#', '');
  const a = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  /*
   * Mixed by measurement, not by eye. At 0.34 toward the accent over the warm page the
   * pill lands near 0.62 luminance, and the ink below (#3A3440, luminance 0.045) clears
   * 5.0:1 on it while the pill still reads clearly as a tinted pane against the page.
   */
  const PILL_MIX = 0.34;
  const mixTo = (c: number, ground: number) => Math.round(ground + (c - ground) * PILL_MIX);
  return {
    fill: `rgba(${mixTo(a[0], PAGE_GROUND.r)}, ${mixTo(a[1], PAGE_GROUND.g)}, ${mixTo(a[2], PAGE_GROUND.b)}, 0.92)`,
    ink: TAB_INK[key],
  };
}

/**
 * The quiet ink for an *inactive* tab: its icon and its label.
 *
 * Both were fixed values that measured below their own accessibility floors against
 * the bar they actually sit on — the icon at 1.79:1 against a 3:1 floor for a
 * graphical object, and the label at 2.01:1 against 4.5:1 for text. The bar is a
 * light glass panel, so a mid-grey icon on it was never going to clear anything.
 *
 * This also answers the question the per-section idea could not. Tinting the
 * inactive icons per *section* is not achievable: measured across the blend range,
 * the five inks converge on a single grey at the lightness where an inactive icon
 * still reads as inactive (channel spread of 3 at 15%, needing 45% before they
 * separate — by which point they look selected). Tying them to the *cast* does
 * work, because the cast is a wider spread and the member chose it deliberately, so
 * the bar now carries their cast even where nothing is selected.
 *
 * The two inks are kept at one hue weight so they stay a matched pair, and each is
 * solved to its own floor: the icon to 3:1, the label to 4.5:1.
 */
const QUIET_ICON_INK: Record<GlassTint, string> = {
  /* Dark, because the bar is a light glass surface now. The values are the mirror of
     the light inks these replaced - solved to 3:1 for a graphical object against the
     lightest bar each cast can produce, which is the worst case for dark ink. */
  white: "#5A5560",
  sky: "#4A5666",
};
const QUIET_LABEL_INK: Record<GlassTint, string> = {
  /* The label is text, so it takes the stricter 4.5:1 floor on the same surface. */
  white: "#4B4651",
  sky: "#3E4A5A",
};

export function glassQuietTabInk(tint: GlassTint = activeTint): { icon: string; label: string } {
  return {
    icon: QUIET_ICON_INK[tint] ?? QUIET_ICON_INK.white,
    label: QUIET_LABEL_INK[tint] ?? QUIET_LABEL_INK.white,
  };
}

/**
 * The ink for a surface carrying a section's own hue.
 *
 * Two different jobs, two different floors, so they are two different values:
 *
 *   tile    the glyph on an empty-state tile. A graphical object, so 3:1 is the
 *           floor, but an icon is the only thing on an otherwise empty screen and
 *           has to look deliberate rather than merely legal, so each is solved to
 *           6:1 against the tile it actually sits on.
 *   eyebrow the small caps label above a section's list. Text, so 4.5:1 is the
 *           floor, solved to 5.5:1 because it is set at 12px with wide letter
 *           spacing — the least forgiving combination in the app.
 *
 * Each is a darkened point on the section's own hue rather than a neutral, so the
 * accent reads as the section's colour and not as generic grey. They are solved
 * against the darkest ground each can land on — for the eyebrow that is the
 * artwork's own line work, not its paper field, because the page wash does not
 * cover the whole screen.
 */
const SECTION_ACCENT: Record<AmbientSection, { tile: string; eyebrow: string }> = {
  /*
   * The original dusty mauve family, one tone per section.
   *
   * These are the values the app shipped with before the lemon pass replaced them, and
   * before a later pass took the hue out entirely. Each is the ink for a tinted tile
   * and for that section's header label on the light page, so they are dark enough to
   * read on the warm off-white ground.
   */
  chats: { tile: "#8E6F91", eyebrow: "#785F7C" },
  groups: { tile: "#7393A9", eyebrow: "#5A697B" },
  hangouts: { tile: "#7A8FA0", eyebrow: "#5F6877" },
  bizz: { tile: "#987998", eyebrow: "#776079" },
  profile: { tile: "#766B82", eyebrow: "#6E6379" },
};
/**
 * The accent for a section: the ink for its tinted tile and its header label.
 *
 * An unknown section falls back to Chats, so a caller without one gets a real
 * accent rather than a colour that belongs to nothing.
 */
/**
 * The section's accent, which follows the cast.
 *
 * The default cast is monochrome, so its accents are five *depths* - the sections stay
 * distinguishable without any of them introducing a colour. The sky cast is the one the
 * member switches on when they want colour, so it is the one that gets the five hues
 * back. Splitting it this way is what makes "monochrome by default, sky blue on request"
 * a property of the material rather than a promise: there is no path by which a
 * saturated accent can reach a default screen, because the table it would come from is
 * only read when the sky cast is active.
 */
const SKY_SECTION_ACCENT: Record<AmbientSection, { tile: string; eyebrow: string }> = {
  /* The same five sections in their warm tones, for when the member has the distinct
     cast on. The default set above is the cool mauve; these are the counterparts. */
  chats: { tile: "#987998", eyebrow: "#776079" },
  groups: { tile: "#588B79", eyebrow: "#4E6D66" },
  hangouts: { tile: "#8E7894", eyebrow: "#726278" },
  bizz: { tile: "#9D7E9E", eyebrow: "#756078" },
  profile: { tile: "#715C78", eyebrow: "#715C78" },
};

export function glassSectionAccent(
  section: AmbientSection | null | undefined,
  tint: GlassTint = activeTint,
): { tile: string; eyebrow: string } {
  const key = section && SECTION_ACCENT[section] ? section : "chats";
  if (tint === "sky") return SKY_SECTION_ACCENT[key];
  // The eyebrow is the same ink on every section under the default cast: it is a page
  // label, and a page label that changed depth per section would read as five labels
  // rather than one kind of label. The tile is where the section is identifiable.
  return SECTION_ACCENT[key];
}
export function glassEmptyAccent(
  section: AmbientSection | null | undefined,
  tint: GlassTint = activeTint,
): string {
  const field = glassAmbient(tint, ambientIntensityFor(section), section);
  const nums = field.warm.match(/[\d.]+/g) ?? [];
  if (nums.length < 4) return "rgba(255, 255, 255, 1)";
  const [r, g, b, a] = nums.map(Number);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(EMPTY_TILE_ALPHA_CAP, a * EMPTY_TILE_LIFT).toFixed(3)})`;
}

/**
 * The backdrop field, keyed by section.
 *
 * Each section gets its own hue so the sections are actually distinguishable, which
 * strength alone could not do. Chats stays the original cool blue; the others sit
 * nearby in the same family rather than becoming five unrelated brand colours.
 */
const AMBIENT_FIELD: Record<AmbientSection, { warm: string; cool: string; soft: string }> = {
  /*
   * Dark pools, not light ones.
   *
   * The field used to be pale washes laid over a pale page, which meant the glass had
   * nothing to diffuse and every surface composited toward white. On the dark page
   * these are the light *sources* - they sit under the glass and give it a scene to
   * blur, which is what a backdrop field is for. Each keeps its section's hue so the
   * sections remain distinguishable.
   */
  /*
   * The neutral field, which is the shipped one.
   *
   * The default cast is black and white, so its backdrop must not introduce a hue -
   * a blue wash under a monochrome interface is the mixing the member rejected. What
   * distinguishes the sections here is *depth*, not colour: each pool is the same
   * neutral at a slightly different strength, which reads as five related grounds
   * rather than five palettes. The hue lives in the sky field below, where the member
   * has explicitly asked for colour.
   */
  chats:    { warm: "rgba(187, 187, 187, 0.30)", cool: "rgba(171, 171, 171, 0.28)", soft: "rgba(203, 203, 203, 0.26)" },
  groups:   { warm: "rgba(177, 177, 177, 0.32)", cool: "rgba(161, 161, 161, 0.30)", soft: "rgba(195, 195, 195, 0.28)" },
  hangouts: { warm: "rgba(169, 169, 169, 0.34)", cool: "rgba(153, 153, 153, 0.32)", soft: "rgba(189, 189, 189, 0.30)" },
  bizz:     { warm: "rgba(161, 161, 161, 0.36)", cool: "rgba(145, 145, 145, 0.34)", soft: "rgba(183, 183, 183, 0.32)" },
  profile:  { warm: "rgba(191, 191, 191, 0.28)", cool: "rgba(175, 175, 175, 0.26)", soft: "rgba(207, 207, 207, 0.24)" },
};
/**
 * The sky cast's field: the same five sections, in colour.
 *
 * Split from the neutral field rather than derived from it, because a shift applied
 * to a neutral grey can only produce another grey - there is no hue to rotate. These
 * are the section hues the app already had, kept for the cast that asks for colour.
 */
const SKY_FIELD: Record<AmbientSection, { warm: string; cool: string; soft: string }> = {
  chats:    { warm: "rgba(150, 200, 240, 0.34)", cool: "rgba(120, 172, 222, 0.32)", soft: "rgba(178, 216, 246, 0.30)" },
  groups:   { warm: "rgba(140, 214, 198, 0.34)", cool: "rgba(112, 186, 170, 0.32)", soft: "rgba(168, 226, 212, 0.30)" },
  /*
   * Hangouts and Bizz keep a hue, but not the lemon one.
   *
   * These two were the gold family, and gold was withdrawn. They are field pools -
   * they sit *under* the glass and are never inked - so replacing them with white, as
   * the warm-fill sweep did elsewhere, would have flattened a deliberate composition
   * into the same wash as everything else. Instead they take hues that are distinct,
   * restrained and unambiguously not lemon: a warm terracotta and a muted plum, both
   * at the strength the rest of the field uses.
   */
  hangouts: { warm: "rgba(226, 168, 128, 0.34)", cool: "rgba(198, 142, 104, 0.32)", soft: "rgba(238, 190, 158, 0.30)" },
  bizz:     { warm: "rgba(196, 166, 206, 0.34)", cool: "rgba(168, 138, 180, 0.32)", soft: "rgba(214, 190, 222, 0.30)" },
  profile:  { warm: "rgba(198, 190, 240, 0.34)", cool: "rgba(170, 160, 224, 0.32)", soft: "rgba(216, 210, 246, 0.30)" },
};
/**
 * How the sky cast shifts a section's own hue.
 *
 * The cast must still mean something once the section owns the colour, so sky is
 * derived from each section's hue rather than replacing it: red is pulled down and
 * green slightly, blue held. These three factors reproduce the original sky values
 * exactly when applied to Chats' original blue, so the shipped sky look is unchanged
 * and every other section simply gains the same treatment.
 */
const SKY_SHIFT = { r: 0.787, g: 0.907, b: 0.988 };
/**
 * The field for a cast and a section.
 *
 * An unknown or missing section falls back to Chats rather than to an arbitrary
 * entry, so a caller without a section gets a real field instead of nothing.
 */
function ambientFieldFor(
  tint: GlassTint,
  section: AmbientSection | null | undefined,
): { warm: string; cool: string; soft: string } {
  const key: AmbientSection = section && AMBIENT_FIELD[section] ? section : "chats";
  // Two fields rather than one shifted: the neutral cast has no hue to rotate, so a
  // shift applied to its greys could only return greys. Each cast reads its own table.
  return tint === "sky" ? SKY_FIELD[key] : AMBIENT_FIELD[key];
}
/**
 * The soft pools of colour the glass sits over, for a cast and a section.
 *
 * The alphas in the table are the *base* field; the section's intensity scales
 * them. Scaling every pool by the same factor keeps the composition — the pools
 * do not move or change relative weight, so a screen only reads as calmer or
 * richer, never as a different arrangement.
 */
export function glassAmbient(
  tint: GlassTint = activeTint,
  intensity = 1,
  section: AmbientSection | null | undefined = null,
): {
  warm: string;
  cool: string;
  soft: string;
} {
  /*
   * The field's own hue, per section.
   *
   * Until now the field varied between sections only in *strength*: every section
   * drew the same blue pools and `ambientIntensityFor` scaled the alpha. That made
   * a screen quieter or richer but never actually distinguishable — measured, all
   * five sections resolved their empty-state tile to the identical colour
   * `#C6C6C6`, because the tile is the warm pool and the warm pool was one value.
   *
   * These are deliberately not five saturated brand colours. They are five nearby
   * points in one cool family, spaced enough to be told apart side by side and close
   * enough that no screen looks like a different app. A section's identity should be
   * something the member notices after using it for a while, not the first thing
   * they see.
   */
  const chosen = ambientFieldFor(tint, section);
  if (intensity === 1) return chosen;
  if (intensity === 1) return chosen;
  const scale = (color: string) => {
    const nums = color.match(/[\d.]+/g) ?? [];
    if (nums.length < 4) return color;
    const [r, g, b, a] = nums.map(Number);
    /*
     * Clamped so a future intensity cannot run the field past the point where the
     * ink over it stops clearing AA. The base alphas are set so the richest
     * section still fits under the cap - otherwise the clamp would flatten every
     * section onto one alpha, which is what it was doing.
     */
    return `rgba(${r}, ${g}, ${b}, ${Math.min(AMBIENT_ALPHA_CAP, a * intensity).toFixed(3)})`;
  };
  return { warm: scale(chosen.warm), cool: scale(chosen.cool), soft: scale(chosen.soft) };
}

/**
 * The switch track colours for a cast.
 *
 * The samples' controls are pills carrying the card's own colour — a blue pill in
 * the sky card, a white one with dark text in the neutral card. The app's toggles
 * were the last flat elements left: a fixed grey when off and a fixed pastel when
 * on, whatever glass colour the member had chosen. These follow the cast, so a
 * toggle belongs to the same material as the card it sits in.
 */
export function glassSwitchTrack(tint: GlassTint = activeTint): { off: string; on: string } {
  const track: Record<GlassTint, { off: string; on: string }> = {
    /* A grey track: the control is carved from the same stone as the card. */
    white: { off: "rgba(214, 216, 218, 0.92)", on: "rgba(90, 90, 90, 0.95)" },
    sky: { off: "rgba(212, 224, 236, 0.92)", on: "rgba(86, 138, 196, 0.95)" },
  };
  return track[tint] ?? track.sky;
}

/** The inner hairline's colour for a cast. Saturated, unlike the fill. */
export function glassInnerRim(tint: GlassTint = activeTint): string {
  const inner: Record<GlassTint, string> = {
    /* A cool near-white hairline, as the neutral sample's own inner line is. */
    white: "rgba(238, 242, 246, 0.95)",
    /* The sky sample's own ring: a saturated blue line just inside the rim. */
    sky: "rgba(122, 188, 232, 0.95)",
  };
  return inner[tint] ?? inner.sky;
}

/**
 * The soft glow that pools just inside the top rim.
 *
 * Every sample has one: a diffuse light halo inside the upper edge, as though
 * the sheet were catching light from above. It is what stops a large card from
 * reading as a flat panel, because a flat panel has no falloff across it.
 */
export function glassTopGlow(tint: GlassTint = activeTint): string {
  const glow: Record<GlassTint, string> = {
    /* A white glow: light from above is not itself coloured. */
    white: "rgba(255, 255, 255, 0.46)",
    sky: "rgba(198, 226, 248, 0.42)",
  };
  return glow[tint] ?? glow.sky;
}

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
  /*
   * Ash is achromatic, so the saturation lift below would push all three channels
   * away from a mean they already share and return the same grey. A slightly
   * deeper grey is what reads as "grey" against a pale panel, so it is returned
   * directly.
   */
  if (tint === "white") return `rgb(${Math.round(r * 0.78)}, ${Math.round(g * 0.78)}, ${Math.round(b * 0.78)})`;
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
 * The rim inverted with the chips. On the light system a pale swatch disappeared into
 * its own selected state, so the rim was a darkened version of the same hue. The chips
 * are deep now, so the problem is the opposite one - a dark chip vanishes into the dark
 * glass around it - and the rim is a *lit* version of the same hue instead. Deriving it
 * from the chip rather than the raw cast is what keeps the relationship right: the
 * chip's saturation lift moves channels away from the cast's mean, so a rim built from
 * the cast alone could land on the wrong side of the chip it is meant to outline.
 */
export function glassSwatchEdge(tint: GlassTint): string {
  const match = glassSwatch(tint).match(/(\d+), (\d+), (\d+)/);
  const [r, g, b] = match ? match.slice(1).map(Number) : [0, 0, 0];
  /*
   * Lift toward white rather than scaling up, so a chip that is already near a channel
   * ceiling cannot clip and flatten the hue. Each channel travels 42% of the way to
   * white, which is enough to read as a lit edge and small enough to stay the chip's
   * own colour rather than becoming a white ring.
   */
  const lift = (component: number) => Math.round(component + (255 - component) * 0.42);
  return `rgba(${lift(r)}, ${lift(g)}, ${lift(b)}, 0.85)`;
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

  /*
   * A neutral surface *becomes* the cast rather than being tinted by it.
   *
   * The mix was a compromise while the cast was a faint wash over a pale page. Both
   * casts are now the pane itself, so a declared near-white has to end up at the
   * cast's depth - otherwise it stays light and the white ink on it disappears, which
   * is exactly what happened on Groups, Hangouts and the Chats suggestion cards.
   */
  // A named surface can raise the weight further, but never past the ceiling.
  const weight = SURFACE_WEIGHT[surface] ?? 0;
  const finalAlpha = Math.min(MAX_GLASS_ALPHA, Math.max(alpha, BASE_ALPHA + weight));

  /*
   * The ink floor applies to *every* surface, and that is the point.
   *
   * The first version of this guard skipped saturated fills, on the reasoning that an
   * accent button should keep its colour. That was right about accents and wrong
   * about everything else: a pale lemon panel, a warm divider, a cream selected chip
   * and a gold sheet header are all "saturated" by that test, and all of them landed
   * light with white type on them - unreadable, and reading as leftover colour from a
   * theme that was supposed to be gone. Exempting a class of surface from the ink
   * floor means that class is not material at all, it is paint that happens to be
   * translucent.
   *
   * So the rule is now unconditional. A neutral fill takes the cast; every fill, of
   * any hue, is then taken down until white ink clears AA on the colour it actually
   * lands on. The hue survives - it is scaled uniformly, so a warm surface stays warm
   * - but nothing can be too light to carry its own label.
   */
  const neutralDeclared = isNeutral(parsed.rgb);
  const base = neutralDeclared ? mix(parsed.rgb, TINTS[tint], 1) : parsed.rgb;
  const rgb = lightenToInkFloor(base, finalAlpha);

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
  const nestedWeight = nestedWeightForDeclared(declared);

  /*
   * The same landing as the card resolver: a neutral nested surface becomes the cast
   * rather than being tinted by it. A nested surface sits *inside* a card, so it can
   * never be lighter than the card it lives in - and it was, which is why a row inside
   * a sheet came out pale while the sheet around it was dark.
   */
  const neutralDeclared = isNeutral(parsed.rgb);
  const base = neutralDeclared ? TINTS[tint] : parsed.rgb;
  /*
   * The cast's bonus applies here too, which keeps the depth relationship the
   * same under every cast. The nested band sits below a sheet's weight by
   * construction, so the gap between a card and the row inside it is fixed in
   * absolute terms — but dusk's bonus is larger than that whole band. Skipping
   * it here would widen the card-to-row gap under dusk from about 0.11 to 0.17,
   * so surfaces that read as gently inset under the pale casts would read as
   * sharply sunk under the night one.
   */
  const alpha = clampAlpha(BASE_ALPHA + nestedWeight + weightFromSetting(opacity));

  // The same unconditional ink floor as the card resolver. A nested surface is not
  // darkened *because* it is nested - the band above already places it, and taking it
  // further would invert the hierarchy the band exists to create.
  const rgb = lightenToInkFloor(base, alpha);

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
}
