import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { groupCapacityGate, type Tier } from "@/lib/subscription";
import {
  addMember,
  groupCallGate,
  invitableFriends,
  isAdmin,
  leaveGroup,
  memberCountLabel,
  removeMember,
  renameGroup,
  roleLabel,
  setGroupPhoto,
  transferAdmin,
  type Group,
} from "@/lib/group-management";

type Props = {
  visible: boolean;
  group: Group;
  /** The signed-in member's id, used for admin and leave rules. */
  viewerId: string;
  /** Accepted friends only; strangers are never offered. */
  friendDirectory: readonly { id: string; name: string; paidTier?: boolean }[];
  onClose: () => void;
  onUpdate: (group: Group) => void;
  onFeedback: (message: string) => void;
  onStartGroupCall: () => void;
  onLeave: () => void;
  /** The viewer's plan; free members stop at the free cap. */
  tier: Tier;
  /** Opens the paywall when the plan's group capacity is reached. */
  onUpgrade: (reason: string) => void;
  /**
   * The soft upgrade hint for the free group cap. Rendered by the app so the
   * modal stays unaware of plans and pricing.
   */
  nudge?: React.ReactNode;
};

/** Group Info: members and roles, invite-only adds, settings, and admin tools. */
export function GroupInfoModal({ visible, group, viewerId, friendDirectory, onClose, onUpdate, onFeedback, onStartGroupCall, onLeave, tier, onUpgrade, nudge }: Props) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.settings.name);
  const viewerIsAdmin = isAdmin(group, viewerId);
  const candidates = invitableFriends(group, friendDirectory.map((friend) => friend.id));
  const callGate = groupCallGate(group);

  const apply = (result: { group: Group; ok: boolean; message: string }) => {
    if (result.ok) onUpdate(result.group);
    onFeedback(result.message);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]} onPress={onClose}>
        <BlurView intensity={28} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <BlurView intensity={35} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.sheet, { maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.92)"), glassOpacity) }]}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.card, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.9)"), glassOpacity) }]}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.topLine}>
                <View style={styles.groupPhoto}><MaterialIcons name="groups" size={22} color="#4A4210" /></View>
                <View style={styles.headCopy}>
                  {renaming ? (
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      style={styles.nameInput}
                      maxLength={40}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => { apply(renameGroup(group, draftName, viewerId)); setRenaming(false); }}
                    />
                  ) : (
                    <Text style={styles.groupName} numberOfLines={1}>{group.settings.name}</Text>
                  )}
                  <Text style={styles.groupMeta}>{memberCountLabel(group)} · invite-only</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close group info" onPress={onClose} style={({ pressed }) => [styles.roundAction, pressed && styles.pressed]}>
                  <MaterialIcons name="close" size={18} color="#726e59" />
                </Pressable>
              </View>

              {viewerIsAdmin ? (
                <View style={styles.adminActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Rename this group" onPress={() => { setDraftName(group.settings.name); setRenaming((current) => !current); }} style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}>
                    <MaterialIcons name="edit" size={14} color="#83721f" />
                    <Text style={styles.smallActionText}>{renaming ? "Cancel rename" : "Rename"}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Change the group photo" onPress={() => apply(setGroupPhoto(group, group.settings.photoUri ? null : "local-group-photo", viewerId))} style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}>
                    <MaterialIcons name="photo-camera" size={14} color="#83721f" />
                    <Text style={styles.smallActionText}>{group.settings.photoUri ? "Remove photo" : "Change photo"}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.adminNote}>Only group admins can rename this group or change its photo.</Text>
              )}

              <Text style={styles.sectionLabel}>MEMBERS</Text>
              {group.members.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberAvatar}><Text style={styles.memberInitial}>{member.name.charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName} numberOfLines={1}>{member.id === viewerId ? `${member.name} (you)` : member.name}</Text>
                    <Text style={styles.memberRole}>{roleLabel(member.role)}{member.paidTier ? " · Premium" : ""}</Text>
                  </View>
                  {member.role === "admin" ? <View style={styles.adminPill}><Text style={styles.adminPillText}>ADMIN</Text></View> : null}
                  {viewerIsAdmin && member.id !== viewerId ? (
                    <View style={styles.memberActions}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Make ${member.name.split(" ")[0]} the admin`} onPress={() => apply(transferAdmin(group, member.id, viewerId))} style={styles.iconAction}>
                        <MaterialIcons name="swap-horiz" size={15} color="#DFE6EB" />
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.name.split(" ")[0]} from the group`} onPress={() => apply(removeMember(group, member.id, viewerId))} style={styles.iconAction}>
                        <MaterialIcons name="person-remove-alt-1" size={15} color="#B4707F" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}

              <Text style={styles.sectionLabel}>ADD A FRIEND · ACCEPTED FRIENDS ONLY</Text>
              {nudge}
              {candidates.length === 0 ? (
                <Text style={styles.emptyNote}>Everyone you are friends with is already here. Groups never open to strangers.</Text>
              ) : (
                candidates.map((id) => {
                  const friend = friendDirectory.find((item) => item.id === id);
                  if (!friend) return null;
                  return (
                    <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Add ${friend.name} to this group`} onPress={() => { const capacity = groupCapacityGate(tier, group.members.length); if (!capacity.allowed) { if (tier === "free") onUpgrade(capacity.message); else onFeedback(capacity.message); return; } apply(addMember(group, { id: friend.id, name: friend.name, role: "member", paidTier: friend.paidTier }, friendDirectory.map((item) => item.id))); }} style={styles.memberRow}>
                      <View style={styles.memberAvatar}><Text style={styles.memberInitial}>{friend.name.charAt(0).toUpperCase()}</Text></View>
                      <View style={styles.memberCopy}><Text style={styles.memberName} numberOfLines={1}>{friend.name}</Text><Text style={styles.memberRole}>Accepted friend</Text></View>
                      <MaterialIcons name="person-add" size={16} color="#83721f" />
                    </Pressable>
                  );
                })
              )}

              <Text style={styles.sectionLabel}>GROUP SETTINGS</Text>
              <View style={styles.settingRow}>
                <MaterialIcons name="notifications-off" size={16} color="#DFE6EB" />
                <View style={styles.memberCopy}><Text style={styles.settingTitle}>Mute notifications</Text><Text style={styles.memberRole}>Your choice only — other members are unaffected</Text></View>
                <Switch value={group.settings.muted} onValueChange={() => onUpdate({ ...group, settings: { ...group.settings, muted: !group.settings.muted } })} trackColor={{ false: "#dddace", true: "#e3d075" }} thumbColor="#FFFFFF" />
              </View>

              <Pressable accessibilityRole="button" accessibilityLabel="Start a group call" onPress={() => { onFeedback(callGate.message); if (callGate.allowed) onStartGroupCall(); }} style={({ pressed }) => [styles.callRow, pressed && styles.pressed]}>
                <View style={styles.callIcon}><MaterialIcons name="videocam" size={17} color="#7393A8" /></View>
                <View style={styles.memberCopy}><Text style={styles.settingTitle}>Group call</Text><Text style={styles.memberRole}>{callGate.allowed ? "Everyone here has Premium" : "Needs Premium on every member"}</Text></View>
                <MaterialIcons name="chevron-right" size={17} color="#BFC8CF" />
              </Pressable>

              <Pressable accessibilityRole="button" accessibilityLabel="Leave this group" onPress={() => { const result = leaveGroup(group, viewerId); if (result.ok) { onFeedback(result.message); onLeave(); } else onFeedback(result.message); }} style={styles.leaveRow}>
                <MaterialIcons name="logout" size={16} color="#B4707F" />
                <Text style={styles.leaveText}>Leave group</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </BlurView>
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
  topLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  groupPhoto: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#E9D177", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.7)") },
  headCopy: { flex: 1, minWidth: 0 },
  groupName: { color: "#F2F4F6", fontSize: 13, fontWeight: "700" },
  nameInput: { borderRadius: 11, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.43)"), paddingHorizontal: 9, paddingVertical: 6, color: "#E8ECEF", fontSize: 12, outlineStyle: "none" as any },
  groupMeta: { color: "#DFE6EB", fontSize: 9, marginTop: 2 },
  roundAction: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.7)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  adminActions: { flexDirection: "row", gap: 7, marginTop: 11, flexWrap: "wrap" },
  smallAction: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"), backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.68)") },
  smallActionText: { color: "#83721f", fontSize: 10, fontWeight: "650" as any },
  adminNote: { color: "#DFE6EB", fontSize: 9.5, marginTop: 10 },
  sectionLabel: { color: "#BFC8CF", fontSize: 8.5, fontWeight: "700", letterSpacing: 0.9, marginTop: 14 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  memberAvatar: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245, 242, 223, 0.94)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  memberInitial: { color: "#83721f", fontSize: 13, fontWeight: "700" },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { color: "#E8ECEF", fontSize: 11, fontWeight: "650" as any },
  memberRole: { color: "#DFE6EB", fontSize: 9, marginTop: 2 },
  adminPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(246, 240, 209, 0.94)" },
  adminPillText: { color: "#83721f", fontSize: 7.5, fontWeight: "700", letterSpacing: 0.5 },
  memberActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconAction: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  emptyNote: { color: "#DFE6EB", fontSize: 9.5, lineHeight: 14, marginTop: 6 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  settingTitle: { color: "#E8ECEF", fontSize: 11, fontWeight: "650" as any },
  callRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  callIcon: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(238, 244, 248, 0.92)") },
  leaveRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12, borderRadius: 13, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(214, 178, 186, 0.6)", backgroundColor: glassNestedFill("rgba(252, 244, 246, 0.86)") },
  leaveText: { color: "#A85F6E", fontSize: 10.5, fontWeight: "700" },
  pressed: { opacity: 0.86 },
});
