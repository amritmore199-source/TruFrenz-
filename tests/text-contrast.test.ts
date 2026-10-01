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

/** A glass card over the artwork, at the lightest it resolves. */
const CARD = [233, 239, 246];

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

  it("keeps the accent gold at AA, since it is used for links and labels", () => {
    // The gold carries the largest number of text uses in the app, so it is the one
    // colour where a small miss would be felt everywhere.
    expect(contrast(hex("#7C6C1D"), CARD)).toBeGreaterThanOrEqual(4.5);
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

  it("keeps the quiet tier the lightest ink that still clears AA", () => {
    // The quiet tier is solved rather than chosen: this is the value that lets
    // timestamps and hints read as secondary while staying legible. If it drifts
    // lighter it stops passing; if it drifts darker it stops reading as secondary.
    const quiet = hex("#6E6C67");
    expect(contrast(quiet, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(quiet, CARD)).toBeLessThan(4.8);
  });
});
