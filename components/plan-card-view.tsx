import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { glassNestedFill } from "@/lib/appearance-preferences";
import { GlassSurface } from "@/components/glass-surface";
import { CHAT_NIGHT } from "@/lib/chat-appearance";
import {
  PLAN_KIND_LABEL,
  canCheckIn,
  planTiming,
  type PlanCard,
  type PlanResponse,
} from "@/lib/plan-cards";

type Props = {
  card: PlanCard;
  nightMode?: boolean;
  /** Who is looking at the card; only the recipient may respond. */
  viewer: "me" | "them";
  friendName: string;
  onRespond: (response: PlanResponse) => void;
  onCheckIn: () => void;
  onCopyLink: () => void;
};

/**
 * A plan is a card rather than a bubble: it carries the proposed time and
 * place, the response controls, and a confirmed state with a day-of check-in.
 */
export function PlanCardView({ card, viewer, friendName, onRespond, onCheckIn, onCopyLink, nightMode = false }: Props) {
  const timing = planTiming(card);
  const label = PLAN_KIND_LABEL[card.kind];
  const mine = card.proposedBy === "me";
  const canRespond = !mine && card.status === "proposed" && viewer === "them";
  const showCheckIn = canCheckIn(card);
  const checkedIn = Boolean(card.checkedInAt);
  const first = friendName.split(" ")[0] || friendName;

  const accent = card.kind === "meetup" ? "#666666" : "#919191";
  const accentSoft = card.kind === "meetup" ? "rgba(0, 0, 0, 0.16)" : glassNestedFill("rgba(0, 0, 0, 0.16)");

  return (
    <GlassSurface
      surface="floater"
      radius={18}
      fill={nightMode ? CHAT_NIGHT.controlSurface : undefined}
      style={[styles.card, nightMode && styles.cardNight]}
    >
      <View style={styles.topRow}>
        <View style={[styles.kindPill, { backgroundColor: accentSoft }]}>
          <MaterialIcons name={card.kind === "meetup" ? "event-available" : "local-cafe"} size={13} color={accent} />
          <Text style={[styles.kindText, { color: accent }]}>{label}</Text>
        </View>
        <View style={styles.timingPill}>
          <Text style={[styles.timingText, nightMode && styles.lightText, !nightMode && timing.emphasis === "today" && styles.timingToday]}>{timing.label}</Text>
        </View>
      </View>

      <Text style={[styles.title, nightMode && styles.lightText]}>{card.title}</Text>

      <View style={styles.detailRow}>
        <MaterialIcons name="schedule" size={14} color={nightMode ? CHAT_NIGHT.accentText : "#666666"} />
        <Text style={[styles.detailText, nightMode && styles.lightSecondaryText]}>{card.proposal.date} · {card.proposal.time}</Text>
      </View>
      <View style={styles.detailRow}>
        <MaterialIcons name="place" size={14} color={nightMode ? CHAT_NIGHT.accentText : "#666666"} />
        <Text style={[styles.detailText, nightMode && styles.lightSecondaryText]} numberOfLines={1}>{card.proposal.place}{card.proposal.area ? ` · ${card.proposal.area}` : ""}</Text>
      </View>
      <View style={styles.detailRow}>
        <MaterialIcons name="person-outline" size={14} color={nightMode ? CHAT_NIGHT.accentText : "#666666"} />
        <Text style={[styles.detailText, nightMode && styles.lightSecondaryText]}>{mine ? "You suggested this" : `${first} suggested this`}</Text>
      </View>

      {card.status === "accepted" ? (
        <View style={[styles.stateRow, nightMode && styles.stateRowNight]}>
          <MaterialIcons name="check-circle" size={14} color="#D5D5D5" />
          <Text style={[styles.stateText, nightMode && styles.lightSecondaryText]}>{card.kind === "meetup" ? "Meetup confirmed" : "Hangout confirmed"} · you&apos;ll both get a reminder{timing.emphasis === "today" ? " today" : ""}.</Text>
        </View>
      ) : null}
      {card.status === "declined" ? (
        <View style={[styles.stateRow, nightMode && styles.stateRowNight]}>
          <MaterialIcons name="info-outline" size={14} color="#CED7DD" />
          <Text style={[styles.stateText, nightMode && styles.lightSecondaryText]}>{card.declineReason ?? "They can't make it this time."} No reply is expected — try another day whenever you like.</Text>
        </View>
      ) : null}
      {card.status === "rescheduled" ? (
        <View style={[styles.stateRow, nightMode && styles.stateRowNight]}>
          <MaterialIcons name="update" size={14} color={nightMode ? CHAT_NIGHT.accentText : "#666666"} />
          <Text style={[styles.stateText, nightMode && styles.lightSecondaryText]}>New time suggested. {mine ? `${first} proposed the change` : "You proposed the change"}.</Text>
        </View>
      ) : null}
      {checkedIn ? (
        <View style={[styles.stateRow, nightMode && styles.stateRowNight]}>
          <MaterialIcons name="where-to-vote" size={14} color="#D5D5D5" />
          <Text style={[styles.stateText, nightMode && styles.lightSecondaryText]}>You checked in on arrival. Your trusted contact was not notified automatically.</Text>
        </View>
      ) : null}

      {canRespond ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${label.toLowerCase()}`} onPress={() => onRespond("accept")} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
            <MaterialIcons name="check" size={15} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Accept</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Propose a new time for this ${label.toLowerCase()}`} onPress={() => onRespond("propose-new-time")} style={({ pressed }) => [styles.ghostAction, nightMode && styles.ghostActionNight, pressed && styles.pressed]}>
            <Text style={[styles.ghostActionText, nightMode && styles.lightText]}>New time</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Decline this ${label.toLowerCase()}`} onPress={() => onRespond("decline")} style={({ pressed }) => [styles.ghostAction, nightMode && styles.ghostActionNight, pressed && styles.pressed]}>
            <Text style={[styles.ghostActionText, nightMode && styles.lightText]}>Decline</Text>
          </Pressable>
        </View>
      ) : null}

      {showCheckIn ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Check in on arrival" onPress={onCheckIn} style={({ pressed }) => [styles.checkInAction, pressed && styles.pressed]}>
          <MaterialIcons name="where-to-vote" size={15} color="#FFFFFF" />
          <Text style={styles.checkInActionText}>Check In on Arrival</Text>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel={`Copy the ${label.toLowerCase()} link`} onPress={onCopyLink} style={styles.linkRow}>
        <MaterialIcons name="link" size={13} color={nightMode ? CHAT_NIGHT.secondaryText : "#DFE6EB"} />
        <Text style={[styles.linkText, nightMode && styles.lightSecondaryText]} numberOfLines={1}>{card.link}</Text>
        <Text style={[styles.linkAction, nightMode && styles.accentText]}>Copy</Text>
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), paddingHorizontal: 12, paddingVertical: 11, gap: 6, shadowColor: "#DCE5EC", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardNight: { borderColor: CHAT_NIGHT.border },
  lightText: { color: CHAT_NIGHT.primaryText },
  lightSecondaryText: { color: CHAT_NIGHT.secondaryText },
  accentText: { color: CHAT_NIGHT.accentText },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kindPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  kindText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  timingPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(0, 0, 0, 0.16)" },
  timingText: { color: "#B8B8B8", fontSize: 12, fontWeight: "700" },
  timingToday: { color: "#DFE8EF" },
  title: { color: "#EEF8FF", fontSize: 12.5, fontWeight: "700", marginTop: 2 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { flex: 1, color: "#E6EFF7", fontSize: 12, fontWeight: "600" },
  stateRowNight: { backgroundColor: CHAT_NIGHT.markerSurface, borderWidth: 1, borderColor: CHAT_NIGHT.border },
  stateRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "rgba(0, 0, 0, 0.16)" },
  stateText: { flex: 1, color: "#E6EFF7", fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  primaryAction: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#666666", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.19)") },
  primaryActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  checkInActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  ghostActionNight: { borderColor: CHAT_NIGHT.border, backgroundColor: CHAT_NIGHT.controlSurface },
  ghostAction: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.18)") },
  ghostActionText: { color: "#B8B8B8", fontSize: 12, fontWeight: "650" as any },
  checkInAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, borderRadius: 12, paddingVertical: 9, backgroundColor: "#597E6D", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.19)") },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  linkText: { flex: 1, color: "#E6EFF7", fontSize: 12 },
  linkAction: { color: "#B8B8B8", fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
