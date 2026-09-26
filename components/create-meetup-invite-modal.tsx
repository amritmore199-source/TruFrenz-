import React, { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { buildMeetupInviteDraft, publicMeetupVenues, type MeetupInviteDraft, type PublicMeetupVenue } from "@/lib/meetup-invite";
import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";

const timeOptions = ["Tomorrow · 10:30 AM", "Saturday · 2:00 PM", "Sunday · 11:00 AM"];
type MeetupContact = { id: string; name: string };

export function CreateMeetupInviteModal({ visible, onClose, onShare, contacts, initialContactId }: { visible: boolean; onClose: () => void; onShare: (draft: MeetupInviteDraft, contactId: string) => void; contacts: readonly MeetupContact[]; initialContactId?: string | null }) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [title, setTitle] = useState("Coffee and a slow start");
  const [venueId, setVenueId] = useState(publicMeetupVenues[0].id);
  const [when, setWhen] = useState(timeOptions[0]);
  const [contactId, setContactId] = useState(initialContactId ?? contacts[0]?.id ?? "");
  const [error, setError] = useState("");
  const venue = useMemo(() => publicMeetupVenues.find((item) => item.id === venueId) ?? publicMeetupVenues[0], [venueId]);
  const draft = buildMeetupInviteDraft(title, venue, when);

  useEffect(() => {
    if (visible) {
      setTitle("Coffee and a slow start");
      setVenueId(publicMeetupVenues[0].id);
      setWhen(timeOptions[0]);
      setContactId(initialContactId && contacts.some((contact) => contact.id === initialContactId) ? initialContactId : contacts[0]?.id ?? "");
      setError("");
    }
  }, [visible, initialContactId, contacts]);

  const share = () => {
    const nextDraft = buildMeetupInviteDraft(title, venue, when);
    if (!nextDraft || !contacts.some((contact) => contact.id === contactId)) {
      setError(!nextDraft ? "Add a plan name before sharing your invite." : "Choose an accepted friend to receive this invite.");
      return;
    }
    setError("");
    onShare(nextDraft, contactId);
  };

  const renderVenue = ({ item }: { item: PublicMeetupVenue }) => {
    const selected = item.id === venueId;
    return (
      <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setVenueId(item.id)} style={({ pressed }) => [styles.venueRow, selected && styles.venueSelected, pressed && styles.pressed]}>
        <View style={[styles.venueIcon, selected && styles.venueIconSelected]}><MaterialIcons name={item.icon} size={18} color={selected ? "#8E7090" : "#7E94A2"} /></View>
        <View style={styles.venueCopy}><Text style={styles.venueName}>{item.name}</Text><Text style={styles.venueMeta}>{item.neighborhood} · {item.note}</Text></View>
        <MaterialIcons name={selected ? "radio-button-checked" : "radio-button-unchecked"} size={18} color={selected ? "#A17FA1" : "#C2BAC6"} />
      </Pressable>
    );
  };

  const footer = (
    <View style={styles.listFooter}>
      <Text style={styles.sectionLabel}>WHEN WORKS FOR YOU?</Text>
      <View style={styles.timeOptions}>{timeOptions.map((item) => <Pressable key={item} onPress={() => setWhen(item)} style={[styles.timeChip, when === item && styles.timeChipSelected]}><Text style={[styles.timeText, when === item && styles.timeTextSelected]}>{item}</Text></Pressable>)}</View>
      <View style={styles.previewCard}>
        <View style={styles.previewHeader}><MaterialIcons name="event-available" size={15} color="#9A7899" /><Text style={styles.previewEyebrow}>INVITE PREVIEW</Text></View>
        <Text style={styles.previewTitle}>{draft?.title || "Your plan"}</Text>
        <Text style={styles.previewDetails}>{venue.name} · {venue.neighborhood}</Text>
        <Text style={styles.previewDetails}>{when}</Text>
        <Text style={styles.previewNote}>Only {contacts.find((contact) => contact.id === contactId)?.name ?? "your selected friend"} will see it. No device location is used.</Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      <Pressable onPress={share} accessibilityRole="button" style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}><Text style={styles.shareText}>Share invite in this chat</Text><MaterialIcons name="send" size={15} color="#FFFFFF" /></Pressable>
      <Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Not now</Text></Pressable>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}>
        <BlurView intensity={38} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFillObject} />
        <Pressable accessibilityLabel="Close meetup invite" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.keyboard, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight }]}>
            <View style={[styles.sheet, { maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor("rgba(250,248,250,0.93)", glassOpacity) }]}>
              <View style={styles.header}>
                <View style={styles.handle} />
                <View style={styles.headerRow}><View><Text style={styles.headerEyebrow}>A SMALL, FRIENDLY PLAN</Text><Text style={styles.headerTitle}>Create Meetup Invite</Text></View><Pressable accessibilityLabel="Close meetup invite" onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={19} color="#786E7F" /></Pressable></View>
              </View>
              <FlatList
                data={publicMeetupVenues as PublicMeetupVenue[]}
                keyExtractor={(item) => item.id}
                renderItem={renderVenue}
                style={styles.inviteList}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={<View style={styles.listHeader}><Text style={styles.sectionLabel}>SHARE WITH</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactOptions}>{contacts.map((contact) => { const selected = contact.id === contactId; return <Pressable key={contact.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setContactId(contact.id)} style={[styles.contactChip, selected && styles.contactChipSelected]}><MaterialIcons name="person" size={13} color={selected ? "#876B8A" : "#9A919E"} /><Text style={[styles.contactText, selected && styles.contactTextSelected]}>{contact.name}</Text></Pressable>; })}</ScrollView><Text style={[styles.sectionLabel, styles.titleHeading]}>WHAT ARE YOU PLANNING?</Text><TextInput value={title} onChangeText={setTitle} placeholder="Coffee and a slow start" placeholderTextColor="#A7A0AA" style={styles.titleInput} maxLength={60} returnKeyType="done"/><Text style={[styles.sectionLabel, styles.placeHeading]}>CHOOSE A PUBLIC PLACE</Text><Text style={styles.helperText}>A familiar place, picked by you. No live location access.</Text></View>}
                ListFooterComponent={footer}
              />
            </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(53,45,62,0.22)" },
  keyboard: { flexShrink: 1 },
  sheet: { flexShrink: 1, width: "100%", overflow: "hidden", borderRadius: 25, borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", backgroundColor: "rgba(250,248,250,0.93)", shadowColor: "#514659", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 18 },
  header: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(220,213,224,0.55)" },
  handle: { width: 34, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: "rgba(137,125,142,0.38)", marginBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerEyebrow: { color: "#A0819B", fontSize: 7, letterSpacing: 1, fontWeight: "700" },
  headerTitle: { color: "#4E4755", fontSize: 18, fontWeight: "700", marginTop: 3 },
  closeButton: { width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.84)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#716579", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  inviteList: { flexGrow: 1, flexShrink: 1 },
  listContent: { paddingHorizontal: 17, paddingBottom: 12 },
  listHeader: { paddingTop: 14, paddingBottom: 9 },
  sectionLabel: { color: "#A093A1", fontSize: 7, fontWeight: "700", letterSpacing: 0.9 },
  contactOptions: { flexDirection: "row", gap: 6, paddingVertical: 7 },
  contactChip: { minHeight: 29, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, backgroundColor: "rgba(255,255,255,0.76)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#786A80", shadowOpacity: 0.045, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  contactChipSelected: { backgroundColor: "#F0E5F0", borderColor: "#E1CFE3" },
  contactText: { color: "#8D8592", fontSize: 7 },
  contactTextSelected: { color: "#866A8A", fontWeight: "700" },
  titleHeading: { marginTop: 3 },
  titleInput: { minHeight: 42, marginTop: 6, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: "rgba(220,211,222,0.82)", backgroundColor: "rgba(255,255,255,0.78)", color: "#514A56", fontSize: 11, outlineStyle: "none" as any },
  placeHeading: { marginTop: 13 },
  helperText: { color: "#958C99", fontSize: 8, marginTop: 3 },
  venueRow: { minHeight: 53, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 8, borderRadius: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", backgroundColor: "rgba(255,255,255,0.72)", marginBottom: 5, shadowColor: "#786A80", shadowOpacity: 0.045, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  venueSelected: { borderColor: "#D9C6DB", backgroundColor: "rgba(244,235,245,0.89)" },
  venueIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF1F5" },
  venueIconSelected: { backgroundColor: "#F0E3F0" },
  venueCopy: { flex: 1, gap: 2 },
  venueName: { color: "#5A5260", fontSize: 9, fontWeight: "700" },
  venueMeta: { color: "#958D99", fontSize: 7 },
  listFooter: { paddingTop: 8 },
  timeOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  timeChip: { minHeight: 29, justifyContent: "center", borderRadius: 10, paddingHorizontal: 8, backgroundColor: "rgba(255,255,255,0.76)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#786A80", shadowOpacity: 0.045, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  timeChipSelected: { backgroundColor: "#F0E5F0", borderColor: "#E1CFE3" },
  timeText: { color: "#8D8592", fontSize: 7 },
  timeTextSelected: { color: "#866A8A", fontWeight: "700" },
  previewCard: { padding: 10, borderRadius: 14, marginTop: 11, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.97)" },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  previewEyebrow: { color: "#A0849E", fontSize: 7, fontWeight: "700", letterSpacing: 0.7 },
  previewTitle: { color: "#564E5B", fontSize: 10, fontWeight: "700", marginTop: 5 },
  previewDetails: { color: "#8E8592", fontSize: 8, marginTop: 3 },
  previewNote: { color: "#9D96A1", fontSize: 7, marginTop: 6 },
  errorText: { color: "#A9677A", fontSize: 8, marginTop: 6 },
  shareButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13, backgroundColor: "#9D7D9E", borderWidth: 1, borderColor: "rgba(255,255,255,0.68)", marginTop: 10, shadowColor: "#604F67", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  shareText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  cancelButton: { minHeight: 32, alignItems: "center", justifyContent: "center" },
  cancelText: { color: "#938995", fontSize: 8 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
