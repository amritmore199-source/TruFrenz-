import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import {
  actionLabel,
  availableViewerActions,
  formatDistance,
  orderInterestsByShared,
  sharedInterestSentence,
  type DistanceTier,
  type ViewerAction,
  type ViewerRelationship,
} from "@/lib/profile-details";

export type FriendProfileDetails = {
  id: string;
  name: string;
  age: number;
  locality: string;
  interests: string[];
  image: ImageSourcePropType;
  /** Extra gallery photos shown after the primary one; may be empty. */
  gallery?: { id: string; uri: string }[];
  verification: string;
  about: string;
  languages?: string[];
  lookingFor?: string[];
  /** Distance in km, only rendered for paid viewers. */
  distanceKm?: number | null;
  /** True when the profile owner hides their exact locality. */
  hidesExactLocality?: boolean;
};

export type FriendProfileActions = {
  onChat: () => void;
  onHangout: () => void;
  onMeetup: () => void;
  onCall: () => void;
  onAskFriendship: () => void;
  onAcceptRequest: () => void;
  onReport: () => void;
  onBlock: () => void;
};

type Props = {
  visible: boolean;
  profile: FriendProfileDetails | null;
  relationship: ViewerRelationship;
  viewerTier: DistanceTier;
  viewerCanRequestFriendship: boolean;
  /** Ids of friends the viewer already shares, used for the mutual line. */
  myInterests: string[];
  actions: FriendProfileActions;
  onClose: () => void;
};

const ACTION_ICONS: Record<ViewerAction, keyof typeof MaterialIcons.glyphMap> = {
  "ask-friendship": "person-add",
  "accept-request": "check",
  chat: "forum",
  hangout: "local-cafe",
  meetup: "event-available",
  call: "call",
  report: "flag",
  block: "block",
  unblock: "lock-open",
};

export function FriendProfileModal({ visible, profile, relationship, viewerTier, viewerCanRequestFriendship, myInterests, actions, onClose }: Props) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const { width } = useWindowDimensions();
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (visible) setPhotoIndex(0);
  }, [visible, profile?.id]);

  const slides = useMemo(() => {
    if (!profile) return [] as { id: string; source: ImageSourcePropType }[];
    const extra = (profile.gallery ?? []).map((photo) => ({ id: photo.id, source: { uri: photo.uri } as ImageSourcePropType }));
    return [{ id: "primary", source: profile.image }, ...extra];
  }, [profile]);

  const slideWidth = galleryWidth > 0 ? galleryWidth : Math.min(width, modalLayout.maxWidth);

  if (!profile) return null;

  const verified = profile.verification === "ID + selfie verified";
  const { shared, other } = orderInterestsByShared(profile.interests, myInterests);
  const mutualLine = sharedInterestSentence(shared);
  const distance = formatDistance(profile.distanceKm ?? null, viewerTier, profile.hidesExactLocality ?? true);
  const viewerActions = availableViewerActions({ relationship, viewerCanRequestFriendship, paidTierActive: viewerTier === "paid" });

  const handleAction = (action: ViewerAction) => {
    if (action === "ask-friendship") return actions.onAskFriendship();
    if (action === "accept-request") return actions.onAcceptRequest();
    if (action === "chat") return actions.onChat();
    if (action === "hangout") return actions.onHangout();
    if (action === "meetup") return actions.onMeetup();
    if (action === "call") return actions.onCall();
    if (action === "report") return actions.onReport();
    if (action === "block") return actions.onBlock();
    return actions.onBlock();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}>
        <BlurView intensity={36} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close profile" onPress={onClose} />
        <View style={[styles.sheet, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor("rgba(252,249,252,0.92)", glassOpacity) }]}>
          <BlurView intensity={40} tint="light" experimentalBlurMethod="dimezisBlurView" pointerEvents="none" style={StyleSheet.absoluteFill} />
          <View style={styles.header}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close profile">
              <MaterialIcons name="close" size={19} color="#746A7D" />
            </Pressable>
          </View>

          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.galleryFrame} onLayout={(event) => setGalleryWidth(Math.round(event.nativeEvent.layout.width))}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) => setPhotoIndex(Math.min(slides.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / Math.max(slideWidth, 1)))))}
                style={styles.gallery}
              >
                {slides.map((slide) => (
                  <View key={slide.id} style={[styles.gallerySlide, { width: slideWidth }]}>
                    <Image source={slide.source} style={styles.galleryImage} />
                  </View>
                ))}
              </ScrollView>
              {verified ? (
                <View style={styles.trustBadge} accessibilityLabel="ID and selfie verified">
                  <MaterialIcons name="check" size={13} color="#FFFFFF" />
                </View>
              ) : null}
              {slides.length > 1 ? (
                <View style={styles.counter}><Text style={styles.counterText}>{photoIndex + 1}/{slides.length}</Text></View>
              ) : null}
            </View>
            {slides.length > 1 ? (
              <View style={styles.dots}>
                {slides.map((slide, index) => (
                  <View key={slide.id} style={[styles.dot, index === photoIndex && styles.dotActive]} />
                ))}
              </View>
            ) : null}

            <View style={styles.identity}>
              <Text style={styles.name}>{profile.name}, {profile.age}</Text>
              <View style={[styles.badge, !verified && styles.phoneBadge]}>
                <MaterialIcons name={verified ? "verified-user" : "phone-iphone"} size={13} color={verified ? "#5E947B" : "#7B8D9C"} />
                <Text style={[styles.badgeText, !verified && styles.phoneText]}>{profile.verification}</Text>
              </View>
              <View style={styles.locality}>
                <MaterialIcons name="place" size={15} color="#958797" />
                <Text style={styles.localityText}>{profile.locality} · broad area only</Text>
              </View>
              {distance ? (
                <View style={styles.distanceRow}>
                  <MaterialIcons name="near-me" size={14} color="#8E7C93" />
                  <Text style={styles.distanceText}>{distance}</Text>
                </View>
              ) : null}
            </View>

            {mutualLine ? (
              <View style={styles.mutualCard}>
                <MaterialIcons name="auto-awesome" size={15} color="#9A7897" />
                <Text style={styles.mutualText}>{mutualLine}</Text>
              </View>
            ) : null}

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>A LITTLE ABOUT THEM</Text>
            <Text style={styles.about}>{profile.about}</Text>

            <Text style={styles.sectionLabel}>{shared.length ? "SHARED FIRST" : "THINGS YOU CAN TALK ABOUT"}</Text>
            <View style={styles.tags}>
              {shared.map((interest) => (
                <View key={`shared-${interest}`} style={[styles.tag, styles.tagShared]}>
                  <MaterialIcons name="favorite" size={12} color="#B080A8" />
                  <Text style={[styles.tagText, styles.tagTextShared]}>{interest}</Text>
                </View>
              ))}
              {other.map((interest) => (
                <View key={interest} style={styles.tag}>
                  <MaterialIcons name="auto-awesome" size={12} color="#9A7897" />
                  <Text style={styles.tagText}>{interest}</Text>
                </View>
              ))}
            </View>

            {profile.lookingFor?.length ? (
              <>
                <Text style={styles.sectionLabel}>LOOKING FOR</Text>
                <View style={styles.tags}>
                  {profile.lookingFor.map((item) => (
                    <View key={item} style={styles.lookingTag}><Text style={styles.lookingText}>{item}</Text></View>
                  ))}
                </View>
              </>
            ) : null}

            {profile.languages?.length ? (
              <>
                <Text style={styles.sectionLabel}>SPEAKS</Text>
                <View style={styles.tags}>
                  {profile.languages.map((item) => (
                    <View key={item} style={styles.languageTag}><MaterialIcons name="translate" size={12} color="#7C8E9A" /><Text style={styles.languageText}>{item}</Text></View>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.actionGrid}>
              {viewerActions.map((action) => (
                <Pressable key={action} onPress={() => handleAction(action)} accessibilityLabel={actionLabel(action)} style={({ pressed }) => [styles.actionButton, isDestructive(action) && styles.actionDanger, isPrimary(action) && styles.actionPrimary, pressed && styles.pressed]}>
                  <MaterialIcons name={ACTION_ICONS[action]} size={16} color={isPrimary(action) ? "#FFFFFF" : isDestructive(action) ? "#9C6E7B" : "#7C6C82"} />
                  <Text style={[styles.actionText, isPrimary(action) && styles.actionTextPrimary, isDestructive(action) && styles.actionTextDanger]}>{actionLabel(action)}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.safetyNote}>
              <MaterialIcons name="lock-outline" size={15} color="#7893A2" />
              <Text style={styles.safetyText}>
                {relationship === "accepted" ? "You’re already friends. Share only what feels comfortable." : "Chat opens only after you both accept. Declining is quiet."}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function isPrimary(action: ViewerAction): boolean {
  return action === "ask-friendship" || action === "accept-request" || action === "chat";
}

function isDestructive(action: ViewerAction): boolean {
  return action === "block" || action === "report";
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(80,66,87,0.20)" },
  sheet: { flexShrink: 1, overflow: "hidden", borderRadius: 25, borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#57465C", shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { padding: 16, paddingTop: 4 },
  header: { height: 30, alignItems: "center", justifyContent: "center" },
  handle: { width: 34, height: 4, borderRadius: 4, backgroundColor: "rgba(152,137,157,0.35)" },
  close: { position: "absolute", right: 11, top: 3, width: 31, height: 31, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", alignItems: "center", justifyContent: "center" },
  galleryFrame: { width: "100%", height: 208, borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(239,231,240,0.9)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)" },
  gallery: { width: "100%", height: "100%" },
  gallerySlide: { height: "100%" },
  galleryImage: { width: "100%", height: "100%" },
  trustBadge: { position: "absolute", right: 9, top: 9, width: 24, height: 24, borderRadius: 10, borderWidth: 2, borderColor: "rgba(252,249,252,0.96)", backgroundColor: "#D98BA6", alignItems: "center", justifyContent: "center", shadowColor: "#8A5E73", shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  counter: { position: "absolute", left: 9, top: 9, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(80,66,87,0.42)" },
  counterText: { color: "#FFFFFF", fontSize: 8.5, fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(150,135,155,0.38)" },
  dotActive: { backgroundColor: "#9D7E9E", width: 14 },
  identity: { alignItems: "center", paddingTop: 11, paddingBottom: 12 },
  name: { color: "#4B4551", fontSize: 18, fontWeight: "700", letterSpacing: -0.4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#EAF4EF", marginTop: 7 },
  phoneBadge: { backgroundColor: "#EDF1F4" },
  badgeText: { color: "#568C77", fontSize: 10, fontWeight: "600" },
  phoneText: { color: "#788B9A" },
  locality: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  localityText: { color: "#8F8792", fontSize: 10 },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: "rgba(240,233,243,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  distanceText: { color: "#83738A", fontSize: 9.5, fontWeight: "700" },
  mutualCard: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(243,233,244,0.9)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  mutualText: { flex: 1, color: "#7C6B82", fontSize: 10, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "rgba(220,212,222,0.65)", marginTop: 14, marginBottom: 12 },
  sectionLabel: { color: "#9B8B9B", fontSize: 8, fontWeight: "700", letterSpacing: 1, marginTop: 6 },
  about: { color: "#665F69", fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 9 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, backgroundColor: "rgba(243,233,244,0.91)", borderWidth: 1, borderColor: "rgba(255,255,255,0.93)", paddingHorizontal: 9, paddingVertical: 6 },
  tagShared: { backgroundColor: "rgba(247,229,240,0.95)", borderColor: "rgba(255,255,255,0.98)" },
  tagText: { color: "#8F7592", fontSize: 9, fontWeight: "500" },
  tagTextShared: { color: "#8A5E7E", fontWeight: "700" },
  lookingTag: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "rgba(232,241,246,0.85)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)" },
  lookingText: { color: "#6E8493", fontSize: 9, fontWeight: "600" },
  languageTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "rgba(236,240,243,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)" },
  languageText: { color: "#77838C", fontSize: 9, fontWeight: "600" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  actionButton: { flexGrow: 1, flexBasis: "46%", minHeight: 40, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", shadowColor: "#7A6F80", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  actionPrimary: { backgroundColor: "#9D7E9E", borderColor: "rgba(255,255,255,0.64)", shadowColor: "#604F67", shadowOpacity: 0.14 },
  actionDanger: { backgroundColor: "rgba(250,242,244,0.9)", borderColor: "rgba(244,229,234,0.98)" },
  actionText: { color: "#6E6474", fontSize: 10, fontWeight: "700" },
  actionTextPrimary: { color: "#FFFFFF" },
  actionTextDanger: { color: "#9C6E7B" },
  safetyNote: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, marginTop: 14, borderRadius: 13, backgroundColor: "rgba(232,241,246,0.73)" },
  safetyText: { flex: 1, color: "#7E8D98", fontSize: 9, lineHeight: 14 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});
