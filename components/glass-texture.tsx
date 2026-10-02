import React, { useId } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, Pattern, Rect, Path } from "react-native-svg";

import { glassTextureInk, type GlassTint } from "@/lib/glass";

/**
 * A fine 2D grain laid over a glass surface.
 *
 * Why this exists: a frosted pane rendered as a single flat fill reads as a painted
 * rectangle however good its colour is. Real frosted glass has *tooth* — a very fine
 * surface texture that catches light unevenly — and that tooth is most of what tells
 * the eye it is looking at a material rather than at a tint. The reference samples
 * have it; this app's surfaces did not, which is the difference between "translucent
 * card" and "frosted glass" that the member kept pointing at.
 *
 * It is deliberately built from real vector geometry rather than from a raster tile:
 *
 *   - A raster PNG would need a separate asset per density, would blur when scaled,
 *     and would sit at a fixed pixel size on a 3x screen. A pattern in an SVG scales
 *     with the viewport and is one definition at every density.
 *
 *   - It is a cross-hatch of two hairlines rather than a noise field. Noise needs a
 *     bitmap or a filter, and `feTurbulence` is not implemented on every platform this
 *     app runs on. Two thin lines at 45 and 135 degrees tile seamlessly, cost nothing,
 *     and give the same fine tooth at the scale a card is read at.
 *
 * The ink is a hairline of the member's own cast rather than black or white, so the
 * grain belongs to the glass rather than sitting on top of it — and the alpha is
 * solved low enough that it never competes with text. It is asserted in the tests.
 */
export function GlassTexture({
  cast,
  radius = 18,
  /** Scales the tooth. A smaller tile reads as a finer grain. */
  scale = 1,
  style,
}: {
  cast?: GlassTint;
  radius?: number;
  scale?: number;
  style?: StyleProp;
}) {
  /*
   * `useId` rather than a counter or a random value: the pattern has to be referenced
   * by URL from the Rect that fills with it, and two surfaces on screen must not share
   * an id or one would take the other's definition. React's `useId` is stable across
   * renders, unique per instance, and safe under server rendering.
   */
  const raw = useId();
  const patternId = `grain-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const stroke = glassTextureInk(cast);

  const tile = Math.max(4, Math.round(9 * scale));
  const step = Math.max(3, Math.round(5 * scale));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { borderRadius: radius }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={patternId} x="0" y="0" width={tile} height={tile} patternUnits="userSpaceOnUse">
            {/* The two diagonals of the tile: one each way, so the grain is a weave. */}
            <Path d={`M0 ${tile} L${tile} 0`} stroke={stroke} strokeWidth={step / 3} fill="none" />
            <Path d={`M0 0 L${tile} ${tile}`} stroke={stroke} strokeWidth={step / 3} fill="none" />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

type StyleProp = ViewStyle;
