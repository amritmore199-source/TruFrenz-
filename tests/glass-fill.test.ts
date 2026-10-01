import { readFileSync } from "node:fs";
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
    expect(alphaOf(resolved)).toBeLessThan(0.4);
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
    setActiveGlassTint("sky");
    const sky = glassNestedFill("rgba(255, 255, 255, 0.72)");
    setActiveGlassTint("lemon");
    const lemon = glassNestedFill("rgba(255, 255, 255, 0.72)");
    expect(sky).not.toBe(lemon);
    setActiveGlassTint("sky");
  });

  it("keeps an accent surface's own hue instead of washing it out", () => {
    setActiveGlassOpacity(80);
    // A saturated fill is an accent, not a neutral: the lemon buttons must stay
    // themselves rather than becoming blue-white.
    const accent = glassNestedFill("rgba(241, 222, 85, 0.9)");
    expect(accent).toContain("241, 222, 85");
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
    expect(activeGlassTint()).toBe("ash");
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

  /** A near-white fill that is still a literal rather than a resolved call. */
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
          for (const match of text.matchAll(fill)) {
            const [literal, r, g, b, a] = match;
            // The welcome screen's full-page backdrop wash is an intentional
            // 0.42 veil for legibility; controls and cards must resolve at 0.43+
            // so the member never sees another flat white patch inside them.
            if (Math.min(Number(r), Number(g), Number(b)) >= 230 && Number("0." + a) >= 0.43) {
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
    expect(profile).toContain("glassNestedSurfaceColor(\"rgba(255, 255, 255, 0.98)\"");
    expect(profile).not.toMatch(/actionDanger:\s*\{[^}]*backgroundColor/);
  });

  it("exposes the resolver through the barrel the components import from", () => {
    const barrel = readFileSync(join(__dirname, "..", "lib/appearance-preferences.ts"), "utf8");
    expect(barrel).toContain("glassNestedFill");
    expect(barrel).toContain("glassFill");
  });
});
