import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GLASS_SHADOW_OPACITY,
  MAX_GLASS_ALPHA,
  glassAmbient,
  glassBlur,
  glassEdge,
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
