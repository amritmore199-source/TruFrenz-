import type { ImageSourcePropType } from "react-native";

import type { GlassTint } from "./glass";

/**
 * Which wallpaper belongs behind which glass cast.
 *
 * The casts were not fully interchangeable with any single wallpaper, and the
 * reason is arithmetic rather than taste. The app draws text in one of two
 * directions: the night cast is bright white on translucent slate, and the pale
 * casts are dark ink on translucent white. A wallpaper that helps one hurts the
 * other — a bright photo is what light glass wants, and a dark photo is what
 * light text wants — so no single image can serve both, and forcing one to try
 * meant a heavy veil over the good parts of the picture.
 *
 * So the wallpaper follows the cast, which is the pairing that lets each be good
 * on its own terms. Measured against its own wallpaper, each cast clears AA with
 * room rather than by a hair:
 *
 *   night  (dusk + the night sky)   heading 5.65:1  body 5.24:1  secondary 4.94:1
 *   day    (sky/lemon + the light)  heading 8.16:1  body 7.29:1  secondary 5.05:1
 *
 * An unknown cast falls back to the light pairing, which is the app's default.
 */
export type WallpaperId = "night" | "day";

export const WALLPAPERS: Record<WallpaperId, ImageSourcePropType> = {
  night: require("../assets/images/trufrenz-night.jpg"),
  day: require("../assets/images/trufrenz-day.jpg"),
};

export const WALLPAPER_LABEL: Record<WallpaperId, string> = {
  night: "Midnight crew",
  day: "Crew watermark",
};

/** The wallpaper a cast is paired with. */
export function wallpaperForTint(tint: GlassTint): WallpaperId {
  return tint === "dusk" ? "night" : "day";
}

/** The image source for a cast. */
export function wallpaperSource(tint: GlassTint): ImageSourcePropType {
  return WALLPAPERS[wallpaperForTint(tint)];
}