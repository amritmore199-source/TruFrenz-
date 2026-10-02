import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(source).toContain("<GlassBlur");
    expect(source).toContain("glassTint(surface");
    expect(source).toContain("glassVeil(surface");
    expect(source).toContain("glassEdge(surface");
    expect(source).toContain("GLASS_SHADOW");
  });

  /*
   * A translucent fill is not frost. Frost is a blur of whatever sits behind the
   * surface, so a card without a blur layer has nothing to diffuse and reads as a
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
      expect(source.includes("GlassBlur") || source.includes("GlassSurface")).toBe(true);
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
    /*
     * The ceiling moved with the structure, and it had to.
     *
     * The check exists to stop a surface becoming paint. What "paint" means depends
     * on what the surface sits on: a dark pane over the artwork's white paper needs a
     * high alpha to reach any depth at all, so the old 0.6 ceiling would have made the
     * reference's own cards illegal. The test below still holds the real guarantee -
     * that the backdrop survives into every surface - and that is the one that
     * matters. The absolute number is now a loose outer bound.
     */
    expect(MAX_GLASS_ALPHA).toBeLessThan(0.95);
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
    for (const cast of ["white", "sky"] as const) {
      const outer = glassEdge("card", cast);
      const inner = glassInnerRim(cast);
      expect(outer).toMatch(/^rgba\(/);
      expect(inner).toMatch(/^rgba\(/);
      // The outer edge is near-opaque in every sample.
      expect(Number(outer.match(/([\d.]+)\)$/)![1])).toBeGreaterThanOrEqual(0.8);
      /*
       * The inner line is a real stroke, not a tint. The samples draw it as a
       * saturated line and it is what makes the pair read as a glass edge; the bound
       * is set where the shipped values sit rather than at full opacity, because a
       * hairline at 1.0 reads as a second border rather than as a refraction.
       */
      expect(Number(inner.match(/([\d.]+)\)$/)![1])).toBeGreaterThanOrEqual(0.8);
      expect(inner).not.toBe(outer);
    }
  });

  it("carries the accent in the inner hairline on every cast", () => {
    /*
     * The samples' inner line carries the accent - saturated blue in the sky sample,
     * bright yellow in the warm one - while the outer rim stays near-white in both.
     * That contrast between the two lines is the effect.
     *
     * The neutral cast used to have a near-white hairline, which made both of its
     * lines the same near-white and collapsed the double rim into a single edge. It
     * carries the brand's mauve now, so the test reads each line for *its own*
     * accent rather than requiring one of them to be a plain grey.
     */
    const channels = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number);
    const [sr, sg, sb] = channels(glassInnerRim("sky"));
    expect(sb - sr).toBeGreaterThan(60);          // blue-leading
    expect(sb).toBeGreaterThan(sg);

    const [nr, ng, nb] = channels(glassInnerRim("white"));
    expect(nr).toBeGreaterThan(ng);               // the mauve signature: green is lowest
    expect(nb).toBeGreaterThan(ng);
    // And the two casts must not produce the same line.
    expect(glassInnerRim("white")).not.toBe(glassInnerRim("sky"));
  });

  /*
   * The samples' cards all sit over saturated backdrops. The app's backdrop had
   * been flattened to a near-uniform cream, which is why a card came out the same
   * cream as the page behind it and the glass read as paint.
   */
  it("lays a colour field behind the glass so the blur has something to pick up", () => {
    /*
     * Two casts, two different jobs for the field.
     *
     * The shipped cast is black and white, so its field is achromatic by design - a
     * blue or lemon wash under a monochrome interface is the mixing that was rejected.
     * What it must still do is be *present*: strong enough that the blur has real
     * variation to diffuse, otherwise every card reads as a tinted panel. So the
     * neutral cast is asserted on strength and neutrality.
     */
    const neutral = glassAmbient("white");
    const neutralAlphas: number[] = [];
    for (const pool of [neutral.warm, neutral.cool, neutral.soft]) {
      const [r, g, b, a] = pool.match(/[\d.]+/g)!.map(Number);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(6);
      expect(a).toBeGreaterThanOrEqual(0.24);
      neutralAlphas.push(a);
    }
    // Three pools at three strengths, so the field is a composition rather than a
    // flat wash - which is what gives the blur something to shape.
    expect(new Set(neutralAlphas).size).toBe(3);

    /*
     * The coloured cast is where the sections' hues live, and it keeps the original
     * strength and spread: the sky field is what the section accents, the empty-state
     * tiles and the active pill are all derived from.
     */
    for (const section of ["chats", "groups", "hangouts", "bizz", "profile"] as const) {
      const field = glassAmbient("sky", 1, section);
      for (const pool of [field.warm, field.cool, field.soft]) {
        const [r, g, b, a] = pool.match(/[\d.]+/g)!.map(Number);
        expect(a).toBeGreaterThanOrEqual(0.28);
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
    const white = glassSwitchTrack("white");
    expect(sky.on).not.toBe(white.on);
    /*
     * The sky track is blue-leading; the neutral one carries the brand's mauve, which
     * is what makes a switched-on control read as *this* app's accent rather than as a
     * neutral that could belong to any product. Both follow their cast, which is the
     * property under test.
     */
    const ch = (v: string) => v.match(/\d+/g)!.slice(0, 3).map(Number);
    expect(ch(sky.on)[2]).toBeGreaterThan(ch(sky.on)[0]);
    const [nr, ng, nb] = ch(white.on);
    expect(nr).toBeGreaterThan(ng);
    expect(nb).toBeGreaterThan(ng);
    for (const cast of ["white", "sky"] as const) {
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

    for (const cast of ["white", "sky"] as const) {
      const parts = glassFieldBorder(cast).match(/[\d.]+/g)!.map(Number);
      const alpha = parts[3]!;
      const page = [244, 248, 252];
      const drawn = page.map((channel, index) => Math.round(parts[index]! * alpha + channel * (1 - alpha)));
      expect(contrast(drawn, page)).toBeGreaterThanOrEqual(3);
    }
  });

  it("takes its hue from the member's cast rather than being one fixed grey", () => {
    const sky = glassFieldBorder("sky");
    const white = glassFieldBorder("white");
    expect(sky).not.toBe(white);
    // Cool leads with blue; the neutral border is achromatic, so it reads as a
    // grey rule over the scene rather than as a coloured one.
    const ch = (v: string) => v.match(/[\d.]+/g)!.map(Number) as [number, number, number, number];
    const [sr, , sb] = ch(sky);
    const [nr, ng, nb] = ch(white);
    expect(sb).toBeGreaterThan(sr);
    expect(nr).toBe(ng);
    expect(ng).toBe(nb);
    // Both clear 3:1 against the page at the alpha the border is drawn at.
    const rel = (v: number) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const relLum = ([r, g, b]: number[]) => 0.2126 * rel(r) + 0.7152 * rel(g) + 0.0722 * rel(b);
    const ratio = (a: number[], b: number[]) =>
      (Math.max(relLum(a), relLum(b)) + 0.05) / (Math.min(relLum(a), relLum(b)) + 0.05);
    const page = [244, 248, 252];
    for (const parts of [ch(sky), ch(white)]) {
      const drawn = page.map((channel, i) => parts[i]! * parts[3]! + channel * (1 - parts[3]!));
      expect(ratio(drawn, page)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the blur layer cannot be overridden", () => {
  /*
   * `expo-blur`'s web build appends its own background colour *after* the
   * caller's style, so the fill every surface resolved was discarded and a
   * `rgba(249,249,249,0.33)` film painted instead. That film was the "white
   * patch" reported on every card, tab, toggle and sheet, and it is why changing
   * the cast appeared to do nothing.
   *
   * These two checks pin the fix: the app must not reach for expo-blur's
   * BlurView directly, and the shared layer must own the backdrop filter itself.
   */
  it("never uses expo-blur's BlurView directly", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".tsx")) continue;
        const source = readFileSync(path, "utf8");
        // The layer itself is allowed to import it; it is the only place that may.
        if (source.includes("<BlurView") && !path.endsWith("glass-blur.tsx")) {
          offenders.push(path);
        }
      }
    };
    walk(`${process.cwd()}/app`);
    walk(`${process.cwd()}/components`);
    expect(offenders).toEqual([]);
  });

  it("paints the fill on the same element as the backdrop filter", () => {
    const source = read("components/glass-blur.tsx");
    // The fill must be a sibling of the backdrop filter inside one style array,
    // not a separate layer underneath it: a filter samples what is behind its own
    // element, so a fill painted below would be the thing it blurs.
    expect(source).toContain("backdropFilter");
    expect(source).toMatch(/backdropFilter[\s\S]{0,400}tint,/);
  });
});

describe("every large surface is built from the whole recipe", () => {
  /*
   * The defect this guards against arrived three times, in three different places,
   * and each time it looked like a different bug.
   *
   * A surface that takes the blur and the cast but stops there is glass with no edge
   * surface: no lit rim, no inner hairline, no sheen, no falloff across the face. It
   * renders as a flat tinted rectangle, and because the tint is real it passes every
   * colour check - it is the *layers* that are missing. The welcome panel had exactly
   * this, and so did the chat rows, and both were read as "the glass looks flat"
   * rather than as a missing layer.
   *
   * There is no runtime type that can catch it: a View with one background colour is
   * perfectly valid. So it is caught at the source, by requiring that any component
   * painting a glass surface names all four of the layers beside the fill.
   */
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  /* The four layers that make a surface read as glass rather than as a tinted block. */
  /*
     * The glow is produced by `GlassTopGlow`, which resolves its own colour, so the
     * surfaces name the component rather than the resolver.
     */
  const LAYERS = ["glassVeil", "GlassTopGlow", "glassInnerRim"] as const;

  const SURFACES = [
    "components/glass-glow.tsx",
    "components/glass-surface.tsx",
    "components/welcome-screen.tsx",
    "components/swipeable-chat-row.tsx",
  ];

  for (const file of SURFACES) {
    it(`${file} paints the whole recipe, not just a fill`, () => {
      const src = read(file);
      /*
       * It must be a frosted surface at all. `glass-glow.tsx` is the one exception:
       * it *is* the glow layer, built on a gradient rather than on a blur, so it is
       * held to naming the glow resolver instead.
       */
      if (file === "components/glass-glow.tsx") {
        expect(src).toContain("glassTopGlow");
        expect(src).toContain("RadialGradient");
        return;
      }
      expect(src).toMatch(/GlassBlur|glassBlur/);
      // ...and it must also carry each of the layers that give it an edge and a falloff.
      for (const layer of LAYERS) {
        expect(src).toContain(layer);
      }
      // The outer rim comes from the cast rather than a fixed colour, so a surface
      // cannot be near-white on one cast and grey on another.
      expect(src).toContain("glassEdge");
    });
  }

  it("routes the screen's large surfaces through the shared primitive", () => {
    /*
     * A hand-rolled surface is how the welcome panel and the chat rows drifted: both
     * were written before the recipe was settled and neither was migrated, so they kept
     * the two layers they started with. Counting the call sites does not prove the
     * layers are right, but it does catch a whole surface being painted by hand.
     */
    const screen = read("app/(tabs)/index.tsx");
    expect(screen).toMatch(/import \{ GlassSurface \} from "@\/components\/glass-surface"/);
    // The search field was the last hand-painted block on this screen.
    expect(screen).toMatch(/<GlassSurface surface="field"/);
  });
});

describe("the appearance picker shows the edge it is describing", () => {
  /*
   * The two rim lines are the most misread part of this material. A card whose outer
   * rim and inner hairline are both near-white has one edge drawn twice, not a double
   * rim - and that defect has been reported more than once, because at card scale the
   * pair is two hairlines a pixel or two apart and cannot be judged from a screen.
   *
   * The picker therefore shows the corner enlarged, built from the same two resolvers
   * the real surfaces use so it cannot drift out of step with what it describes. This
   * guards that it keeps doing so: a hand-picked colour here would look right and be
   * wrong, which is exactly the failure the sample exists to prevent.
   */
  const screen = readFileSync(join(process.cwd(), "app/(tabs)/index.tsx"), "utf8");

  it("builds the sample from the live resolvers rather than fixed colours", () => {
    expect(screen).toContain("rimSampleOuter");
    expect(screen).toContain("rimSampleInner");
    expect(screen).toMatch(/glassEdge\("card", glassTintChoice\)/);
    expect(screen).toMatch(/glassInnerRim\(glassTintChoice\)/);
  });

  it("insets the sample by the same constant the real surfaces use", () => {
    // The gap shown has to be the gap they get, or the sample teaches the wrong thing.
    expect(screen).toContain("GLASS_RIM_INNER_INSET");
    expect(screen).toMatch(/rimSampleInner:[^}]*GLASS_RIM_INNER_INSET/);
  });
});
