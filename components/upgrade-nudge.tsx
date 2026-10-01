/**
 * The soft upgrade nudge.
 *
 * A member who has used seven of ten free hangout invites is the member who
 * values the feature. This card speaks to exactly that person, at exactly that
 * moment, and never earlier: `proposalNudge` and `groupCapacityNudge` decide
 * when it is allowed to appear, and both stay silent while there is plenty of
 * room left.
 *
 * Two intensities, deliberately close together:
 *
 * - `near`     a quiet hint with a compare link. Nothing is blocked.
 * - `at-limit` the same card, one step firmer, because the next tap will be
 *              refused and the member deserves to know why before they tap.
 *
 * It is dismissible, and a dismissal is remembered for the session so the app
 * never nags twice for the same limit.
 */

import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { useAppAppearance } from "@/lib/appearance-context";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import type { UpgradeNudge as Nudge } from "@/lib/subscription-store";

type Props = {
  nudge: Nudge;
  onUpgrade: () => void;
  onDismiss: () => void;
};

export function UpgradeNudgeCard({ nudge, onUpgrade, onDismiss }: Props) {
  const { glassOpacity } = useAppAppearance();
  if (nudge.level === "hidden") return null;

  const atLimit = nudge.level === "at-limit";
  const hapticTap = () => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: glassSurfaceColor(atLimit ? "#FBF3E6" : "#FFFFFF", glassOpacity) },
        atLimit && styles.shellAtLimit,
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${nudge.title}. ${nudge.body}`}
    >
      <BlurView intensity={38} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        <View style={[styles.badge, atLimit && styles.badgeAtLimit]}>
          <MaterialIcons
            name={atLimit ? "lock-clock" : "auto-awesome"}
            size={16}
            color={atLimit ? "#A5763F" : "#83721f"}
          />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{nudge.title}</Text>
          <Text style={styles.body}>{nudge.body}</Text>
        </View>
        <Pressable
          onPress={() => {
            hapticTap();
            onDismiss();
          }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss this hint"
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <MaterialIcons name="close" size={15} color="#8A8880" />
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          hapticTap();
          onUpgrade();
        }}
        accessibilityRole="button"
        accessibilityLabel={nudge.cta}
        style={({ pressed }) => [styles.cta, atLimit && styles.ctaAtLimit, pressed && styles.pressed]}
      >
        <MaterialIcons name="workspace-premium" size={14} color={atLimit ? "#FFFFFF" : "#6f6741"} />
        <Text style={[styles.ctaText, atLimit && styles.ctaTextAtLimit]}>{nudge.cta}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    padding: 11,
    gap: 9,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.78)"),
    shadowColor: "#454023",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  shellAtLimit: { borderColor: "rgba(212, 178, 132, 0.75)" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"),
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.92)"),
  },
  badgeAtLimit: { backgroundColor: glassNestedFill("rgba(252, 244, 232, 0.95)"), borderColor: "rgba(226, 198, 158, 0.8)" },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 12.5, fontWeight: "700", color: "#494532" },
  body: { fontSize: 11, color: "#5F5D57", lineHeight: 15.5 },
  dismiss: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.66)"),
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.85)"),
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 34,
    borderRadius: 12,
    backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.40)"),
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"),
  },
  ctaAtLimit: { backgroundColor: "#E9D177", borderColor: glassNestedFill("rgba(255, 255, 255, 0.55)") },
  ctaText: { fontSize: 12, fontWeight: "700", color: "#6f6741" },
  ctaTextAtLimit: { color: "#43423d" },
  pressed: { opacity: 0.82 },
});
