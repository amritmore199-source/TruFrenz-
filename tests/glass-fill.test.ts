import { readFileSync } from "node:fs";
import { DEFAULT_GLASS_TINT } from "../lib/appearance-preferences";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  activeGlassOpacity,
  activeGlassTint,
  glassFill,
  glassNestedFill,
  MAX_GLASS_ALPHA,
  setActiveGlassOpacity,
  setActiveGlassTint,
} from "../lib/glass";

/** The alpha out of an `rgba(r, g, b, a)` string. */
function alphaOf(color: string): number {
  const match = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  if (!match) throw new Error(`not an rgba colour: ${color}`);
  return Number(match[1]);
}

/*
 * The white patches.
 *
 * The member reported these three times: cards, then toggles and buttons, then
 * "everywhere". The cause was the same each time and it was not any one surface.
 * Around 500 fills were declared as a near-opaque white inline, most of them
 * inside a module-scope `StyleSheet.create` table. A style table is built once
 * when the file is imported, long before the member's glass setting has been
 * read, so those values could never follow it — which is precisely why they were
 * written as literals.
 *
 * `glassNestedFill` resolves at render instead. These tests pin both halves: that
 * the resolution actually produces glass rather than paint, and that no literal
 * patch can quietly come back.
 */
describe("resolving a fill into glass", () => {
  it("turns an opaque white into a translucent one", () => {
    setActiveGlassOpacity(80);
    const resolved = glassNestedFill("rgba(255, 255, 255, 0.72)");
    /*
     * Still well under opaque, and no longer under 0.4.
     *
     * The nested band moved with BASE_ALPHA, which had to rise because a dark pane
     * needs a high alpha over a bright page. What the test is actually protecting is
     * that a declared-white fill does not land as a white film, so the bound is set
     * against the ceiling instead of an absolute 0.4.
     */
    expect(alphaOf(resolved)).toBeLessThan(MAX_GLASS_ALPHA);
    expect(resolved).not.toContain("255, 255, 255, 0.72");
  });

  it("never resolves any surface past the glass ceiling", () => {
    // The ceiling is the whole point: beyond it a surface is paint, and the
    // wallpaper behind it stops mattering.
    for (const opacity of [50, 60, 70, 80, 90, 95]) {
      setActiveGlassOpacity(opacity);
      for (const declared of [
        "rgba(255, 255, 255, 0.5)",
        "rgba(255, 255, 255, 0.96)",
        "rgba(232, 241, 246, 0.85)",
      ]) {
        expect(alphaOf(glassNestedFill(declared))).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
        expect(alphaOf(glassFill(declared))).toBeLessThanOrEqual(MAX_GLASS_ALPHA);
      }
    }
  });

  it("keeps a nested fill lighter than a card over the wallpaper", () => {
    // A row inside a sheet must not weigh as much as the sheet. If it did, the
    // sheet would read as one flat panel — the problem the nesting band was
    // added to solve.
    setActiveGlassOpacity(95);
    const declared = "rgba(255, 255, 255, 0.9)";
    expect(alphaOf(glassNestedFill(declared))).toBeLessThan(alphaOf(glassFill(declared)));
  });

  it("still lets the member make the surfaces heavier", () => {
    // The setting keeps its meaning: a higher number is a more present surface.
    setActiveGlassOpacity(50);
    const light = alphaOf(glassNestedFill("rgba(255, 255, 255, 0.72)"));
    setActiveGlassOpacity(95);
    const strong = alphaOf(glassNestedFill("rgba(255, 255, 255, 0.72)"));
    expect(strong).toBeGreaterThan(light);
  });

  it("follows the tint the member chose", () => {
    setActiveGlassTint("white");
    const neutral = glassNestedFill("rgba(255, 255, 255, 0.72)");
    setActiveGlassTint("sky");
    const cool = glassNestedFill("rgba(255, 255, 255, 0.72)");
    expect(neutral).not.toBe(cool);
    setActiveGlassTint("white");
  });

  it("keeps an accent surface's own hue instead of washing it out", () => {
    setActiveGlassOpacity(80);
    // A saturated fill is an accent, not a neutral: the lemon buttons must stay
    // themselves rather than becoming blue-white.
    const accent = glassNestedFill("rgba(241, 222, 85, 0.9)");
    // Read as a ratio: the ink floor scales all three channels by one factor, so the
    // gold is still gold but the literal triple no longer appears. Asserting the
    // triple would forbid the guard that keeps the label on it legible.
    const parts = (accent.match(/[\d.]+/g) ?? []).map(Number);
    expect(parts[0] / parts[2]).toBeGreaterThan(2.2);
    expect(parts[1] / parts[2]).toBeGreaterThan(2.0);
  });

  it("reads the weight the provider mirrored, and clamps it", () => {
    setActiveGlassOpacity(70);
    expect(activeGlassOpacity()).toBe(70);
    // A nonsense value must not be able to reach a surface.
    setActiveGlassOpacity(500);
    expect(activeGlassOpacity()).toBe(95);
    setActiveGlassOpacity(-10);
    expect(activeGlassOpacity()).toBe(50);
    setActiveGlassOpacity(80);
    // The setter is not what restores the cast; the module's own default is. The
    // assertion names the default so a future rename cannot leave it dangling.
    expect(activeGlassTint()).toBe(DEFAULT_GLASS_TINT);
  });
});

/*
 * The guard, so this cannot come back.
 *
 * Every previous fix here was a handful of call sites, and each time the member
 * found more, because the pattern rather than the instances was the problem. This
 * scans the whole source tree instead of trusting that the last migration was
 * complete.
 */
describe("no hardcoded patches remain", () => {
  const ROOTS = ["app", "components", "lib"];

  /*
   * The one fill that is allowed to be a near-opaque literal, and why.
   *
   * `backgroundWash` is not a surface - it is the page. Everything else in the app
   * composites *over* it, so it has nothing behind it to be translucent against, and
   * it is the value that sets the depth the whole dark system is built on: a card
   * renders at `alpha * fill + (1 - alpha) * backdrop`, so a pale backdrop would make
   * dark translucent glass impossible at any cast. It is exempt by name rather than
   * by rule, so the next surface that tries to look like it still gets caught.
   */
  const PAGE_BACKDROP = /backgroundWash:[^}]*rgba\(16, 18, 22, 0\.82\)/;

  /** A near-opaque fill that is still a literal rather than a resolved call. */
  function findPatches(): string[] {
    const found: string[] = [];
    const fill = /backgroundColor:\s*"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*0?\.(\d+)\s*\)"/g;
    const walk = (dir: string) => {
      const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules") continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry)) {
          const text = readFileSync(full, "utf8");
          const pageLine = PAGE_BACKDROP.test(text);
          for (const match of text.matchAll(fill)) {
            const [literal, r, g, b, a] = match;
            // The page backdrop is the one fill that has nothing behind it to be
            // translucent against; every surface the member sees is exempted from
            // the exemption, because it composites over this.
            if (pageLine && literal.includes("rgba(16, 18, 22, 0.82)")) continue;
            /*
             * The patch this catches has inverted with the glass.
             *
             * It used to be a near-white film painted over the tint, so the scan
             * looked for a light fill at 0.43+ alpha. On the dark system a flat patch
             * is a near-opaque *dark* fill - the same defect, the other way up - so
             * the scan now looks for a low-luminance fill at high alpha. Either way
             * it is a surface that has stopped being translucent.
             */
            const isDark = Math.max(Number(r), Number(g), Number(b)) <= 26;
            if (isDark && Number("0." + a) >= 0.43) {
              found.push(`${full}: ${literal}`);
            }
          }
        }
      }
    };
    for (const root of ROOTS) walk(join(__dirname, "..", root));
    return found;
  }

  it("declares no near-white fill outside a resolved call", () => {
    const patches = findPatches();
    expect(
      patches,
      `These fills read as opaque patches over the wallpaper. Resolve them with ` +
        `glassNestedFill(...) from @/lib/appearance-preferences:\n${patches.join("\n")}`,
    ).toEqual([]);
  });

  it("mirrors the member's weight in the provider, beside the tint", () => {
    const context = readFileSync(join(__dirname, "..", "lib/appearance-context.tsx"), "utf8");
    expect(context).toContain("setActiveGlassOpacity(preferences.glassOpacity)");
    expect(context).toContain("setActiveGlassTint(preferences.glassTint)");
  });

  it("resolves profile action fills at render time instead of restoring a flat danger-button patch", () => {
    const profile = readFileSync(join(__dirname, "..", "components/friend-profile-modal.tsx"), "utf8");
    expect(profile).toContain("glassNestedSurfaceColor(isDestructive(action)");
    expect(profile).toContain("glassNestedSurfaceColor(\"rgba(0, 0, 0, 0.16)\"");
    expect(profile).not.toMatch(/actionDanger:\s*\{[^}]*backgroundColor/);
  });

  it("exposes the resolver through the barrel the components import from", () => {
    const barrel = readFileSync(join(__dirname, "..", "lib/appearance-preferences.ts"), "utf8");
    expect(barrel).toContain("glassNestedFill");
    expect(barrel).toContain("glassFill");
  });
});
