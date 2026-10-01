import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import {
  attachmentPreviewLabel,
  attachmentPreviewNote,
  attachmentPreviewTitle,
  formatVoiceLength,
  type PendingAttachment,
} from "@/lib/attachment-preview";

type Props = {
  pending: PendingAttachment;
  /** Bytes of the picked photo, when the platform reports them. */
  sizeBytes?: number;
  onRemove: () => void;
};

/**
 * The review step between picking an attachment and sending it.
 *
 * It sits directly above the input bar, so the member sees what is going out
 * while their thumb is still on the send button. A photo is shown as a real
 * thumbnail; a voice note gets its own length readout because there is no
 * waveform to replay here.
 */
export function AttachmentPreviewStrip({ pending, sizeBytes, onRemove }: Props) {
  const { glassOpacity } = useAppAppearance();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pending.id, enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <Animated.View
      accessibilityRole="summary"
      accessibilityLabel={`${attachmentPreviewTitle(pending.kind)}. ${attachmentPreviewLabel(pending, { sizeBytes })}. ${attachmentPreviewNote(pending.kind)}`}
      style={[styles.shell, { opacity: enter, transform: [{ translateY }] }]}
    >
      <BlurView
        intensity={40}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.blur]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          styles.tint,
          { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(252, 251, 243, 0.82)"), glassOpacity) },
        ]}
      />

      <View style={styles.thumbFrame}>
        {pending.kind === "photo" && pending.uri ? (
          <Image source={{ uri: pending.uri }} style={styles.thumb} />
        ) : (
          <View style={styles.voiceThumb}>
            <MaterialIcons name="graphic-eq" size={18} color="#788C9C" />
          </View>
        )}
      </View>

      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {attachmentPreviewTitle(pending.kind)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {pending.kind === "voice"
            ? `Length ${formatVoiceLength(pending.durationSeconds ?? 0)} · tap send when ready`
            : attachmentPreviewLabel(pending, { sizeBytes })}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove the pending ${pending.kind === "photo" ? "photo" : "voice note"}`}
        onPress={onRemove}
        style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
      >
        <MaterialIcons name="close" size={15} color="#868379" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"),
    paddingHorizontal: 9,
    paddingVertical: 8,
    overflow: "hidden",
    shadowColor: "#7e7b73",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 9,
    elevation: 2,
  },
  blur: { borderRadius: 15, overflow: "hidden" },
  tint: { borderRadius: 15 },
  thumbFrame: { width: 40, height: 40, borderRadius: 12, overflow: "hidden", backgroundColor: glassNestedFill("rgba(238, 240, 245, 0.9)") },
  thumb: { width: "100%", height: "100%" },
  voiceThumb: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(236, 242, 247, 0.94)") },
  copy: { flex: 1, minWidth: 0 },
  title: { color: "#43423d", fontSize: 11, fontWeight: "650" as any },
  meta: { color: "#6E6C67", fontSize: 9, marginTop: 2 },
  remove: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"),
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"),
  },
  removePressed: { opacity: 0.75 },
});