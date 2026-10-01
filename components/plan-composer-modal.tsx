import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { PLAN_KIND_LABEL, venuesForKind, type PlanKind, type PlanProposal } from "@/lib/plan-cards";

const TIME_CHOICES: readonly string[] = ["9:00 AM", "11:30 AM", "1:00 PM", "4:30 PM", "6:30 PM", "8:00 PM"];

type Props = {
  visible: boolean;
  /** Which card type the member opened; hangouts are the lighter option. */
  initialKind: PlanKind;
  friendName: string;
  /**
   * The soft upgrade hint for the free proposal limit. Rendered by the app so
   * the composer stays unaware of plans and pricing.
   */
  nudge?: React.ReactNode;
  onClose: () => void;
  onShare: (kind: PlanKind, proposal: PlanProposal, note: string) => void;
};

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Compose a structured Hangout or Meetup card and share it into the chat. */
export function PlanComposerModal({ visible, initialKind, friendName, nudge, onClose, onShare }: Props) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [kind, setKind] = useState<PlanKind>(initialKind);
  const [dayOffset, setDayOffset] = useState(1);
  const [time, setTime] = useState("4:30 PM");
  const [venueName, setVenueName] = useState<string>("");
  const [note, setNote] = useState("");

  const venues = useMemo(() => venuesForKind(kind), [kind]);
  const first = friendName.split(" ")[0] || friendName;

  useEffect(() => {
    if (visible) {
      setKind(initialKind);
      setDayOffset(initialKind === "meetup" ? 3 : 1);
      setTime(initialKind === "meetup" ? "6:30 PM" : "4:30 PM");
      setNote("");
    }
  }, [visible, initialKind]);

  useEffect(() => {
    if (!venues.some((venue) => venue.name === venueName)) setVenueName(venues[0]?.name ?? "");
  }, [venues, venueName]);

  const venue = venues.find((item) => item.name === venueName) ?? venues[0];

  const share = () => {
    if (!venue) return;
    onShare(kind, { date: isoDaysFromNow(dayOffset), time, place: venue.name, area: venue.area }, note);
    setNote("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <View style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}>
        <BlurView intensity={28} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
          <BlurView intensity={34} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.sheet, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.9)"), glassOpacity) }]}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.topLine}>
                <View style={styles.headingIcon}><MaterialIcons name="event-available" size={18} color="#83721f" /></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close plan composer" onPress={onClose} style={({ pressed }) => [styles.roundAction, pressed && styles.pressed]}>
                  <MaterialIcons name="close" size={18} color="#726e59" />
                </Pressable>
              </View>

              <Text style={styles.title}>Suggest something with {first}</Text>
              <Text style={styles.subtitle}>It arrives as a card, not a wall of text. {first} can accept, decline, or offer another time.</Text>

              <Text style={styles.sectionLabel}>TYPE</Text>
              <View style={styles.chipWrap}>
                {(["hangout", "meetup"] as PlanKind[]).map((option) => (
                  <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: kind === option }} accessibilityLabel={PLAN_KIND_LABEL[option]} onPress={() => setKind(option)} style={[styles.chip, kind === option && styles.chipActive]}>
                    <MaterialIcons name={option === "meetup" ? "event-available" : "local-cafe"} size={13} color={kind === option ? "#FFFFFF" : "#83721f"} />
                    <Text style={[styles.chipText, kind === option && styles.chipTextActive]}>{PLAN_KIND_LABEL[option]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>DAY</Text>
              <View style={styles.chipWrap}>
                {[0, 1, 2, 3, 5, 7].map((offset) => (
                  <Pressable key={offset} accessibilityRole="radio" accessibilityState={{ selected: dayOffset === offset }} accessibilityLabel={`Day ${dayLabel(offset)}`} onPress={() => setDayOffset(offset)} style={[styles.chip, dayOffset === offset && styles.chipActive]}>
                    <Text style={[styles.chipText, dayOffset === offset && styles.chipTextActive]}>{offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : dayLabel(offset)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>TIME</Text>
              <View style={styles.chipWrap}>
                {TIME_CHOICES.map((choice) => (
                  <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ selected: time === choice }} accessibilityLabel={`Time ${choice}`} onPress={() => setTime(choice)} style={[styles.chip, time === choice && styles.chipActive]}>
                    <Text style={[styles.chipText, time === choice && styles.chipTextActive]}>{choice}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>PLACE · PUBLIC VENUES ONLY</Text>
              <View style={styles.chipWrap}>
                {venues.map((item) => (
                  <Pressable key={item.name} accessibilityRole="radio" accessibilityState={{ selected: venue?.name === item.name }} accessibilityLabel={`Venue ${item.name} in ${item.area}`} onPress={() => setVenueName(item.name)} style={[styles.chip, venue?.name === item.name && styles.chipActive]}>
                    <MaterialIcons name="place" size={12} color={venue?.name === item.name ? "#FFFFFF" : "#83721f"} />
                    <Text style={[styles.chipText, venue?.name === item.name && styles.chipTextActive]}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.mapRow}>
                <MaterialIcons name="map" size={14} color="#83721f" />
                <Text style={styles.mapText}>Pinned from the venue picker · {venue?.area ?? "Nearby"} · exact addresses are never shared</Text>
              </View>

              <Text style={styles.sectionLabel}>A SHORT NOTE · OPTIONAL</Text>
              <TextInput
                value={note}
                onChangeText={(value) => setNote(value.slice(0, 90))}
                placeholder={kind === "meetup" ? "Bring your sketchbook if you like." : "No pressure either way."}
                placeholderTextColor="#a7a6a1"
                style={styles.input}
                maxLength={90}
                returnKeyType="done"
              />

              {nudge}
              <Pressable accessibilityRole="button" accessibilityLabel={`Share this ${PLAN_KIND_LABEL[kind].toLowerCase()} card`} onPress={share} style={({ pressed }) => [styles.share, pressed && styles.pressed]}>
                <MaterialIcons name="send" size={16} color="#4A4210" />
                <Text style={styles.shareText}>Share {PLAN_KIND_LABEL[kind].toLowerCase()} card</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel plan" onPress={onClose} style={styles.cancel}>
                <Text style={styles.cancelText}>Not now</Text>
              </Pressable>
            </ScrollView>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(57, 53, 32, 0.24)" },
  sheet: { borderRadius: 24, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.9)"), overflow: "hidden", shadowColor: "#58543e", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  scroll: { flexGrow: 0 },
  content: { padding: 15, paddingBottom: 18 },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headingIcon: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(247, 241, 214, 0.92)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  roundAction: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.7)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  title: { color: "#43423d", fontSize: 14, fontWeight: "700", marginTop: 11 },
  subtitle: { color: "#5F5D57", fontSize: 10, lineHeight: 15, marginTop: 5 },
  sectionLabel: { color: "#5F5D57", fontSize: 8.5, fontWeight: "700", letterSpacing: 0.9, marginTop: 13 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"), backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.66)"), paddingHorizontal: 10, paddingVertical: 7, shadowColor: "#75726a", shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  chipActive: { backgroundColor: "#F1DE55", borderColor: glassNestedFill("rgba(255, 255, 255, 0.7)") },
  chipText: { color: "#5F5D57", fontSize: 10, fontWeight: "650" as any },
  chipTextActive: { color: "#43423d" },
  mapRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "rgba(245, 242, 223, 0.8)" },
  mapText: { flex: 1, color: "#83721f", fontSize: 9, fontWeight: "600" },
  input: { marginTop: 7, minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), paddingHorizontal: 12, paddingVertical: 9, color: "#53514C", fontSize: 11, outlineStyle: "none" as any },
  share: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 15, borderRadius: 15, paddingVertical: 12, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), shadowColor: "#5c5634", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  shareText: { color: "#4A4210", fontSize: 11, fontWeight: "700" },
  cancel: { alignItems: "center", paddingVertical: 11, marginTop: 2 },
  cancelText: { color: "#5F5D57", fontSize: 10, fontWeight: "600" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
