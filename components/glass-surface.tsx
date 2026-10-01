import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import { useAppAppearance } from "@/lib/appearance-context";
import {
  GLASS_RIM_INNER_INSET,
  GLASS_SHADOW,
  GLASS_SHADOW_OPACITY,
  glassBlur,
  glassEdge,
  glassInnerRim,
  glassTint,
  glassTopGlow,
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
 * A frosted glass surface, built the way the reference samples are built.
 *
 * The samples were measured rather than eyeballed, and two things in them turned
 * out to matter more than the fill colour:
 *
 *   1. **The double rim.** Each card has a bright outer edge — pure white in two
 *      of the three samples — and then, a few pixels in, a thin inner hairline
 *      carrying the card's own cast: bright blue in the sky sample, bright yellow
 *      in the lemon one. The pair reads as the ground edge of a real sheet of
 *      glass. A single border does not; this app had one at half opacity, which
 *      is why its cards looked drawn rather than lit.
 *
 *   2. **The top glow.** A soft light halo pools just inside the upper rim in
 *      every sample, so the surface has a falloff across it. Without it a large
 *      card is a flat field of one colour, which is exactly how the app's cards
 *      were reading.
 *
 * The layers, in order:
 *
 *   1. the blur, which diffuses the wallpaper behind the surface
 *   2. the cast, the only colour the glass has of its own
 *   3. the sheen, light across the whole face, and the glow along the top edge
 *   4. the outer rim, the inner hairline, and a soft shadow for depth
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
  const shape = { borderRadius: radius };
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        /*
         * The defaults come first and the caller's style last, deliberately. An
         * active tab pill or a selected chip passes its own cast through `style`,
         * and a later entry would silently win over it — which is how the active
         * states lost their tint when this order was the other way round.
         */
        styles.base,
        shape,
        {
          backgroundColor: fill ?? glassTint(surface, glassOpacity, cast),
          borderColor: glassEdge(surface, cast),
          shadowColor: GLASS_SHADOW,
          shadowOpacity: GLASS_SHADOW_OPACITY,
        },
        style,
      ]}
    >
      <BlurView
        intensity={glassBlur(surface)}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.noninteractive, shape]}
      />
      <View
        pointerEvents="none"
        style={[styles.sheen, shape, { backgroundColor: glassVeil(surface, glassOpacity, cast) }]}
      />
      <View
        pointerEvents="none"
        style={[styles.topGlow, { backgroundColor: glassTopGlow(cast) }]}
      />
      {/*
        The inner hairline. Absolute rather than a second nested View, so it can
        be inset a few pixels from the outer rim without changing the layout of
        anything the caller puts inside the surface.
      */}
      <View
        pointerEvents="none"
        style={[
          styles.innerRim,
          {
            borderRadius: typeof radius === "number" ? Math.max(0, radius - GLASS_RIM_INNER_INSET) : radius,
            borderColor: glassInnerRim(cast),
          },
        ]}
      />
      {children}
    </View>
  );
}

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
      <GlassSurface surface={surface} radius={radius} style={style} accessibilityLabel={accessibilityLabel}>
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

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
  /* The face light covers the whole card in the samples, not just the top half. */
  sheen: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  /* A pool of light along the top edge, strongest at the very top. */
  topGlow: { position: "absolute", left: 0, right: 0, top: 0, height: "38%" },
  innerRim: {
    position: "absolute",
    left: GLASS_RIM_INNER_INSET,
    right: GLASS_RIM_INNER_INSET,
    top: GLASS_RIM_INNER_INSET,
    bottom: GLASS_RIM_INNER_INSET,
    borderWidth: 1,
  },
  noninteractive: { pointerEvents: "none" },
  pressed: { opacity: 0.85 },
});
