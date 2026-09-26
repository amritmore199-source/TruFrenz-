import React, { useState } from "react";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { QuickReply } from "@/lib/quick-replies";

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

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.shade}>
        <BlurView intensity={34} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close quick replies" onPress={onClose} />
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <BlurView intensity={39} tint="light" experimentalBlurMethod="dimezisBlurView" pointerEvents="none" style={StyleSheet.absoluteFill} />
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.headingIcon}><MaterialIcons name="quickreply" size={18} color="#927591" /></View>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>A FEW WORDS, READY WHEN YOU ARE</Text>
              <Text style={styles.title}>Quick replies</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close quick replies">
              <MaterialIcons name="close" size={19} color="#746A7D" />
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
                    <MaterialIcons name="north-west" size={14} color="#A18AA2" />
                  </Pressable>
                  {custom ? <Pressable onPress={() => onRemove(reply.id)} style={styles.removeButton} accessibilityLabel={`Remove custom reply: ${reply.text}`}><MaterialIcons name="close" size={16} color="#9C8C9A" /></Pressable> : null}
                </View>
              );
            })}
          </ScrollView>
          <Text style={styles.fieldLabel}>MAKE A PHRASE YOURS</Text>
          <View style={styles.addRow}>
            <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" maxLength={120} placeholder="Write a phrase you often use" placeholderTextColor="#AAA4AC" style={styles.input} accessibilityLabel="New quick reply" />
            <Pressable onPress={add} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add custom quick reply"><MaterialIcons name="add" size={20} color="#FFFFFF" /></Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button"><Text style={styles.doneText}>Done</Text></Pressable>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(80,66,87,0.20)" },
  sheet: { maxHeight: "82%", overflow: "hidden", paddingTop: 10, paddingBottom: 20, paddingHorizontal: 19, borderTopLeftRadius: 27, borderTopRightRadius: 27, backgroundColor: "rgba(252,249,252,0.84)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#57465C", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -7 }, elevation: 14 },
  handle: { alignSelf: "center", height: 4, width: 34, borderRadius: 4, backgroundColor: "rgba(152,137,157,0.34)", marginBottom: 15 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: "#F0E6F1", alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1 },
  eyebrow: { color: "#A0849E", fontSize: 7, fontWeight: "700", letterSpacing: 0.8 },
  title: { color: "#4E4754", fontSize: 18, fontWeight: "700", marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.78)", alignItems: "center", justifyContent: "center" },
  subtitle: { color: "#8D8591", fontSize: 9, lineHeight: 14, marginTop: 10, marginBottom: 9 },
  replyList: { flexGrow: 0, flexShrink: 1, minHeight: 50 },
  replyContent: { gap: 6, paddingVertical: 2 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  phraseButton: { flex: 1, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 11, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.80)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  phraseText: { flex: 1, color: "#615967", fontSize: 10, lineHeight: 14 },
  removeButton: { width: 32, height: 32, borderRadius: 11, backgroundColor: "rgba(244,239,244,0.9)", alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: "#9B8B9B", fontSize: 7, fontWeight: "700", letterSpacing: 0.8, marginTop: 12, marginBottom: 6 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  input: { minHeight: 42, flex: 1, borderRadius: 12, paddingHorizontal: 11, borderWidth: 1, borderColor: "rgba(220,211,222,0.72)", backgroundColor: "rgba(255,255,255,0.83)", color: "#4E4753", fontSize: 10, outlineStyle: "none" as any },
  addButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#9D7E9E", alignItems: "center", justifyContent: "center" },
  done: { minHeight: 39, borderRadius: 13, marginTop: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#9D7E9E" },
  doneText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
});
