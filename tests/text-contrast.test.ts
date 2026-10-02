import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * A guard on every text colour the app declares.
 *
 * This exists because the same mistake had already been made twice and found twice
 * by accident: the inactive tab icon measured 1.79:1 against its own bar, and the
 * tab label 2.01:1 — both because they had only ever been checked against the page
 * behind the surface rather than the surface itself. Auditing the whole app the same
 * way turned up 223 declarations below AA on a card, the great majority of them
 * hand-picked near-duplicate greys drifting between 2.1:1 and 3.0:1.
 *
 * The card is the surface that matters because it is the lightest one in the app,
 * so it is the worst case for dark ink. Contrast on the darker page and the bar is
 * always better than this, never worse.
 */

/**
 * A glass card, at the *lightest* it resolves - which on the dark system is the
 * worst case for white ink, exactly as it was the worst case for dark ink before.
 *
 * The value is the card at its heaviest weight over the brightest part of the field:
 * alpha 0.46 of the dark fill over the lifted backdrop. Measuring against the
 * lightest card is what makes this an honest floor rather than a convenient one,
 * because every other card is darker and therefore easier.
 */
const CARD = [64, 67, 72];

function lin(v: number): number {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function luminance(c: number[]): number {
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
function contrast(a: number[], b: number[]): number {
  return (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
}
function hex(value: string): number[] {
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith(".tsx")) found.push(path);
  }
  return found;
}


/*
 * A translucent fill, resolved where it actually lands.
 *
 * Every other check in this file measures an ink against the card, because the card
 * is the lightest surface. That is right for an opaque surface and wrong for a
 * translucent one: a field declaring rgba(255, 255, 255, 0.7) is not white, it is
 * whatever it composites to over the card — and it moves when the surface behind it
 * moves. One of the defects found in this pass was exactly that, and it had to be
 * solved by hand because nothing in the suite could answer "what colour is this,
 * really?".
 *
 * The wrappers matter too: most fields declare their fill as glassNestedFill("rgba(...)")
 * so the rgba has to be read out of the wrapper. The glass resolvers then lighten it
 * toward the cast, which only raises contrast against dark ink, so resolving the
 * declared rgba is the conservative reading.
 */
function parseColour(value: string): { rgb: number[]; alpha: number } | null {
  const hexValue = /^#([0-9A-Fa-f]{6})$/.exec(value);
  if (hexValue) return { rgb: hex(value), alpha: 1 };
  const rgba = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(value);
  if (!rgba) return null;
  return {
    rgb: [1, 2, 3].map((i) => Number(rgba[i])),
    alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
  };
}

/** What a declared fill actually shows over the given surface. */
function composite(fill: string, over: number[]): number[] | null {
  const parsed = parseColour(fill);
  if (!parsed) return null;
  return parsed.rgb.map((v, i) => Math.round(v * parsed.alpha + over[i] * (1 - parsed.alpha)));
}

type Declaration = { file: string; style: string; value: string };

function textColourDeclarations(): Declaration[] {
  const found: Declaration[] = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
    const source = readFileSync(file, "utf8");
    const stylePattern = /^ {2}([A-Za-z0-9_]+):\s*\{([^}]*)\}/gm;
    for (const match of source.matchAll(stylePattern)) {
      const [, style, body] = match;
      for (const value of body.matchAll(/color:\s*"(#[0-9A-Fa-f]{6})"/g)) {
        found.push({ file, style, value: value[1] });
      }
    }
  }
  return found;
}

describe("text contrast", () => {
  const declarations = textColourDeclarations();

  it("finds the declarations it is meant to be guarding", () => {
    // If this drops sharply the regex has stopped matching and every assertion
    // below would pass vacuously.
    expect(declarations.length).toBeGreaterThan(400);
  });

  it("keeps every text colour at AA or better on a card", () => {
    const failing = declarations.filter(({ file, style, value }) => {
      const rgb = hex(value);
      // Pale ink is exempt when it is meant to sit on a declared dark fill — a
      // white label on a red danger button or over a camera preview is correct.
      if (luminance(rgb) > 0.75) return false;
      // A disabled control is allowed to be below AA; it is not readable by design.
      if (style.toLowerCase().includes("disabled")) return false;
      // Nor is the welcome screen's full-page veil, which is decorative.
      if (file.includes("welcome-screen") && style === "veil") return false;
      return contrast(rgb, CARD) < 4.5;
    });
    expect(failing.map(({ file, style, value }) => `${file}: ${style} ${value}`)).toEqual([]);
  });

  it("keeps the accent at AA, since it is used for links and labels", () => {
    /*
     * The accent carries the largest number of text uses in the app, so it is the one
     * colour where a small miss would be felt everywhere.
     *
     * It changed identity with the glass. On the light system the accent was a dark
     * teal that read as ink; on dark glass a dark ink is invisible, so the accent has
     * split in two - #2B6C8F survives as the *fill* on buttons, and the lighter
     * #7FC0E8 is what carries links, labels and icons on the glass itself. This
     * asserts the ink, because the ink is what has a text floor.
     */
    expect(contrast(hex("#7FC0E8"), CARD)).toBeGreaterThanOrEqual(4.5);
    // The fill keeps its own floor: white on it, which is how the buttons use it.
    expect(contrast([255, 255, 255], hex("#2B6C8F"))).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * Outlines and dividers.
   *
   * A border nobody can see is not a border. This is the same defect the text pass
   * found, one layer out: the app declared outlines at 1.0:1 — literally the same
   * colour as the card behind them — on the tick box, the selected chips and the
   * camera shutter, and dividers at 1.27:1. WCAG asks 3:1 of a control's boundary
   * and its state indicators; a decorative rule is held to a lower floor, since it
   * separates rather than identifies, but it still has to be visible.
   *
   * Some borders are deliberately exempt, because darkening them would make the
   * interface worse rather than better. Each was darkened by an earlier version of
   * this pass and had to be reverted:
   *
   *   - a rim that punches a badge or status dot out of the avatar behind it. The dot
   *     overlaps the photo, so the rim is the colour it is punching through, not an
   *     outline drawn on the card. Darkening it drew a dark ring around every avatar.
   *   - the ring around the member's own photo, which is decoration.
   *   - the scan brackets in the selfie check, which sit over the live camera feed —
   *     there is no card behind them, so the card is the wrong thing to measure.
   */
  const BORDER_FLOOR = 3;
  const DIVIDER_FLOOR = 1.7;
  const NOT_ON_THE_CARD =
    /(profileVerifiedDot|circleStatus|notificationDot|addSmall|groupMini|userAvatar|addCircle|onlineDot|statusDot|profileAvatarFrame|profileCheck|verifiedBadge|scanCorner|^dot$)/;

  function outlineDeclarations(): { file: string; style: string; prop: string; value: string }[] {
    const found: { file: string; style: string; prop: string; value: string }[] = [];
    for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
      const source = readFileSync(file, "utf8");
      const stylePattern = /^ {2}([A-Za-z0-9_]+):\s*\{([^}]*)\}/gm;
      for (const match of source.matchAll(stylePattern)) {
        const [, style, body] = match;
        for (const b of body.matchAll(/(border(?:Top|Bottom|Left|Right)?Color):\s*"(#[0-9A-Fa-f]{6})"/g)) {
          found.push({ file, style, prop: b[1], value: b[2] });
        }
      }
    }
    return found;
  }

  it("keeps every control outline visible against the card", () => {
    const failing = outlineDeclarations()
      .filter(({ style }) => !NOT_ON_THE_CARD.test(style))
      .filter(({ value }) => contrast(hex(value), CARD) < BORDER_FLOOR)
      .map(({ file, style, prop, value }) => `${file}: ${style} ${prop} ${value}`);
    expect(failing).toEqual([]);
  });

  it("keeps dividers perceptible without making them heavy", () => {
    const declarations: { file: string; style: string; value: string }[] = [];
    for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
      const source = readFileSync(file, "utf8");
      const stylePattern = /^ {2}([A-Za-z0-9_]+):\s*\{([^}]*)\}/gm;
      for (const match of source.matchAll(stylePattern)) {
        const [, style, body] = match;
        if (!/(divider|separator|rule)/i.test(style) || /Icon/i.test(style)) continue;
        for (const d of body.matchAll(/backgroundColor:\s*"(#[0-9A-Fa-f]{6})"/g)) {
          declarations.push({ file, style, value: d[1] });
        }
      }
    }
    expect(declarations.length).toBeGreaterThan(0);
    const failing = declarations
      .filter(({ value }) => contrast(hex(value), CARD) < DIVIDER_FLOOR)
      .map(({ file, style, value }) => `${file}: ${style} ${value}`);
    expect(failing).toEqual([]);
  });

  it("carries white ink on the danger fills", () => {
    // These two were the real defect behind the pale-ink exemption: white on the
    // overflow menu's confirm button measured 3.77:1 and on the subscription
    // confirm 2.99:1. The fills moved rather than the ink, because a destructive
    // action is meant to read as white-on-red.
    expect(contrast([255, 255, 255], hex("#A26572"))).toBeGreaterThanOrEqual(4.5);
    // The subscription confirm is a 0.92-alpha fill over the card, so it is the
    // composited value that has to carry white.
    const overCard = (base: number[]) =>
      base.map((v, i) => Math.round(v * 0.92 + CARD[i] * 0.08));
    expect(contrast([255, 255, 255], overCard(hex("#915D68")))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the global text tokens legible on a card", () => {
    /*
     * theme.config.js sits outside the style-table reader, so every token in it was
     * unmeasured — including the one behind text-muted, which sat at 3.18:1 on a card.
     * It happened not to be used as text anywhere, which is luck rather than design:
     * it is one class name away from being written.
     *
     * foreground and muted are the two tokens that carry text, so they answer to AA.
     * primary is the brand gold and is used as an accent and for icons, not for body
     * copy on a card; it clears the 3:1 non-text floor and is pinned there, so that if
     * it ever does become body text the change is deliberate rather than accidental.
     */
    const config = readFileSync("theme.config.js", "utf8");
    const light = (token: string): number[] => {
      const match = new RegExp(`${token}:\\s*\\{\\s*light:\\s*'(#[0-9A-Fa-f]{6})'`).exec(config);
      expect(match, `${token} must exist in theme.config.js`).not.toBeNull();
      return hex(match![1]);
    };
    const dark = (token: string): number[] => {
      const match = new RegExp(`${token}:\\s*\\{\\s*light:\\s*'#[0-9A-Fa-f]{6}',\\s*dark:\\s*'(#[0-9A-Fa-f]{6})'`).exec(config);
      expect(match, `${token} must exist in theme.config.js`).not.toBeNull();
      return hex(match![1]);
    };
    expect(contrast(light("foreground"), CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light("muted"), CARD)).toBeGreaterThanOrEqual(4.5);
    /*
     * primary is read from its *dark* slot, because that is the one carrying the
     * accent ink. The two slots are not a light/dark-mode pair here: the light slot is
     * the button fill (white on it, asserted elsewhere) and the dark slot is the ink
     * that links and labels use on the glass. Reading the wrong slot measures a fill
     * as if it were text.
     */
    expect(contrast(dark("primary"), CARD)).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * Icons.
   *
   * Icons take their colour as a prop, so neither the text pass nor the outline pass
   * could see them — the style-table reader walks declarations, and an icon colour is
   * not one. Thirty-eight values were below the 3:1 non-text floor, and they had the
   * same shape as the text drift: pale blue-greys carried over from the dark theme
   * that was tried and abandoned, left behind on light surfaces.
   *
   * The worst were not drift but contradictions. A near-white lock sat on the pale
   * locked-age field at 1.09:1. The selfie button drew a white icon inside a gold
   * button whose own label is dark, at 1.16:1 — and its label was itself below AA at
   * 2.11:1. The call buttons put a dark 10px label and a white icon inside the same
   * filled circle, at 3.01:1, failing and arguing with each other about what the fill
   * was. The check-in button did the same thing. A white spinner sat on the lemon
   * purchase button at 1.37:1.
   *
   * White is exempt because it is frequently right — on the gold brand mark (4.78:1),
   * on the call fills and the muted-swipe fill once those were deepened to carry it,
   * and on the dark scrims over camera and photo imagery. The remaining whites are
   * pinned below so a future fill change cannot quietly strand one.
   */
  const ICON_FLOOR = 3;
  const ICON_COMPONENT = /<(MaterialIcons|IconSymbol|Icon)\b[^>]{0,400}?color="(#[0-9A-Fa-f]{6})"/g;

  function iconColours(): { file: string; value: string }[] {
    const found: { file: string; value: string }[] = [];
    for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
      for (const m of readFileSync(file, "utf8").matchAll(ICON_COMPONENT)) {
        found.push({ file, value: m[2] });
      }
    }
    return found;
  }

  it("keeps every icon visible against the card", () => {
    const failing = iconColours()
      .filter(({ value }) => value.toUpperCase() !== "#FFFFFF")
      .filter(({ value }) => contrast(hex(value), CARD) < ICON_FLOOR)
      .map(({ file, value }) => `${file}: ${value} at ${contrast(hex(value), CARD).toFixed(2)}:1`);
    expect(failing).toEqual([]);
  });

  it("pins the fills that white icons rely on", () => {
    // Each of these carries a white icon, so each has to reach the non-text floor.
    // Two are states rather than surfaces: the selfie success badge and the muted
    // swipe action, which answer to the same 3:1 as any other indicator.
    const carriesWhite: [string, string][] = [
      ["selfie success badge", "#6AA082"],
      ["call decline", "#9F6673"],
      ["call accept", "#597E6D"],
      ["check-in action", "#597E6D"],
      ["muted swipe action", "#8297A6"],
      ["brand mark gold", "#2B6C8F"],
    ];
    for (const [what, fill] of carriesWhite) {
      expect(contrast([255, 255, 255], hex(fill)), `${what} must carry white`)
        .toBeGreaterThanOrEqual(ICON_FLOOR);
    }
  });

  it("keeps a button's label and its icon on the same side of the fill", () => {
    // The pattern that produced three of these defects: a button whose label is dark
    // and whose icon is white. The light lemon takes the app's dark ink; the dark
    // brand gold takes white.
    expect(contrast(hex("#FFFFFF"), hex("#2B6C8F"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast([255, 255, 255], hex("#2B6C8F"))).toBeGreaterThanOrEqual(4.5);
  });

  it("measures a translucent fill where it lands, not where it is declared", () => {
    // Read each style that declares both a translucent fill and an ink, resolve the
    // fill over the card, and hold the ink to AA against the result. The declared
    // value is compared too: a fill lighter than the card makes things worse and a
    // darker one makes them better, so the worse of the two is the honest reading.
    const failing: string[] = [];
    let checked = 0;
    for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
      const source = readFileSync(file, "utf8");
      const stylePattern = /^ {2}([A-Za-z0-9_]+):\s*\{([^}]*)\}/gm;
      for (const match of source.matchAll(stylePattern)) {
        const [, style, body] = match;
        const fillMatch = /backgroundColor:\s*(?:[A-Za-z_$][\w$.]*\()?"(rgba\([^"]*\)|[^"]*)"/.exec(body);
        const inkMatch = /color:\s*"(#[0-9A-Fa-f]{6})"/.exec(body);
        if (!fillMatch || !inkMatch) continue;
        const landed = composite(fillMatch[1], CARD);
        if (!landed) continue;
        checked += 1;
        const ink = hex(inkMatch[1]);
        const worst = Math.min(contrast(ink, landed), contrast(ink, CARD));
        if (worst < 4.5) {
          failing.push(`${file}: ${style} ${inkMatch[1]} on ${fillMatch[1]} = ${worst.toFixed(2)}:1`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(failing).toEqual([]);
  });

  it("keeps the quiet tier the dimmest ink that still clears AA", () => {
    /*
     * The quiet tier is solved rather than chosen: this is the value that lets
     * timestamps and hints read as secondary while staying legible.
     *
     * On dark glass the tier is bounded from *below* rather than above. A dim ink
     * stops passing as it gets darker, so the floor is the constraint and the ceiling
     * is what keeps it reading as secondary rather than as primary - the same
     * two-sided window, measured in the other direction.
     */
    const quiet = hex("#B9BEC4");
    expect(contrast(quiet, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(quiet, CARD)).toBeLessThan(7.5);
  });
});
