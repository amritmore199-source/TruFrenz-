import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { GlassSurface } from "@/components/glass-surface";
import { useAppAppearance } from "@/lib/appearance-context";
import { glassSwitchTrack } from "@/lib/glass";

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Kept for compatibility with RN Switch callers. The cast determines the track. */
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
};

/** A true frosted track with an accessible, full-size hit target; no opaque native Switch paint. */
export function GlassSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
  pointerEvents,
}: Props) {
  const { glassTint } = useAppAppearance();
  const track = glassSwitchTrack(glassTint);
  return (
    <Pressable
      pointerEvents={pointerEvents}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <GlassSurface surface="chip" radius={17} sheen={false} fill={value ? track.on : track.off} style={styles.track}>
        <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: 54, height: 36, justifyContent: "center" },
  track: { height: 32, width: 54, justifyContent: "center" },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F5F5F7",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    shadowColor: "#14283A",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  thumbOff: { marginLeft: 4 },
  thumbOn: { marginLeft: 25 },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.45 },
});
