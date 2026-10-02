import React, { useState } from "react";
import { GlassBlur } from "@/components/glass-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { QuickReply } from "@/lib/quick-replies";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";

export function QuickRepliesModal({
  visible,
  replies,
  onClose,
  onSelect,
  onAdd,
  onRemove,
}: {
  visible: boolean;
  replies: QuickReply[];
  onClose: () => void;
  onSelect: (text: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.shade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}>
        <GlassBlur intensity={28} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <GlassBlur intensity={34} style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close quick replies" onPress={onClose} />
        <Pressable style={[styles.sheet, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(0, 0, 0, 0.10)"), glassOpacity) }]} onPress={(event) => event.stopPropagation()}>
          <GlassBlur intensity={39} pointerEvents="none" style={StyleSheet.absoluteFill} glow />
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.headingIcon}><MaterialIcons name="quickreply" size={18} color="#F5F5F7" /></View>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>A FEW WORDS, READY WHEN YOU ARE</Text>
              <Text style={styles.title}>Quick replies</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close quick replies">
              <MaterialIcons name="close" size={19} color="#F5F5F7" />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>Tap a phrase to place it in your message. You can edit it before sending.</Text>
          <ScrollView style={styles.replyList} contentContainerStyle={styles.replyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {replies.map((reply) => {
              const custom = reply.id.startsWith("custom-");
              return (
                <View key={reply.id} style={styles.replyRow}>
                  <Pressable onPress={() => onSelect(reply.text)} style={({ pressed }) => [styles.phraseButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Use reply: ${reply.text}`}>
                    <Text style={styles.phraseText}>{reply.text}</Text>
                    <MaterialIcons name="north-west" size={14} color="#F5F5F7" />
                  </Pressable>
                  {custom ? <Pressable onPress={() => onRemove(reply.id)} style={styles.removeButton} accessibilityLabel={`Remove custom reply: ${reply.text}`}><MaterialIcons name="close" size={16} color="#F5F5F7" /></Pressable> : null}
                </View>
              );
            })}
          </ScrollView>
          <Text style={styles.fieldLabel}>MAKE A PHRASE YOURS</Text>
          <View style={styles.addRow}>
            <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" maxLength={120} placeholder="Write a phrase you often use" placeholderTextColor="#a7a6a1" style={styles.input} accessibilityLabel="New quick reply" />
            <Pressable onPress={add} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add custom quick reply"><MaterialIcons name="add" size={20} color="#FFFFFF" /></Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button"><Text style={styles.doneText}>Done</Text></Pressable>
          </ScrollView>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(77, 71, 43, 0.20)" },
  sheet: { flexShrink: 1, overflow: "hidden", borderRadius: 25, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), shadowColor: "#EBF5FD", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 18 },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { paddingTop: 12, paddingBottom: 14, paddingHorizontal: 16 },
  handle: { alignSelf: "center", height: 4, width: 34, borderRadius: 4, backgroundColor: "rgba(142, 111, 145, 0.34)", marginBottom: 15 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: "#D0D0CE", alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1 },
  eyebrow: { color: "#F5F5F7", fontSize: 12, fontWeight: "700", letterSpacing: 0.8 },
  title: { color: "#F5F5F7", fontSize: 18, fontWeight: "700", marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: 12, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), alignItems: "center", justifyContent: "center", shadowColor: "#E0EAF1", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  subtitle: { color: "#F5F5F7", fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 9 },
  replyList: { flexGrow: 0, flexShrink: 1, minHeight: 50 },
  replyContent: { gap: 6, paddingVertical: 2 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  phraseButton: { flex: 1, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 11, borderRadius: 13, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), shadowColor: "#DDE7EE", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  phraseText: { flex: 1, color: "#F5F5F7", fontSize: 12, lineHeight: 17 },
  removeButton: { width: 32, height: 32, borderRadius: 11, backgroundColor: "rgba(0, 0, 0, 0.10)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: "#F5F5F7", fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginTop: 12, marginBottom: 6 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  input: { minHeight: 42, flex: 1, borderRadius: 12, paddingHorizontal: 11, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.72)", backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), color: "#F5F5F7", fontSize: 12, outlineStyle: "none" as any },
  addButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#A78FA9", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), alignItems: "center", justifyContent: "center", shadowColor: "#E8F2FA", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  done: { minHeight: 39, borderRadius: 13, marginTop: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#A78FA9", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), shadowColor: "#E8F2FA", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  doneText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
});
