import React, { useId } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";

type Props = {
  /** The ink the texture is drawn in, from `glassTextureInk()`. */
  color: string;
  /** Clips the pattern to the surface's own shape. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A micro-grain tooth on a glass surface, so a card reads as a *material* rather than as a
 * flat field of colour.
 *
 * The earlier 24pt mesh was visibly a grid and was rightly read as "wired fencing". This
 * is deliberately not a mesh: three irregular pinpricks repeat on a 13pt cadence, at a
 * 0.035-alpha cap. It changes a pixel by less than a point, so the eye reads a soft 2D
 * tooth across a pane rather than lines, dots, or a pattern it can name. It is drawn over
 * the blur and under the sheet's content, where texture belongs.
 */
export function GlassTexture({ color, radius, style }: Props) {
  const reactId = useId();
  // SVG ids live in the page DOM on web, so an id shared by multiple cards would cause one
  // card's paint to leak into another. React's per-instance id is sanitised for SVG URLs.
  const id = `glassTooth-${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const rgb = color.match(/[\d.]+/g) ?? ["255", "255", "255", "0.035"];
  const [r, g, b] = rgb;
  const alpha = Math.min(0.05, Number(rgb[3] ?? 0.035));
  const shape = radius !== undefined ? { borderRadius: radius } : null;
  const ink = `rgba(${r},${g},${b},${alpha})`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, shape, styles.clip, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} width="13" height="13" patternUnits="userSpaceOnUse">
            <Circle cx="2" cy="3" r="0.45" fill={ink} />
            <Circle cx="10.5" cy="5.5" r="0.35" fill={ink} />
            <Circle cx="6" cy="11" r="0.28" fill={ink} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
