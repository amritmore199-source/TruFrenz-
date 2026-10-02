import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { GlassGlow } from "@/components/glass-glow";
import { activeGlassTint, glassTopGlow } from "@/lib/glass";

/**
 * The blur layer of a glass surface.
 *
 * Why this exists rather than calling `BlurView` directly: **`expo-blur`'s web
 * build ignores the colour a caller passes.** It computes its own and appends it
 * *after* the caller's style, so the caller's fill never reaches the screen:
 *
 * ```js
 * // node_modules/expo-blur/build/BlurView.web.js
 * return (<View {...props} style={[style, blurStyle]} .../>);
 *
 * // node_modules/expo-blur/build/getBackgroundColor.js
 * case 'light':
 *   return `rgba(249,249,249,${opacity * 0.78})`;
 * ```
 *
 * Every surface in this app therefore rendered a `rgba(249,249,249,0.33)` film
 * instead of the tint `lib/glass.ts` had resolved for it. That film is the
 * "white patch" that was reported repeatedly: a near-white overlay on every card,
 * tab, toggle and sheet. Patching the fills one at a time could never remove it,
 * because it was never a fill. It is also why changing the cast looked like it did
 * nothing — the layer doing the visible compositing was not reading the cast.
 *
 * On web this is a plain `View` with `backdropFilter`, so nothing can override the
 * colour. React Native Web already emits the `-webkit-` prefix itself (its
 * `prefixStyles` module covers `backdropFilter`), so no library is involved.
 *
 * On native, `BlurView` is used, because there `style` really is honoured — the
 * override above exists only in the web build.
 *
 * The blur distance matches expo-blur's own scale (`intensity * 0.2`), so a value
 * chosen for one platform means the same thing on the other.
 */
type Props = {
  /** `expo-blur` intensity, 0-100. */
  intensity: number;
  /**
   * The resolved glass fill, painted **on the same element as the blur**.
   *
   * That co-location is the point, not a convenience. A backdrop filter applies to
   * what is painted *behind* the element, and the element's own background is then
   * painted over the filtered result. Put the tint on a parent instead and the
   * filter samples the parent's flat colour — and blurring a flat colour leaves it
   * flat, which is a surface that looks painted rather than frosted. This ordering
   * bug survived every previous attempt at this screen.
   *
   * Omit it for a pure blur: a scrim, or the bottom layer of `GlassSurface` where
   * the fill is painted by the surface itself.
   */
  fill?: string;
  /** Clips the blur to the surface's own shape. */
  radius?: number;
  /** Applied to the outer element, so a sheet keeps its own box. */
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "none" | "auto" | "box-none" | "box-only";
  /**
   * Lay the top glow over the blur.
   *
   * The glow is what stops a large surface reading as a flat field, and it was
   * being drawn by hand at each call site — so every sheet written before the
   * recipe settled simply did not have one, and a sheet is the largest surface in
   * the app. Offering it here is what lets those sheets get it without each one
   * re-implementing the gradient.
   *
   * Only set this on a call site that is the *top* glass layer of its surface. A
   * scrim passes nothing, because a scrim is not a pane and has no edge to catch
   * light; a call site that passes `children` and renders its content over the
   * blur passes `true`, because it is the sheet itself.
   */
  glow?: boolean | { radius?: number; heightRatio?: number };
  /**
   * Content to lay over the blur. Only used by call sites that render a sheet's
   * contents *inside* the blur element; most surfaces place the blur as a sibling
   * and pass nothing.
   */
  children?: React.ReactNode;
};

export function GlassBlur({
  intensity,
  fill,
  radius,
  style,
  pointerEvents = "none",
  glow,
  children,
}: Props) {
  const shape = radius !== undefined ? { borderRadius: radius } : null;
  const tint = fill ? { backgroundColor: fill } : null;

  const blur =
    Platform.OS === "web" ? (
      <View
        pointerEvents={pointerEvents}
        style={[
          StyleSheet.absoluteFillObject,
          shape,
          {
            /*
             * `saturate` alongside the blur is what keeps colour in the glass
             * rather than letting it wash to grey, and it matches expo-blur's own
             * composition so the two platforms read alike.
             */
            backdropFilter: `saturate(1.8) blur(${(Math.min(intensity, 100) * 0.2).toFixed(1)}px)`,
          } as unknown as ViewStyle,
          tint,
        ]}
      />
    ) : (
      <BlurView
        intensity={intensity}
        tint="default"
        experimentalBlurMethod="dimezisBlurView"
        pointerEvents={pointerEvents}
        style={[StyleSheet.absoluteFillObject, shape, tint]}
      />
    );

  /*
   * The glow reads the member's live cast rather than taking one as a prop. A sheet
   * is never previewing a cast the member is not using, and threading the cast
   * through twenty call sites to say so would be twenty chances to pass the wrong
   * one.
   */
  const glowLayer = glow ? (
    <GlassGlow
      color={glassTopGlow(activeGlassTint())}
      radius={(typeof glow === "object" ? glow.radius : undefined) ?? radius ?? 18}
      heightRatio={typeof glow === "object" ? glow.heightRatio : undefined}
    />
  ) : null;

  /*
   * A call site that passes children is using this as the sheet element itself, so
   * the blur fills it and the content sits on top. One that passes none is placing
   * the blur as a sibling layer, so the outer element must stay out of the layout
   * — `absoluteFillObject` is what makes it cover the surface it belongs to.
   */
  if (!children) {
    return (
      <View pointerEvents={pointerEvents} style={[StyleSheet.absoluteFillObject, shape, style]}>
        {blur}
        {glowLayer}
      </View>
    );
  }

  return (
    <View style={style}>
      {blur}
      {glowLayer}
      {children}
    </View>
  );
}
