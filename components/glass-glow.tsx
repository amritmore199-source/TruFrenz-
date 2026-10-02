import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { glassTopGlow } from "@/lib/glass";

type Props = {
  /** The glow colour to fade out from, from `glassTopGlow()`. */
  color: string;
  /** How much of the surface's height the falloff covers. */
  heightRatio?: number;
  /** Border radius, so the glow is clipped to the surface's own shape. */
  radius: number;
};

/**
 * The soft light that pools just inside a surface's top edge.
 *
 * This was a plain View with a solid translucent fill and a fixed height - a
 * rectangle, because a View in React Native is a rectangle. Against a stock image on
 * the page it was invisible; over the darkened app backdrop it still left a visible
 * step where the band ended, because a solid block of light does not fade, it stops.
 * Measured on the rendered welcome panel the step was 20 per channel: the pane read
 * 233,230,236 above the line and 214,209,219 below it, which is a seam across the
 * middle of the card, not a falloff.
 *
 * A gradient is the only primitive that produces a falloff, and a *radial* one is
 * what the samples actually have: the light is strongest at the centre of the top
 * edge and weakest at the two upper corners, which is what a light source above and
 * in front of a sheet of glass produces. A linear gradient would light the whole
 * top edge evenly and give the surface a flat top.
 *
 * The ellipse deliberately overflows the surface's width. The shape is over twice as
 * wide as it is tall, so its curve stays close to flat across the visible middle and
 * the corners are where it falls away - which is the shape of the light in the
 * reference, rather than a circular hotspot with a visible centre.
 */
export function GlassGlow({ color, heightRatio = 0.38, radius }: Props) {
  /*
   * The stops carry the alpha and the SVG fill is the colour on its own: in SVG the
   * gradient's stops define the alpha ramp, and an alpha in the fill would multiply
   * with them rather than blend.
   */
  const rgb = color.match(/[\d.]+/g) ?? ["255", "255", "255", "0.46"];
  const [r, g, b] = rgb;
  const topAlpha = Number(rgb[3] ?? 0.46);
  return (
    <View pointerEvents="none" style={[styles.layer, { height: `${heightRatio * 100}%`, borderTopLeftRadius: radius, borderTopRightRadius: radius }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="glassTop" cx="50%" cy="6%" rx="78%" ry="96%" fx="50%" fy="6%">
            <Stop offset="0%" stopColor={`rgb(${r},${g},${b})`} stopOpacity={topAlpha} />
            <Stop offset="45%" stopColor={`rgb(${r},${g},${b})`} stopOpacity={topAlpha * 0.45} />
            <Stop offset="100%" stopColor={`rgb(${r},${g},${b})`} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="0" rx="78" ry="108" fill="url(#glassTop)" />
      </Svg>
    </View>
  );
}

/** A thin wrapper that resolves the colour itself, for the common case. */
export function GlassTopGlow({ cast, radius, heightRatio }: { cast: Parameters<typeof glassTopGlow>[0]; radius: number; heightRatio?: number }) {
  return <GlassGlow color={glassTopGlow(cast)} radius={radius} heightRatio={heightRatio} />;
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, right: 0, top: 0, overflow: "hidden" },
});