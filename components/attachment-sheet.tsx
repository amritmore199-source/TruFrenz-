import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { MAX_VOICE_SECONDS, clampVoiceSeconds, type AttachmentDraft } from "@/lib/chat-extras";

/** Public places a member can pin manually; never a live or exact location. */
const PLACE_CHOICES: readonly string[] = [
  "Café Lumen · Pacific Heights",
  "Alta Plaza Park · Pacific Heights",
  "Fillmore Bookshop · Lower Pac Heights",
  "Japantown Tea Room · Japantown",
  "Marina Green · Marina District",
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onPickPhoto: () => void;
  onSend: (draft: AttachmentDraft) => void;
  onSuggestPlan: (kind: "hangout" | "meetup") => void;
  /**
   * Hand a recorded voice note back to the composer so it can be reviewed
   * above the input bar before it is sent. When omitted the sheet sends the
   * note itself, which keeps the sheet usable on its own.
   */
  onReviewVoice?: (draft: AttachmentDraft) => void;
};

type Mode = "menu" | "voice" | "location";

/** The "+" sheet: photos, a short voice note, a manual place pin, and plans. */
export function AttachmentSheet({ visible, onClose, onPickPhoto, onSend, onSuggestPlan, onReviewVoice }: Props) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [mode, setMode] = useState<Mode>("menu");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      setMode("menu");
      setRecording(false);
      setSeconds(0);
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const startRecording = () => {
    setRecording(true);
    setSeconds(0);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSeconds((current) => {
        const next = clampVoiceSeconds(current + 1);
        if (next >= MAX_VOICE_SECONDS && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
          setRecording(false);
        }
        return next;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
  };

  const sendVoice = () => {
    stopRecording();
    const duration = clampVoiceSeconds(seconds || 1);
    const draft: AttachmentDraft = { kind: "voice", durationSeconds: duration, uri: `local-voice-${Date.now()}` };
    if (onReviewVoice) {
      // The composer shows a preview strip; the member confirms there.
      onReviewVoice(draft);
    } else {
      onSend(draft);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]} onPress={onClose}>
        <BlurView intensity={35} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.sheet, { maxWidth: modalLayout.maxWidth, backgroundColor: glassSurfaceColor("rgba(250,248,251,0.92)", glassOpacity) }]}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.card, { backgroundColor: glassSurfaceColor("rgba(250,248,251,0.9)", glassOpacity) }]}>
            <View style={styles.handle} />

            {mode === "menu" ? (
              <>
                <Text style={styles.eyebrow}>SEND SOMETHING</Text>
                <Text style={styles.title}>Keep it light.</Text>
                <View style={styles.grid}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Send a photo" onPress={() => { onClose(); onPickPhoto(); }} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                    <View style={styles.tileIconPink}><MaterialIcons name="photo-camera" size={19} color="#9A7796" /></View>
                    <Text style={styles.tileTitle}>Photo</Text>
                    <Text style={styles.tileSub}>From your library</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Record a short voice note" onPress={() => setMode("voice")} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                    <View style={styles.tileIconBlue}><MaterialIcons name="mic-none" size={19} color="#7393A8" /></View>
                    <Text style={styles.tileTitle}>Voice note</Text>
                    <Text style={styles.tileSub}>Up to {MAX_VOICE_SECONDS}s</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Share a place manually" onPress={() => setMode("location")} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                    <View style={styles.tileIconGreen}><MaterialIcons name="place" size={19} color="#6E9C86" /></View>
                    <Text style={styles.tileTitle}>Place pin</Text>
                    <Text style={styles.tileSub}>Manual, never live</Text>
                  </Pressable>
                </View>

                <View style={styles.divider} />
                <Text style={styles.eyebrow}>PLAN TOGETHER</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Suggest a hangout card" onPress={() => { onClose(); onSuggestPlan("hangout"); }} style={styles.row}>
                  <View style={styles.tileIconPink}><MaterialIcons name="local-cafe" size={17} color="#9A7796" /></View>
                  <View style={styles.copy}><Text style={styles.rowTitle}>Suggest Hangout</Text><Text style={styles.rowSub}>A card with time and place, accept or decline</Text></View>
                  <MaterialIcons name="chevron-right" size={17} color="#A9A1AB" />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Suggest a meetup card" onPress={() => { onClose(); onSuggestPlan("meetup"); }} style={styles.row}>
                  <View style={styles.tileIconBlue}><MaterialIcons name="event-available" size={17} color="#7393A8" /></View>
                  <View style={styles.copy}><Text style={styles.rowTitle}>Suggest Meetup</Text><Text style={styles.rowSub}>Adds an arrival check-in for the day</Text></View>
                  <MaterialIcons name="chevron-right" size={17} color="#A9A1AB" />
                </Pressable>
              </>
            ) : null}

            {mode === "voice" ? (
              <>
                <Text style={styles.eyebrow}>VOICE NOTE</Text>
                <Text style={styles.title}>{recording ? "Recording…" : "Ready when you are."}</Text>
                <View style={styles.recordRow}>
                  <View style={[styles.recordDot, recording && styles.recordDotLive]} />
                  <Text style={styles.recordTime}>{seconds}s / {MAX_VOICE_SECONDS}s</Text>
                </View>
                <View style={styles.waveRow}>
                  {[8, 16, 22, 12, 20, 26, 14, 10, 18, 24, 12, 16].map((height, index) => (
                    <View key={index} style={[styles.waveBar, { height }, recording && styles.waveBarLive]} />
                  ))}
                </View>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={recording ? "Stop recording" : "Start recording"} onPress={recording ? stopRecording : startRecording} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                    <MaterialIcons name={recording ? "stop" : "mic"} size={16} color="#FFFFFF" />
                    <Text style={styles.primaryText}>{recording ? "Stop" : "Start"}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={onReviewVoice ? "Review this voice note before sending" : "Send this voice note"} onPress={sendVoice} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                    <MaterialIcons name="send" size={15} color="#7C7286" />
                    <Text style={styles.ghostText}>{onReviewVoice ? "Preview" : "Send"}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Back to attachments" onPress={() => { stopRecording(); setMode("menu"); }} style={styles.ghost}>
                    <Text style={styles.ghostText}>Back</Text>
                  </Pressable>
                </View>
                <Text style={styles.note}>Voice notes stay short on purpose. Audio is stored with the message, never streamed live.</Text>
              </>
            ) : null}

            {mode === "location" ? (
              <>
                <Text style={styles.eyebrow}>SHARE A PLACE</Text>
                <Text style={styles.title}>Pin a public spot.</Text>
                <Text style={styles.note}>This is a manual share, separate from the live-location map. Your exact position is never sent automatically.</Text>
                {PLACE_CHOICES.map((place) => (
                  <Pressable key={place} accessibilityRole="button" accessibilityLabel={`Share ${place}`} onPress={() => { onSend({ kind: "location", place }); onClose(); }} style={styles.row}>
                    <View style={styles.tileIconGreen}><MaterialIcons name="place" size={16} color="#6E9C86" /></View>
                    <View style={styles.copy}><Text style={styles.rowTitle} numberOfLines={1}>{place.split(" · ")[0]}</Text><Text style={styles.rowSub}>{place.split(" · ")[1]}</Text></View>
                    <MaterialIcons name="send" size={15} color="#A9A1AB" />
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel="Back to attachments" onPress={() => setMode("menu")} style={styles.cancel}>
                  <Text style={styles.cancelText}>Back</Text>
                </Pressable>
              </>
            ) : null}

            <Pressable accessibilityRole="button" accessibilityLabel="Close attachments" onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </Pressable>
        </BlurView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(58,49,64,0.24)" },
  sheet: { width: "100%", borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", overflow: "hidden", shadowColor: "#5C4F63", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  card: { borderRadius: 22, padding: 14, paddingBottom: 16 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(150,140,155,0.35)", marginBottom: 9 },
  eyebrow: { color: "#A79FAB", fontSize: 8.5, fontWeight: "700", letterSpacing: 0.9 },
  title: { color: "#4E4856", fontSize: 13, fontWeight: "700", marginTop: 3 },
  grid: { flexDirection: "row", gap: 8, marginTop: 11 },
  tile: { flex: 1, borderRadius: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", backgroundColor: "rgba(255,255,255,0.7)", paddingHorizontal: 9, paddingVertical: 11, gap: 4, shadowColor: "#7A6E80", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tileIconPink: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(246,238,247,0.92)" },
  tileIconBlue: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(238,244,248,0.92)" },
  tileIconGreen: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(238,246,241,0.92)" },
  tileTitle: { color: "#554F59", fontSize: 10.5, fontWeight: "650" as any, marginTop: 3 },
  tileSub: { color: "#948C99", fontSize: 8.5 },
  divider: { height: 1, backgroundColor: "rgba(224,218,226,0.7)", marginVertical: 11 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#554F59", fontSize: 11, fontWeight: "650" as any },
  rowSub: { color: "#948C99", fontSize: 9, marginTop: 2 },
  recordRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  recordDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#D5CBD8" },
  recordDotLive: { backgroundColor: "#D07E8E" },
  recordTime: { color: "#6E6672", fontSize: 11, fontWeight: "700" },
  waveRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 28, marginTop: 8 },
  waveBar: { flex: 1, borderRadius: 3, backgroundColor: "rgba(200,178,204,0.7)" },
  waveBarLive: { backgroundColor: "#B98FB4" },
  actions: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13, flexWrap: "wrap" },
  primary: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: "#9D7E9E", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  ghost: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.94)", backgroundColor: "rgba(255,255,255,0.68)" },
  ghostText: { color: "#7C7286", fontSize: 10, fontWeight: "650" as any },
  note: { color: "#948C99", fontSize: 9, lineHeight: 14, marginTop: 9 },
  cancel: { alignItems: "center", paddingVertical: 11, marginTop: 3 },
  cancelText: { color: "#8C8492", fontSize: 10, fontWeight: "600" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
