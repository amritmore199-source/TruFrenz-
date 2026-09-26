import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import {
  PLAN_KIND_LABEL,
  canCheckIn,
  planTiming,
  type PlanCard,
  type PlanResponse,
} from "@/lib/plan-cards";

type Props = {
  card: PlanCard;
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
export function PlanCardView({ card, viewer, friendName, onRespond, onCheckIn, onCopyLink }: Props) {
  const { glassOpacity } = useAppAppearance();
  const timing = planTiming(card);
  const label = PLAN_KIND_LABEL[card.kind];
  const mine = card.proposedBy === "me";
  const canRespond = !mine && card.status === "proposed" && viewer === "them";
  const showCheckIn = canCheckIn(card);
  const checkedIn = Boolean(card.checkedInAt);
  const first = friendName.split(" ")[0] || friendName;

  const accent = card.kind === "meetup" ? "#9A7796" : "#7C94A5";
  const accentSoft = card.kind === "meetup" ? "rgba(246,238,247,0.9)" : "rgba(238,244,248,0.9)";

  return (
    <View
      accessibilityLabel={`${label} card, ${timing.label}, ${card.proposal.time} at ${card.proposal.place}, ${card.status}`}
      style={[styles.card, { backgroundColor: glassSurfaceColor("rgba(255,255,255,0.9)", glassOpacity) }]}
    >
      <View style={styles.topRow}>
        <View style={[styles.kindPill, { backgroundColor: accentSoft }]}>
          <MaterialIcons name={card.kind === "meetup" ? "event-available" : "local-cafe"} size={13} color={accent} />
          <Text style={[styles.kindText, { color: accent }]}>{label}</Text>
        </View>
        <View style={styles.timingPill}>
          <Text style={[styles.timingText, timing.emphasis === "today" && styles.timingToday]}>{timing.label}</Text>
        </View>
      </View>

      <Text style={styles.title}>{card.title}</Text>

      <View style={styles.detailRow}>
        <MaterialIcons name="schedule" size={14} color="#8A7F92" />
        <Text style={styles.detailText}>{card.proposal.date} · {card.proposal.time}</Text>
      </View>
      <View style={styles.detailRow}>
        <MaterialIcons name="place" size={14} color="#8A7F92" />
        <Text style={styles.detailText} numberOfLines={1}>{card.proposal.place}{card.proposal.area ? ` · ${card.proposal.area}` : ""}</Text>
      </View>
      <View style={styles.detailRow}>
        <MaterialIcons name="person-outline" size={14} color="#8A7F92" />
        <Text style={styles.detailText}>{mine ? "You suggested this" : `${first} suggested this`}</Text>
      </View>

      {card.status === "accepted" ? (
        <View style={styles.stateRow}>
          <MaterialIcons name="check-circle" size={14} color="#5E947B" />
          <Text style={styles.stateText}>{card.kind === "meetup" ? "Meetup confirmed" : "Hangout confirmed"} · you&apos;ll both get a reminder{timing.emphasis === "today" ? " today" : ""}.</Text>
        </View>
      ) : null}
      {card.status === "declined" ? (
        <View style={styles.stateRow}>
          <MaterialIcons name="info-outline" size={14} color="#9A8F9E" />
          <Text style={styles.stateText}>{card.declineReason ?? "They can't make it this time."} No reply is expected — try another day whenever you like.</Text>
        </View>
      ) : null}
      {card.status === "rescheduled" ? (
        <View style={styles.stateRow}>
          <MaterialIcons name="update" size={14} color="#9A7796" />
          <Text style={styles.stateText}>New time suggested. {mine ? `${first} proposed the change` : "You proposed the change"}.</Text>
        </View>
      ) : null}
      {checkedIn ? (
        <View style={styles.stateRow}>
          <MaterialIcons name="where-to-vote" size={14} color="#5E947B" />
          <Text style={styles.stateText}>You checked in on arrival. Your trusted contact was not notified automatically.</Text>
        </View>
      ) : null}

      {canRespond ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${label.toLowerCase()}`} onPress={() => onRespond("accept")} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
            <MaterialIcons name="check" size={15} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Accept</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Propose a new time for this ${label.toLowerCase()}`} onPress={() => onRespond("propose-new-time")} style={({ pressed }) => [styles.ghostAction, pressed && styles.pressed]}>
            <Text style={styles.ghostActionText}>New time</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Decline this ${label.toLowerCase()}`} onPress={() => onRespond("decline")} style={({ pressed }) => [styles.ghostAction, pressed && styles.pressed]}>
            <Text style={styles.ghostActionText}>Decline</Text>
          </Pressable>
        </View>
      ) : null}

      {showCheckIn ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Check in on arrival" onPress={onCheckIn} style={({ pressed }) => [styles.checkInAction, pressed && styles.pressed]}>
          <MaterialIcons name="where-to-vote" size={15} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Check In on Arrival</Text>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel={`Copy the ${label.toLowerCase()} link`} onPress={onCopyLink} style={styles.linkRow}>
        <MaterialIcons name="link" size={13} color="#8E8595" />
        <Text style={styles.linkText} numberOfLines={1}>{card.link}</Text>
        <Text style={styles.linkAction}>Copy</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", paddingHorizontal: 12, paddingVertical: 11, gap: 6, shadowColor: "#7A6E80", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kindPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  kindText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  timingPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(244,240,246,0.86)" },
  timingText: { color: "#7C7286", fontSize: 9, fontWeight: "700" },
  timingToday: { color: "#A2568B" },
  title: { color: "#4E4856", fontSize: 12, fontWeight: "700", marginTop: 2 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { flex: 1, color: "#6E6672", fontSize: 10, fontWeight: "600" },
  stateRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "rgba(246,242,247,0.82)" },
  stateText: { flex: 1, color: "#6E6672", fontSize: 9.5, lineHeight: 14 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  primaryAction: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#9D7E9E", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  primaryActionText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  ghostAction: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.94)", backgroundColor: "rgba(255,255,255,0.66)" },
  ghostActionText: { color: "#7C7286", fontSize: 10, fontWeight: "650" as any },
  checkInAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, borderRadius: 12, paddingVertical: 9, backgroundColor: "#6E9C86", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  linkText: { flex: 1, color: "#8E8595", fontSize: 8.5 },
  linkAction: { color: "#9A7796", fontSize: 9, fontWeight: "700" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
