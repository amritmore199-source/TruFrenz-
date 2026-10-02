import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { GlassBlur } from "@/components/glass-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { deleteThreadConfirmation, unfriendConfirmation, type ChatRowState } from "@/lib/chat-extras";

type Props = {
  visible: boolean;
  chatName: string;
  /** Groups have no unfriend action, only leave. */
  isGroup: boolean;
  state: ChatRowState;
  shareReadReceipts: boolean;
  onClose: () => void;
  onViewProfile: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onToggleReadReceipts: (value: boolean) => void;
  onUnfriend: () => void;
  onDeleteThread: () => void;
  onReport: () => void;
  onBlock: () => void;
  onLeaveGroup: () => void;
};

type PendingConfirm = null | "unfriend" | "delete" | "block";

/** The three-dot menu behind every conversation header. */
export function ChatOverflowMenu({
  visible,
  chatName,
  isGroup,
  state,
  shareReadReceipts,
  onClose,
  onViewProfile,
  onToggleMute,
  onToggleArchive,
  onToggleReadReceipts,
  onUnfriend,
  onDeleteThread,
  onReport,
  onBlock,
  onLeaveGroup,
}: Props) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [pending, setPending] = useState<PendingConfirm>(null);
  const first = chatName.split(" ")[0] || chatName;
  const unfriend = unfriendConfirmation(chatName);
  const remove = deleteThreadConfirmation(chatName);

  const closeAll = () => {
    setPending(null);
    onClose();
  };

  const confirmCopy =
    pending === "unfriend" ? unfriend : pending === "delete" ? remove : pending === "block"
      ? { title: `Block ${first}?`, body: `${first} can no longer message you, see your profile, or send requests. Your conversation is archived and read-only.`, confirm: `Block ${first}` }
      : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeAll}>
      <Pressable style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]} onPress={closeAll}>
        <GlassBlur intensity={28} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <GlassBlur intensity={35} style={[styles.sheet, { maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight}]}
          fill={glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.92)"), glassOpacity)}
        >
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.card, { maxHeight: modalLayout.maxHeight - 2, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.9)"), glassOpacity) }]}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.handle} />
              <Text style={styles.eyebrow}>CONVERSATION</Text>
              <Text style={styles.title} numberOfLines={1}>{chatName}</Text>
              {state.readOnly ? <Text style={styles.readOnlyNote}>This conversation is archived and read-only.</Text> : null}

              {pending && confirmCopy ? (
                <View style={styles.confirmCard}>
                  <Text style={styles.confirmTitle}>{confirmCopy.title}</Text>
                  <Text style={styles.confirmBody}>{confirmCopy.body}</Text>
                  <View style={styles.confirmActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => setPending(null)} style={({ pressed }) => [styles.confirmGhost, pressed && styles.pressed]}>
                      <Text style={styles.confirmGhostText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={confirmCopy.confirm}
                      onPress={() => {
                        if (pending === "unfriend") onUnfriend();
                        else if (pending === "delete") onDeleteThread();
                        else onBlock();
                        closeAll();
                      }}
                      style={({ pressed }) => [styles.confirmDanger, pressed && styles.pressed]}
                    >
                      <Text style={styles.confirmDangerText}>{confirmCopy.confirm}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {!isGroup ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`View ${first}'s profile`} onPress={() => { onClose(); onViewProfile(); }} style={styles.row}>
                  <View style={styles.iconPink}><MaterialIcons name="person-outline" size={17} color="#83721f" /></View>
                  <View style={styles.copy}><Text style={styles.rowTitle}>View profile</Text><Text style={styles.rowSub}>Photos, interests, and verification</Text></View>
                  <MaterialIcons name="chevron-right" size={17} color="#848A8F" />
                </Pressable>
              ) : null}

              <View style={styles.divider} />

              <Pressable accessibilityRole="switch" accessibilityState={{ checked: state.muted }} accessibilityLabel={state.muted ? "Unmute notifications" : "Mute notifications"} onPress={onToggleMute} style={styles.row}>
                <View style={styles.iconBlue}><MaterialIcons name={state.muted ? "notifications-active" : "notifications-off"} size={17} color="#6E8DA1" /></View>
                <View style={styles.copy}><Text style={styles.rowTitle}>{state.muted ? "Unmute this chat" : "Mute this chat"}</Text><Text style={styles.rowSub}>{state.muted ? "Notifications are paused" : "Stay quiet, keep the badge"}</Text></View>
                <Switch value={state.muted} onValueChange={onToggleMute} trackColor={{ false: "#dddace", true: "#e3d075" }} thumbColor="#FFFFFF" pointerEvents="none" />
              </Pressable>

              <Pressable accessibilityRole="switch" accessibilityState={{ checked: state.archived }} accessibilityLabel={state.archived ? "Unarchive conversation" : "Archive conversation"} onPress={onToggleArchive} style={styles.row}>
                <View style={styles.iconNeutral}><MaterialIcons name={state.archived ? "unarchive" : "archive"} size={17} color="#6E6C67" /></View>
                <View style={styles.copy}><Text style={styles.rowTitle}>{state.archived ? "Move back to inbox" : "Archive this chat"}</Text><Text style={styles.rowSub}>{state.archived ? "Returns to your main list" : "Hidden until a new message arrives"}</Text></View>
                <Switch value={state.archived} onValueChange={onToggleArchive} trackColor={{ false: "#dddace", true: "#e3d075" }} thumbColor="#FFFFFF" pointerEvents="none" />
              </Pressable>

              <Pressable accessibilityRole="switch" accessibilityState={{ checked: shareReadReceipts }} accessibilityLabel="Show when I have read messages" onPress={() => onToggleReadReceipts(!shareReadReceipts)} style={styles.row}>
                <View style={styles.iconBlue}><MaterialIcons name="done-all" size={17} color="#6E8DA1" /></View>
                <View style={styles.copy}><Text style={styles.rowTitle}>Show when I&apos;ve read messages</Text><Text style={styles.rowSub}>{shareReadReceipts ? "Read receipts are on" : "Off by default · your friends see Delivered only"}</Text></View>
                <Switch value={shareReadReceipts} onValueChange={onToggleReadReceipts} trackColor={{ false: "#dddace", true: "#e3d075" }} thumbColor="#FFFFFF" pointerEvents="none" />
              </Pressable>

              <View style={styles.divider} />

              <Pressable accessibilityRole="button" accessibilityLabel="Report this conversation" onPress={() => { onReport(); closeAll(); }} style={styles.row}>
                <View style={styles.iconNeutral}><MaterialIcons name="flag" size={17} color="#6E6C67" /></View>
                <View style={styles.copy}><Text style={styles.rowTitle}>Report</Text><Text style={styles.rowSub}>Send this conversation to the safety team</Text></View>
                <MaterialIcons name="chevron-right" size={17} color="#848A8F" />
              </Pressable>

              {!isGroup ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Block ${first}`} onPress={() => setPending("block")} style={styles.row}>
                  <View style={styles.iconNeutral}><MaterialIcons name="block" size={17} color="#6E6C67" /></View>
                  <View style={styles.copy}><Text style={styles.rowTitle}>Block</Text><Text style={styles.rowSub}>They can&apos;t reach you anywhere in Trufrenz</Text></View>
                  <MaterialIcons name="chevron-right" size={17} color="#848A8F" />
                </Pressable>
              ) : null}

              <Pressable accessibilityRole="button" accessibilityLabel={isGroup ? "Leave this group" : `Unfriend ${first}`} onPress={() => setPending(isGroup ? "delete" : "unfriend")} style={styles.row}>
                <View style={styles.iconDanger}><MaterialIcons name={isGroup ? "logout" : "person-remove-alt-1"} size={17} color="#B4707F" /></View>
                <View style={styles.copy}><Text style={[styles.rowTitle, styles.dangerText]}>{isGroup ? "Leave group" : `Unfriend ${first}`}</Text><Text style={styles.rowSub}>{isGroup ? "You keep your copy of the history" : "Chat becomes archived and read-only"}</Text></View>
                <MaterialIcons name="chevron-right" size={17} color="#848A8F" />
              </Pressable>

              {state.archived ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Delete this conversation" onPress={() => setPending("delete")} style={styles.row}>
                  <View style={styles.iconDanger}><MaterialIcons name="delete-outline" size={17} color="#B4707F" /></View>
                  <View style={styles.copy}><Text style={[styles.rowTitle, styles.dangerText]}>Delete messages</Text><Text style={styles.rowSub}>Removes this conversation from your device</Text></View>
                  <MaterialIcons name="chevron-right" size={17} color="#848A8F" />
                </Pressable>
              ) : null}

              <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={closeAll} style={styles.cancel}>
                <Text style={styles.cancelText}>Close</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </GlassBlur>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(57, 53, 32, 0.24)" },
  sheet: { width: "100%", borderRadius: 22, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.9)"), overflow: "hidden", shadowColor: "#58543e", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  card: { borderRadius: 22, overflow: "hidden" },
  scroll: { flexGrow: 0 },
  content: { padding: 14, paddingBottom: 16 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(150, 140, 155, 0.35)", marginBottom: 9 },
  eyebrow: { color: "#5F5D57", fontSize: 12, fontWeight: "700", letterSpacing: 0.9 },
  title: { color: "#43423d", fontSize: 13.5, fontWeight: "700", marginTop: 3 },
  readOnlyNote: { color: "#7C6C1D", fontSize: 12, fontWeight: "650" as any, marginTop: 4 },
  confirmCard: { marginTop: 11, borderRadius: 15, borderWidth: 1, borderColor: "rgba(202, 178, 53, 0.5)", backgroundColor: glassNestedFill("rgba(252, 244, 246, 0.92)"), padding: 12, gap: 6 },
  confirmTitle: { color: "#544f3b", fontSize: 12, fontWeight: "700" },
  confirmBody: { color: "#6E6C67", fontSize: 12, lineHeight: 17 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  confirmGhost: { borderRadius: 11, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)") },
  confirmGhostText: { color: "#7C6C1D", fontSize: 12, fontWeight: "650" as any },
  confirmDanger: { borderRadius: 11, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#A26572" },
  confirmDangerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  iconPink: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(247, 241, 214, 0.92)" },
  iconBlue: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(238, 244, 248, 0.92)") },
  iconNeutral: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(244, 242, 236, 0.92)") },
  iconDanger: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(252, 240, 242, 0.92)") },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#53514C", fontSize: 12, fontWeight: "650" as any },
  dangerText: { color: "#9C5866" },
  rowSub: { color: "#5F5D57", fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: "rgba(224, 221, 203, 0.7)", marginVertical: 6 },
  cancel: { alignItems: "center", paddingVertical: 11, marginTop: 4 },
  cancelText: { color: "#5F5D57", fontSize: 12, fontWeight: "600" },
  pressed: { opacity: 0.86 },
});
