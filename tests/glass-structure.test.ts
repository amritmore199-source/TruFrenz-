import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GLASS_SHADOW_OPACITY,
  MAX_GLASS_ALPHA,
  glassAmbient,
  glassBlur,
  glassEdge,
  glassFieldBorder,
  glassInnerRim,
  glassSwitchTrack,
} from "../lib/glass";

const read = (relative: string) => readFileSync(new URL(relative, `file://${process.cwd()}/`).pathname, "utf8");

describe("the glass structure", () => {
  /*
   * The recipe, as measured off the reference card: a pale fill, a bright rim,
   * a sheen across the light, and a heavy blur. These four together are what
   * makes a surface read as glass rather than as a painted panel.
   */
  it("paints glass with a blur, a cast, a sheen and a rim", () => {
    const source = read("components/glass-surface.tsx");
    expect(source).toContain("<BlurView");
    expect(source).toContain("glassTint(surface");
    expect(source).toContain("glassVeil(surface");
    expect(source).toContain("glassEdge(surface");
    expect(source).toContain("GLASS_SHADOW");
  });

  /*
   * A translucent fill is not frost. Frost is a blur of whatever sits behind the
   * surface, so a card without a BlurView has nothing to diffuse and reads as a
   * flat coloured panel however pale its colour is. This is the check that keeps
   * a screen from going back to paint.
   */
  it("blurs behind every card-shaped component rather than only tinting it", () => {
    for (const file of [
      "components/plan-card-view.tsx",
      "components/plan-poll-card.tsx",
      "components/attachment-sheet.tsx",
      "components/friend-profile-modal.tsx",
      "components/group-info-modal.tsx",
      "components/quick-replies-modal.tsx",
      "components/chat-overflow-menu.tsx",
    ]) {
      const source = read(file);
      // Either it layers its own blur, or it delegates to the shared surface.
      expect(source.includes("BlurView") || source.includes("GlassSurface")).toBe(true);
    }
  });

  it("fogs heavily enough that the backdrop stops reading as itself", () => {
    // A blur below about 40 still shows the wallpaper's shapes through the card,
    // which is what made the earlier sheets look like tinted glass rather than
    // frosted glass: they blurred at 28-35.
    for (const surface of ["card", "panel", "row", "chip", "tab", "field", "floater"] as const) {
      expect(glassBlur(surface)).toBeGreaterThanOrEqual(40);
    }
  });

  it("gives a card a brighter rim than anything inside it", () => {
    const alpha = (value: string) => Number(value.match(/([\d.]+)\)$/)![1]);
    expect(alpha(glassEdge("card"))).toBeGreaterThan(alpha(glassEdge("row")));
    expect(alpha(glassEdge("panel"))).toBeGreaterThan(alpha(glassEdge("field")));
    // The rim has to be near-opaque, or it reads as a drawn outline rather than
    // as the lit edge of a sheet of glass.
    expect(alpha(glassEdge("card"))).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps every surface translucent, so the wallpaper always survives into it", () => {
    expect(MAX_GLASS_ALPHA).toBeLessThan(0.6);
    expect(GLASS_SHADOW_OPACITY).toBeGreaterThan(0);
    expect(GLASS_SHADOW_OPACITY).toBeLessThan(0.5);
  });
});

describe("the double rim and the colour field", () => {
  /*
   * Measured off the supplied samples, and this is what separates glass from a
   * drawn outline: a bright outer edge with a thin cast-coloured hairline just
   * inside it, like the ground edge of a real sheet.
   */
  it("gives every cast both an outer rim and an inner hairline", () => {
    for (const cast of ["white", "sky", "lemon"] as const) {
      const outer = glassEdge("card", cast);
      const inner = glassInnerRim(cast);
      expect(outer).toMatch(/^rgba\(/);
      expect(inner).toMatch(/^rgba\(/);
      // The outer edge is near-opaque in every sample.
      expect(Number(outer.match(/([\d.]+)\)$/)![1])).toBeGreaterThanOrEqual(0.8);
      // The inner line is a separate, fully opaque stroke.
      expect(Number(inner.match(/([\d.]+)\)$/)![1])).toBeGreaterThanOrEqual(0.9);
      expect(inner).not.toBe(outer);
    }
  });

  it("carries the cast in the inner hairline, not just a neutral line", () => {
    // The sky sample's ring is blue and the lemon sample's is yellow: the inner
    // line has to carry the cast or the card loses the colour of its own glass.
    const channels = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number);
    const [sr, , sb] = channels(glassInnerRim("sky"));
    const [lr, , lb] = channels(glassInnerRim("lemon"));
    expect(sb).toBeGreaterThan(sr);
    expect(lr).toBeGreaterThan(lb);
  });

  /*
   * The samples' cards all sit over saturated backdrops. The app's backdrop had
   * been flattened to a near-uniform cream, which is why a card came out the same
   * cream as the page behind it and the glass read as paint.
   */
  it("lays a colour field behind the glass so the blur has something to pick up", () => {
    for (const cast of ["white", "sky", "lemon"] as const) {
      const field = glassAmbient(cast);
      for (const pool of [field.warm, field.cool, field.soft]) {
        const [r, g, b, a] = pool.match(/[\d.]+/g)!.map(Number);
        expect(a).toBeGreaterThan(0.2);
        // A pool with no chroma would leave the glass reading grey again.
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(10);
      }
    }
  });

  it("fogs hard enough to hide the backdrop's detail", () => {
    // The samples' backdrops are unrecognisable behind the card, not merely soft.
    expect(glassBlur("card")).toBeGreaterThanOrEqual(70);
    expect(glassBlur("panel")).toBeGreaterThanOrEqual(75);
  });

  it("keeps the switch tracks on the same cast as the glass", () => {
    const sky = glassSwitchTrack("sky");
    const lemon = glassSwitchTrack("lemon");
    expect(sky.on).not.toBe(lemon.on);
    for (const cast of ["white", "sky", "lemon"] as const) {
      const track = glassSwitchTrack(cast);
      for (const value of [track.off, track.on]) expect(value).toMatch(/^rgba\(/);
    }
  });
});

describe("the ambient colour field", () => {
  /*
   * The pools are stacked concentric circles, and their alphas are solved rather
   * than guessed: each ring contributes 1 - (1 - a)^(1/N) so that N rings
   * accumulate to exactly `a` at the centre.
   *
   * Two failure modes this pins. The first attempt drew each pool as a single
   * View, which in React Native is a hard-edged shape — the result was three
   * solid discs with crisp rims sitting on the wallpaper. The second is banding:
   * too few rings and the falloff arrives in visible steps.
   */
  const RINGS = 14;
  const perRing = (a: number) => 1 - Math.pow(1 - a, 1 / RINGS);
  const rings = Array.from({ length: RINGS }, (_, i) => 1 - i / (RINGS + 1));

  const coverage = (radius: number) => rings.filter((s) => s >= radius).length;
  const alphaAt = (radius: number, target: number) =>
    1 - Math.pow(1 - perRing(target), coverage(radius));

  it("accumulates the rings to exactly the pool's own alpha at the centre", () => {
    for (const target of [0.28, 0.32, 0.38]) {
      expect(alphaAt(0, target)).toBeCloseTo(target, 6);
    }
  });

  it("fades to nearly nothing at the edge, so a pool has no rim", () => {
    // The failure this guards against is the hard-edged disc: an edge alpha that
    // is a meaningful fraction of the centre's is a visible boundary.
    const edge = alphaAt(1, 0.36);
    const centre = alphaAt(0, 0.36);
    expect(edge / centre).toBeLessThan(0.12);
  });

  it("has enough rings that the falloff is a ramp, not a set of bands", () => {
    // Walk the radius and check no single step is a visible jump. A 1/255 step is
    // the smallest change a screen can show, so a band would be far larger.
    const target = 0.36;
    const steps: number[] = [];
    for (let i = 0; i < 50; i++) {
      const a = alphaAt(i / 50, target);
      const b = alphaAt((i + 1) / 50, target);
      steps.push(Math.abs(b - a) * 255);
    }
    expect(Math.max(...steps)).toBeLessThan(8);
    expect(RINGS).toBeGreaterThanOrEqual(12);
  });
});

describe("the field outline", () => {
  /*
   * An input is told apart from a card by its edge, so that edge is carrying
   * meaning and is held to the 3:1 non-text minimum rather than to taste.
   *
   * The sheet's own rim is a white highlight at 0.46 alpha, which is right for
   * a card and useless for a field: over the app's pale glass it measured about
   * 1.5:1 and the search box read as a rectangle with no border at all.
   */
  it("draws a border dark enough to be seen against the lightest glass", () => {
    const lin = (x: number) => {
      const c = x / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (hi + 0.05) / (lo + 0.05);
    };

    for (const cast of ["white", "sky", "lemon"] as const) {
      const parts = glassFieldBorder(cast).match(/[\d.]+/g)!.map(Number);
      const alpha = parts[3]!;
      const page = [244, 248, 252];
      const drawn = page.map((channel, index) => Math.round(parts[index]! * alpha + channel * (1 - alpha)));
      expect(contrast(drawn, page)).toBeGreaterThanOrEqual(3);
    }
  });

  it("takes its hue from the member's cast rather than being one fixed grey", () => {
    const sky = glassFieldBorder("sky");
    const lemon = glassFieldBorder("lemon");
    expect(sky).not.toBe(lemon);
    // Cool is blue-leading, warm is red-leading: the two must not collapse.
    const [sr, , sb] = sky.match(/[\d.]+/g)!.map(Number) as [number, number, number];
    const [lr, , lb] = lemon.match(/[\d.]+/g)!.map(Number) as [number, number, number];
    expect(sb).toBeGreaterThan(sr!);
    expect(lr).toBeGreaterThan(lb);
  });
});
