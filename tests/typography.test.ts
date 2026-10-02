import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * A floor on label sizes, and a check that the text has room to draw.
 *
 * The app declared 475 fontSize literals, 382 of them below 12px, in arbitrary
 * half-point steps from 6 to 11.5 — eyebrows at 7, timestamps at 8, previews at 10.
 * That is the signature of text sized at a desk rather than on a phone: nothing
 * below 12px is comfortably readable on a phone, and nothing in the app was
 * deliberately tiny.
 *
 * These two checks are deliberately narrow. The floor is 12 and not 14 because the
 * app has a dense vocabulary of small labels — chips, badges, timestamps, section
 * eyebrows — and raising those to body size would flatten the hierarchy rather than
 * improve it. What matters is that the floor exists and cannot silently erode.
 */
const FLOOR = 12;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith(".tsx")) found.push(path);
  }
  return found;
}

type Style = { file: string; name: string; fontSize: number; lineHeight?: number };

/*
 * Every declared style, read without anchoring to a line.
 *
 * The first attempt at this used a line-anchored pattern, which missed the one place
 * in the app that declares two styles on the same line — and that overlooked style
 * was the only sub-12px value left after the sweep. Reading the braces directly
 * rather than the lines is what found it.
 */
function declaredStyles(): Style[] {
  const found: Style[] = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/\b([A-Za-z0-9_]+):\s*\{([^}]*)\}/g)) {
      const name = m[1];
      const body = m[2];
      const size = /fontSize:\s*(\d+(?:\.\d+)?)/.exec(body);
      if (!size) continue;
      const lh = /lineHeight:\s*(\d+(?:\.\d+)?)/.exec(body);
      found.push({
        file,
        name,
        fontSize: Number(size[1]),
        lineHeight: lh ? Number(lh[1]) : undefined,
      });
    }
  }
  return found;
}

describe("typography floor", () => {
  it("finds the declarations it is meant to be guarding", () => {
    const styles = declaredStyles();
    expect(styles.length).toBeGreaterThan(400);
    expect(styles.filter((s) => s.fontSize >= FLOOR).length).toBe(styles.length);
  });

  it("keeps every label at 12px or larger", () => {
    const below = declaredStyles()
      .filter((s) => s.fontSize < FLOOR)
      .map((s) => `${s.file}: ${s.name} is ${s.fontSize}px`);
    expect(below).toEqual([]);
  });

  it("gives every text style room to draw its descenders", () => {
    /*
     * React Native clips a line box to lineHeight, so a lineHeight at or below the
     * fontSize cuts the tails off g, j, p, q and y. Eight styles were in that state
     * before the sweep — a 7.5px note with an 11px line box — and raising the sizes
     * while leaving the boxes alone would have made it worse rather than better.
     *
     * 1.1x is the floor of the convention the app already uses; the existing 12px
     * styles sit at 1.42x. This only asserts the box clears the glyphs.
     */
    const clipped = declaredStyles()
      .filter((s) => s.lineHeight !== undefined && s.lineHeight <= s.fontSize)
      .map((s) => `${s.file}: ${s.name} ${s.fontSize}px in a ${s.lineHeight}px box`);
    expect(clipped).toEqual([]);
  });

  it("keeps the size ladder distinct", () => {
    /*
     * The sweep mapped everything below 12 onto 12 and moved the 12 to 13.4 band up
     * half a point. Without that second half, a 12.5px section heading and the 12px
     * body under it would have become the same size and the heading would have lost
     * its rank — so the band shift is load-bearing, not cosmetic.
     */
    const sizes = [...new Set(declaredStyles().map((s) => s.fontSize))].sort((a, b) => a - b);
    // No two rungs of the ladder may sit closer than half a point.
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i] - sizes[i - 1]).toBeGreaterThanOrEqual(0.5);
    }
  });
});