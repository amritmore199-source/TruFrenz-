import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { GlassBlur } from "@/components/glass-blur";
import { GlassTopGlow } from "@/components/glass-glow";

import { useAppAppearance } from "@/lib/appearance-context";
import {
  GLASS_SHADOW,
  GLASS_SHADOW_OPACITY,
  glassBlur,
  glassEdge,
  glassTint,
  glassVeil,
  type GlassTint,
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
   * Render a cast other than the member's current one.
   *
   * Only the cast picker uses this: each chip is a live thumbnail of the material
   * it offers, so the member sees the real glass — blur, rim, inner hairline, top
   * glow — at their own opacity, before committing to it. Every other surface in
   * the app takes the cast from the provider, as it should.
   */
  cast?: GlassTint;
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
 *   1. **The rim.** Each card has a bright outer edge — pure white in two of the
 *      three samples. It was briefly built as a *pair*, with a second hairline a
 *      few pixels inside carrying the cast, because that is what the samples show.
 *      At these card sizes the pair measured as two hairlines a pixel or two apart,
 *      which the eye reads as a slightly muddy single edge — or, on small surfaces,
 *      as a double outline. The member asked for the inner line to go, so the outer
 *      rim now carries the whole edge and is correspondingly stronger. The two-line
 *      form is still shown, enlarged, in the appearance picker, which is the one
 *      place it is legible and worth seeing.
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
 *   4. the outer rim and a soft shadow for depth
 */
export function GlassSurface({
  children,
  surface = "card",
  radius = 18,
  style,
  fill,
  cast: castOverride,
  accessibilityLabel,
}: Props) {
  /*
   * Named `activeCast` rather than `glassTint` so it does not shadow the imported
   * `glassTint()` resolver, which this component calls two lines further down.
   */
  const { glassOpacity, glassTint: activeCast } = useAppAppearance();
  const cast = castOverride ?? activeCast;
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
      <GlassBlur
        intensity={glassBlur(surface)}
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.noninteractive, shape]}
      />
      <View
        pointerEvents="none"
        style={[styles.sheen, shape, { backgroundColor: glassVeil(surface, glassOpacity, cast) }]}
      />
      {/*
        A real gradient, not a solid band. See `GlassGlow` for why: a View is a
        rectangle, so the previous solid block of light ended in a step rather than
        fading, and that step was measurable across the middle of the card.
      */}
      <GlassTopGlow cast={cast} radius={typeof radius === "number" ? radius : 18} />
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
  noninteractive: { pointerEvents: "none" },
  pressed: { opacity: 0.85 },
});
