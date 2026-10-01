import type { ImageSourcePropType } from "react-native";

/**
 * The app's wallpaper: the crew artwork.
 *
 * There is deliberately only one. An earlier version shipped a pair, pairing a
 * dark photo with the night cast and a light one with the pale casts, because
 * the two palettes want opposite things from a background — bright white text
 * wants a dark picture, dark ink wants a bright one. The member's artwork
 * settles the question instead of splitting it: it is a drawing on white paper,
 * so the app is a light app, and the casts are surface tints laid over the same
 * picture rather than three different worlds.
 *
 * The artwork is published lifted: its black point is raised so the drawing's
 * shadows sit at 200/255 rather than near-black. That is not decoration. The
 * paper field is already excellent — body text reads 7.7:1 over it — but the
 * line work and sunglasses are dark enough that small text over them fell to
 * 3.7:1. Raised, the worst shadow in the picture holds body text at 6.4:1 and
 * the secondary grey at 4.6:1, and the drawing still reads as a drawing because
 * the lift moves only its darkest values.
 */
export const WALLPAPER: ImageSourcePropType = require("../assets/images/trufrenz-art.jpg");

/** The one wallpaper, whatever the cast. Kept as a function so call sites do not change. */
export function wallpaperSource(): ImageSourcePropType {
  return WALLPAPER;
}