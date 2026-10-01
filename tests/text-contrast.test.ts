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

  it("keeps the quiet tier the lightest ink that still clears AA", () => {
    // The quiet tier is solved rather than chosen: this is the value that lets
    // timestamps and hints read as secondary while staying legible. If it drifts
    // lighter it stops passing; if it drifts darker it stops reading as secondary.
    const quiet = hex("#6E6C67");
    expect(contrast(quiet, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(quiet, CARD)).toBeLessThan(4.8);
  });
});
