import React from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";

export type FriendProfileDetails = {
  id: string;
  name: string;
  age: number;
  locality: string;
  interests: string[];
  image: ImageSourcePropType;
  verification: string;
  about: string;
};

export function FriendProfileModal({ visible, profile, onClose }: { visible: boolean; profile: FriendProfileDetails | null; onClose: () => void }) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  if (!profile) return null;
  const verified = profile.verification === "ID + selfie verified";
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}>
        <BlurView intensity={36} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close friend profile" onPress={onClose} />
        <View style={[styles.sheet, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor("rgba(252,249,252,0.92)", glassOpacity) }]}>
          <BlurView intensity={40} tint="light" experimentalBlurMethod="dimezisBlurView" pointerEvents="none" style={StyleSheet.absoluteFill} />
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close profile">
              <MaterialIcons name="close" size={19} color="#746A7D" />
            </Pressable>
          </View>
          <View style={styles.identity}>
            <View style={styles.avatarFrame}>
              <Image source={profile.image} style={styles.avatar} />
              {verified ? <View style={styles.verifiedDot}><MaterialIcons name="check" size={12} color="#FFFFFF" /></View> : null}
            </View>
            <Text style={styles.name}>{profile.name}, {profile.age}</Text>
            <View style={[styles.badge, !verified && styles.phoneBadge]}>
              <MaterialIcons name={verified ? "verified-user" : "phone-iphone"} size={13} color={verified ? "#5E947B" : "#7B8D9C"} />
              <Text style={[styles.badgeText, !verified && styles.phoneText]}>{profile.verification}</Text>
            </View>
            <View style={styles.locality}>
              <MaterialIcons name="place" size={15} color="#958797" />
              <Text style={styles.localityText}>{profile.locality} · broad area only</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>A LITTLE ABOUT THEM</Text>
          <Text style={styles.about}>{profile.about}</Text>
          <Text style={styles.sectionLabel}>THINGS YOU CAN TALK ABOUT</Text>
          <View style={styles.tags}>
            {profile.interests.map((interest) => (
              <View key={interest} style={styles.tag}><MaterialIcons name="auto-awesome" size={12} color="#9A7897" /><Text style={styles.tagText}>{interest}</Text></View>
            ))}
          </View>
          <View style={styles.safetyNote}>
            <MaterialIcons name="lock-outline" size={15} color="#7893A2" />
            <Text style={styles.safetyText}>You’re already friends. Share only what feels comfortable.</Text>
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
            <Text style={styles.doneText}>Back to conversation</Text>
            <MaterialIcons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(80,66,87,0.20)" },
  sheet: { flexShrink: 1, overflow: "hidden", borderRadius: 25, backgroundColor: "rgba(252,249,252,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#57465C", shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { padding: 16 },
  header: { height: 19, alignItems: "center", justifyContent: "center" },
  handle: { width: 34, height: 4, borderRadius: 4, backgroundColor: "rgba(152,137,157,0.35)" },
  close: { position: "absolute", right: -5, top: -4, width: 31, height: 31, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.84)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", alignItems: "center", justifyContent: "center", shadowColor: "#716579", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  identity: { alignItems: "center", paddingTop: 7, paddingBottom: 16 },
  avatarFrame: { width: 84, height: 84, borderRadius: 29, padding: 3, borderWidth: 1.5, borderColor: "#E8D9E9", position: "relative" },
  avatar: { width: "100%", height: "100%", borderRadius: 25, backgroundColor: "#EFE7F0" },
  verifiedDot: { position: "absolute", right: -3, bottom: -3, width: 22, height: 22, borderRadius: 9, borderWidth: 2, borderColor: "#FCF9FC", backgroundColor: "#70A58B", alignItems: "center", justifyContent: "center" },
  name: { marginTop: 10, color: "#4B4551", fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#EAF4EF", marginTop: 8 },
  phoneBadge: { backgroundColor: "#EDF1F4" },
  badgeText: { color: "#568C77", fontSize: 10, fontWeight: "600" },
  phoneText: { color: "#788B9A" },
  locality: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  localityText: { color: "#8F8792", fontSize: 10 },
  divider: { height: 1, backgroundColor: "rgba(220,212,222,0.65)", marginBottom: 14 },
  sectionLabel: { color: "#9B8B9B", fontSize: 8, fontWeight: "700", letterSpacing: 1, marginTop: 6 },
  about: { color: "#665F69", fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 11 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, backgroundColor: "rgba(243,233,244,0.91)", borderWidth: 1, borderColor: "rgba(255,255,255,0.93)", paddingHorizontal: 9, paddingVertical: 6 },
  tagText: { color: "#8F7592", fontSize: 9, fontWeight: "500" },
  safetyNote: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, marginTop: 16, borderRadius: 13, backgroundColor: "rgba(232,241,246,0.73)" },
  safetyText: { flex: 1, color: "#7E8D98", fontSize: 9, lineHeight: 14 },
  doneButton: { minHeight: 42, borderRadius: 13, backgroundColor: "#9D7E9E", borderWidth: 1, borderColor: "rgba(255,255,255,0.64)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 13, shadowColor: "#604F67", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  doneText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});
