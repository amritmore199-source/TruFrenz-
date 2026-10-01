import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import { useAppAppearance } from "@/lib/appearance-context";
import {
  GLASS_SHADOW,
  GLASS_SHADOW_OPACITY,
  glassBlur,
  glassEdge,
  glassTint,
  glassVeil,
  type GlassSurface as GlassSurfaceKind,
} from "@/lib/glass";

type Props = {
  children?: React.ReactNode;
  /** Which weight class this surface belongs to. Defaults to a card. */
  surface?: GlassSurfaceKind;
  /** Border radius, so the sheen and blur can be clipped to the same shape. */
  radius?: ViewStyle["borderRadius"];
  style?: StyleProp<ViewStyle>;
  /** A colour to lay under the glass, for a surface that needs its own cast. */
  fill?: string;
  /**
   * A description for screen readers, for surfaces that read as one object rather
   * than as a group of controls — a plan card, a poll. The label belongs on the
   * surface, so the card is announced once instead of each inner line becoming
   * its own stop.
   */
  accessibilityLabel?: string;
};

/**
 * A frosted glass surface, in the structure the reference sheet uses.
 *
 * The app already had a version of this in the main screen, but it was local to
 * that file: every other screen painted its own translucent fill and stopped
 * there, which is why cards looked like flat coloured panels rather than glass.
 * A translucent fill is not a frosted surface — frost is a *blur of what is
 * behind it*, so a surface without a blur has nothing to make it frosted, no
 * matter how pale its colour is.
 *
 * Four layers, in order:
 *
 *   1. the blur, which diffuses the wallpaper behind the surface
 *   2. the cast, the only colour the glass has of its own
 *   3. the sheen, light falling across the top third
 *   4. the rim, a bright edge that gives the surface a physical boundary
 *
 * The depth is a soft cool shadow rather than a dark fill, which is how the
 * reference card lifts off the page while staying lighter than it.
 */
export function GlassSurface({
  children,
  surface = "card",
  radius = 18,
  style,
  fill,
  accessibilityLabel,
}: Props) {
  const { glassOpacity, glassTint: cast } = useAppAppearance();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        style,
        {
          borderRadius: radius,
          backgroundColor: fill ?? glassTint(surface, glassOpacity, cast),
          borderColor: glassEdge(surface, cast),
          shadowColor: GLASS_SHADOW,
          shadowOpacity: GLASS_SHADOW_OPACITY,
        },
      ]}
    >
      <BlurView
        intensity={glassBlur(surface)}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.noninteractive, { borderRadius: radius }]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.sheen,
          { borderRadius: radius, backgroundColor: glassVeil(surface, glassOpacity, cast) },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  sheen: { position: "absolute", left: 0, right: 0, top: 0, height: "52%" },
  noninteractive: { pointerEvents: "none" },
  pressed: { opacity: 0.85 },
});
/**
 * A glass card that is *also* a pressable, for rows and tiles that link onward.
 *
 * Kept as a thin wrapper rather than a prop on the surface above, because
 * Pressable's own props (accessibility role, label, pressed state) are set at the
 * call site and threading them through an intermediate component would obscure
 * which element the member actually taps.
 */
export function GlassCard({
  children,
  style,
  surface = "card",
  radius = 18,
  onPress,
  accessibilityLabel,
  accessibilityRole = "button",
}: Props & {
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "none";
}) {
  if (!onPress) {
    return (
      <GlassSurface surface={surface} radius={radius} style={style}>
        {children}
      </GlassSurface>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <GlassSurface surface={surface} radius={radius} style={style}>
        {children}
      </GlassSurface>
    </Pressable>
  );
}
