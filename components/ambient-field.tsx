import React from "react";
import { StyleSheet, View } from "react-native";

/**
 * The soft pools of colour the glass sits over.
 *
 * Why this exists at all: frosted glass only reads as glass when there is
 * something behind it for the blur to pick up. The reference samples make that
 * obvious — a lemon, a blue ring, grey marble. This app's backdrop is a pale
 * line drawing, so a card laid straight over it has almost nothing to show
 * through it and comes out the same tone as the page.
 *
 * Why it is built from rings rather than plain circles: the first attempt used a
 * single large View per pool, and a View is a hard-edged shape — the result was
 * three solid discs with crisp rims sitting on top of the wallpaper, which looked
 * like spilled paint rather than light. There is no blur primitive that will
 * soften an arbitrary decoration in React Native, so each pool is instead drawn
 * as a stack of concentric circles from the outside in. Their alphas accumulate
 * towards the centre and produce a radial falloff, which reads as a glow.
 *
 * The per-ring alpha is solved rather than guessed: for a pool meant to reach
 * `a` at its centre, each of the N rings contributes `1 - (1 - a)^(1/N)`, so the
 * accumulated centre is exactly `a` and the edge is negligible.
 */
const RINGS = 14;

type Pool = {
  /** Colour including its target centre alpha, e.g. `rgba(168, 214, 246, 0.36)`. */
  color: string;
  /** Centre of the pool as a fraction of the parent, 0..1 on each axis. */
  x: number;
  y: number;
  /** Diameter as a fraction of the parent's width. */
  size: number;
};

type Props = {
  /** The three pools, normally from `glassAmbient()`. */
  warm: string;
  cool: string;
  soft: string;
};

const POOLS: Omit<Pool, "color">[] = [
  { x: 0.92, y: 0.16, size: 1.05 },
  { x: 0.06, y: 0.46, size: 1.0 },
  { x: 0.9, y: 0.78, size: 0.9 },
];

function parse(value: string): { rgb: string; alpha: number } {
  const nums = value.match(/[\d.]+/g) ?? [];
  const [r, g, b] = nums;
  const a = nums.length > 3 ? Number(nums[3]) : 1;
  return { rgb: `${r}, ${g}, ${b}`, alpha: a };
}

/**
 * Renders one pool as a stack of circles whose alphas build to the target.
 *
 * `onLayout` is not needed: the rings are sized as percentages of the parent, so
 * the pool scales with whatever container it is placed in.
 */
function Glow({ color, x, y, size }: Pool) {
  const { rgb, alpha } = parse(color);
  // Solve the per-ring alpha so the accumulated centre lands on the target.
  const perRing = 1 - Math.pow(1 - Math.min(alpha, 0.95), 1 / RINGS);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.pool,
        {
          width: `${size * 100}%`,
          aspectRatio: 1,
          left: `${x * 100}%`,
          top: `${y * 100}%`,
        },
      ]}
    >
      {Array.from({ length: RINGS }, (_, i) => {
        // 1 at the outer ring down to 1/RINGS at the centre.
        const scale = 1 - i / (RINGS + 1);
        return (
          <View
            key={i}
            style={[
              styles.ring,
              {
                width: `${scale * 100}%`,
                height: `${scale * 100}%`,
                borderRadius: 9999,
                backgroundColor: `rgba(${rgb}, ${perRing.toFixed(4)})`,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export function AmbientField({ warm, cool, soft }: Props) {
  const colors = [warm, cool, soft];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.clip]}>
      {POOLS.map((pool, i) => (
        <Glow key={i} {...pool} color={colors[i]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  /* Translated by half its own size, so x/y are the pool's actual centre. */
  pool: { position: "absolute", alignItems: "center", justifyContent: "center", transform: [{ translateX: "-50%" }, { translateY: "-50%" }] },
  ring: { position: "absolute" },
});