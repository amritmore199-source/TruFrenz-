import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { GlassBlur } from "@/components/glass-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassNestedSurfaceColor, glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import {
  actionLabel,
  availableViewerActions,
  formatDistance,
  orderInterestsByShared,
  sharedInterestSentence,
  statusLabel,
  visibleStatus,
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
  /** Short mood/status line shown beside the name; may be empty or stale. */
  status?: { text: string; emoji?: string; updatedAt: string } | null;
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
  const { glassOpacity, glassTint } = useAppAppearance();
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
  const viewerStatus = visibleStatus(profile.status);
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
        <GlassBlur intensity={28} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <GlassBlur intensity={58} style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close profile" onPress={onClose} />
        <View style={[styles.sheet, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(0, 0, 0, 0.16)"), glassOpacity) }]}>
          <GlassBlur intensity={64} pointerEvents="none" style={StyleSheet.absoluteFill} />
          <View style={styles.header}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close profile">
              <MaterialIcons name="close" size={19} color="#DEE8EF" />
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
              {viewerStatus ? (
                <View style={styles.statusChip}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusChipText} numberOfLines={1}>{statusLabel(viewerStatus)}</Text>
                </View>
              ) : null}
              <View style={[styles.badge, !verified && styles.phoneBadge]}>
                <MaterialIcons name={verified ? "verified-user" : "phone-iphone"} size={13} color={verified ? "#898989" : "#8B8B8B"} />
                <Text style={[styles.badgeText, !verified && styles.phoneText]}>{profile.verification}</Text>
              </View>
              <View style={styles.locality}>
                <MaterialIcons name="place" size={15} color="#CED7DE" />
                <Text style={styles.localityText}>{profile.locality} · broad area only</Text>
              </View>
              {distance ? (
                <View style={styles.distanceRow}>
                  <MaterialIcons name="near-me" size={14} color="#B8B8B8" />
                  <Text style={styles.distanceText}>{distance}</Text>
                </View>
              ) : null}
            </View>

            {mutualLine ? (
              <View style={styles.mutualCard}>
                <MaterialIcons name="auto-awesome" size={15} color="#B8B8B8" />
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
                  <MaterialIcons name="favorite" size={12} color="#B8B8B8" />
                  <Text style={[styles.tagText, styles.tagTextShared]}>{interest}</Text>
                </View>
              ))}
              {other.map((interest) => (
                <View key={interest} style={styles.tag}>
                  <MaterialIcons name="auto-awesome" size={12} color="#B8B8B8" />
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
                    <View key={item} style={styles.languageTag}><MaterialIcons name="translate" size={12} color="#CED7DD" /><Text style={styles.languageText}>{item}</Text></View>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.actionGrid}>
              {viewerActions.map((action) => (
                <Pressable key={action} onPress={() => handleAction(action)} accessibilityLabel={actionLabel(action)} style={({ pressed }) => [styles.actionButton, { backgroundColor: glassNestedSurfaceColor(isDestructive(action) ? "rgba(0, 0, 0, 0.16)" : "rgba(0, 0, 0, 0.17)", glassOpacity, glassTint), borderColor: glassNestedSurfaceColor("rgba(0, 0, 0, 0.16)", glassOpacity, glassTint) }, isPrimary(action) && styles.actionPrimary, pressed && styles.pressed]}>
                  <MaterialIcons name={ACTION_ICONS[action]} size={16} color={isPrimary(action) ? "#FFFFFF" : isDestructive(action) ? "#666666" : "#717171"} />
                  <Text style={[styles.actionText, isPrimary(action) && styles.actionTextPrimary, isDestructive(action) && styles.actionTextDanger]}>{actionLabel(action)}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.safetyNote}>
              <MaterialIcons name="lock-outline" size={15} color="#D5D5D5" />
              <Text style={styles.safetyText}>
                {/*
                  The notice has to match who asked whom. A request that arrived
                  is waiting on this member's answer, so telling them chat opens
                  "after you both accept" describes a step they do not take — and
                  makes the ask-for-friendship wording look correct when it is
                  the other way round.
                */}
                {relationship === "accepted"
                  ? "You’re already friends. Share only what feels comfortable."
                  : relationship === "request-received"
                    ? "They’ve asked to connect. Accept and the chat opens straight away."
                    : relationship === "request-sent"
                      ? "Your request is with them. Chat opens as soon as they accept."
                      : "Chat opens only after you both accept. Declining is quiet."}
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
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(77, 71, 43, 0.20)" },
  sheet: { flexShrink: 1, overflow: "hidden", borderRadius: 25, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), shadowColor: "#EBF5FD", shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { padding: 16, paddingTop: 4 },
  header: { height: 30, alignItems: "center", justifyContent: "center" },
  handle: { width: 34, height: 4, borderRadius: 4, backgroundColor: "rgba(131, 114, 31, 0.35)" },
  close: { position: "absolute", right: 11, top: 3, width: 31, height: 31, borderRadius: 12, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.22)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), alignItems: "center", justifyContent: "center" },
  galleryFrame: { width: "100%", height: 208, borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(0, 0, 0, 0.16)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  gallery: { width: "100%", height: "100%" },
  gallerySlide: { height: "100%" },
  galleryImage: { width: "100%", height: "100%" },
  trustBadge: { position: "absolute", right: 9, top: 9, width: 24, height: 24, borderRadius: 10, borderWidth: 2, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), backgroundColor: "#6B6B6B", alignItems: "center", justifyContent: "center", shadowColor: "#E0E9F1", shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  /*
   * The pill darkens whatever photo sits under it, so its label is white and
   * the pill is deep enough to hold it: a translucent brown at 0.42 over a
   * bright photo leaves dark ink at 2.4:1.
   */
  counter: { position: "absolute", left: 9, top: 9, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(40, 36, 20, 0.72)" },
  counterText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(131, 114, 31, 0.38)" },
  dotActive: { backgroundColor: "#666666", width: 14 },
  identity: { alignItems: "center", paddingTop: 11, paddingBottom: 12 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "center", marginTop: 7, maxWidth: 250, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(0, 0, 0, 0.16)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#6B6B6B" },
  statusChipText: { flexShrink: 1, color: "#E1EAF2", fontSize: 12, fontWeight: "650" as any },
  name: { color: "#ECF7FE", fontSize: 18, fontWeight: "700", letterSpacing: -0.4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#575C59", marginTop: 7 },
  phoneBadge: { backgroundColor: glassNestedFill("#EDF1F4") },
  badgeText: { color: "#E8E8E8", fontSize: 12, fontWeight: "600" },
  phoneText: { color: "#E2E2E2" },
  locality: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  localityText: { color: "#DFE9F0", fontSize: 12 },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: "rgba(0, 0, 0, 0.16)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  distanceText: { color: "#B8B8B8", fontSize: 12, fontWeight: "700" },
  mutualCard: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(0, 0, 0, 0.16)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  mutualText: { flex: 1, color: "#DFE9F0", fontSize: 12, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "rgba(255, 255, 255, 0.65)", marginTop: 14, marginBottom: 12 },
  sectionLabel: { color: "#E6EFF7", fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 6 },
  about: { color: "#E4EEF5", fontSize: 12.5, lineHeight: 18, marginTop: 6, marginBottom: 9 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, backgroundColor: "rgba(0, 0, 0, 0.16)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), paddingHorizontal: 9, paddingVertical: 6 },
  tagShared: { backgroundColor: "rgba(255, 255, 255, 0.95)", borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  tagText: { color: "#B8B8B8", fontSize: 12, fontWeight: "500" },
  tagTextShared: { color: "#DFE9F0", fontWeight: "700" },
  lookingTag: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  lookingText: { color: "#E0E0E0", fontSize: 12, fontWeight: "600" },
  languageTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  languageText: { color: "#DFE9F0", fontSize: 12, fontWeight: "600" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  // No backgroundColor on purpose: the fill is resolved at the render site through
  // glassNestedSurfaceColor. A hardcoded near-opaque white is exactly the patch the
  // member saw — it sits on a translucent sheet and hides the wallpaper instead of
  // tinting it, and it ignored their glass setting. The declared alpha is kept there
  // as an ordering below the sheet, so a button is always lighter than its panel.
  actionButton: { flexGrow: 1, flexBasis: "46%", minHeight: 40, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), shadowColor: "#DCE5EC", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  actionPrimary: { backgroundColor: "#666666", borderColor: glassNestedFill("rgba(0, 0, 0, 0.18)"), shadowColor: "#E8F2FA", shadowOpacity: 0.14 },
  actionText: { color: "#E6EFF7", fontSize: 12, fontWeight: "700" },
  actionTextPrimary: { color: "#EEF8FF" },
  actionTextDanger: { color: "#B8B8B8" },
  safetyNote: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, marginTop: 14, borderRadius: 13, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.17)") },
  safetyText: { flex: 1, color: "#DFE8F0", fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});
