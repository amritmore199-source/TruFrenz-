import React, { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { callHeaderLabel, callStateCopy, type CallSession } from "@/lib/group-management";

type Props = {
  session: CallSession | null;
  /** Group calls show the group name and a member count instead of one peer. */
  groupLabel?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
};

/**
 * The call screen. It is designed to be raised from a push notification, so it
 * works even when the app was backgrounded, and it always shows the verified
 * badge so an impostor is easier to spot.
 */
export function CallScreen({ session, groupLabel, onAccept, onDecline, onEnd }: Props) {
  const { glassOpacity } = useAppAppearance();
  const ringing = session?.state === "ringing";

  useEffect(() => {
    if (!session) return;
  }, [session]);

  if (!session) return null;

  const incoming = session.direction === "incoming";
  const connected = session.state === "connected";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={ringing && incoming ? onDecline : onEnd}>
      <View style={styles.fill}>
        <BlurView intensity={48} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.backdrop} />
        <View style={[styles.panel, { backgroundColor: glassSurfaceColor("rgba(252,250,252,0.92)", glassOpacity) }]}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, session.video && styles.avatarVideo]}>
              <MaterialIcons name={groupLabel ? "groups" : "person"} size={30} color="#FFFFFF" />
            </View>
            {session.peerVerified ? (
              <View accessibilityLabel="Verified member" style={styles.verifiedBadge}>
                <MaterialIcons name="verified" size={13} color="#FFFFFF" />
              </View>
            ) : null}
            {ringing ? <View style={styles.ringHalo} /> : null}
          </View>

          <Text style={styles.title} numberOfLines={1}>{groupLabel ?? session.peerName}</Text>
          <Text style={styles.subtitle}>{callHeaderLabel(session)}</Text>
          <Text style={styles.state}>{callStateCopy(session)}</Text>
          {!session.peerVerified && !groupLabel ? <Text style={styles.warn}>This member is not ID-verified yet. Ask a quick question only they would know.</Text> : null}

          {ringing && incoming ? (
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Decline this call" onPress={onDecline} style={({ pressed }) => [styles.decline, pressed && styles.pressed]}>
                <MaterialIcons name="call-end" size={24} color="#FFFFFF" />
                <Text style={styles.actionText}>Decline</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Accept this call" onPress={onAccept} style={({ pressed }) => [styles.accept, pressed && styles.pressed]}>
                <MaterialIcons name={session.video ? "videocam" : "call"} size={24} color="#FFFFFF" />
                <Text style={styles.actionText}>Accept</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel={connected ? "End this call" : "Cancel this call"} onPress={onEnd} style={({ pressed }) => [styles.decline, pressed && styles.pressed]}>
                <MaterialIcons name="call-end" size={24} color="#FFFFFF" />
                <Text style={styles.actionText}>{connected ? "End call" : "Cancel"}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.noteRow}>
            <MaterialIcons name="lock-outline" size={13} color="#8A8291" />
            <Text style={styles.note}>Calls are end-to-end encrypted and only reachable by accepted friends. Declining never sends a pushy notification.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  panel: { width: "100%", maxWidth: 340, borderRadius: 26, borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", paddingHorizontal: 20, paddingVertical: 24, alignItems: "center", shadowColor: "#5C4F63", shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  avatarWrap: { alignItems: "center", justifyContent: "center" },
  avatar: { width: 76, height: 76, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#9D8AA8", borderWidth: 1, borderColor: "rgba(255,255,255,0.75)" },
  avatarVideo: { backgroundColor: "#8FA6B6" },
  ringHalo: { position: "absolute", width: 96, height: 96, borderRadius: 36, borderWidth: 2, borderColor: "rgba(190,150,190,0.5)" },
  verifiedBadge: { position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#61A088", borderWidth: 2, borderColor: "#FBF9FB" },
  title: { color: "#4E4856", fontSize: 17, fontWeight: "700", marginTop: 15 },
  subtitle: { color: "#8A8291", fontSize: 11, marginTop: 4 },
  state: { color: "#7C7286", fontSize: 10, fontWeight: "650" as any, marginTop: 6 },
  warn: { color: "#9A7796", fontSize: 9.5, lineHeight: 14, textAlign: "center", marginTop: 9 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 20 },
  decline: { alignItems: "center", justifyContent: "center", gap: 5, width: 84, height: 84, borderRadius: 42, backgroundColor: "#C98191", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  accept: { alignItems: "center", justifyContent: "center", gap: 5, width: 84, height: 84, borderRadius: 42, backgroundColor: "#6E9C86", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  actionText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 20, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: "rgba(246,242,247,0.86)" },
  note: { flex: 1, color: "#8A8291", fontSize: 9, lineHeight: 14 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
});
