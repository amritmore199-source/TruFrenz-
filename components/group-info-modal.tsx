import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { GlassBlur } from "@/components/glass-blur";
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
        <GlassBlur intensity={28} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <GlassBlur intensity={35} style={[styles.sheet, { maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight}]}
          fill={glassSurfaceColor(glassNestedFill("rgba(0, 0, 0, 0.10)"), glassOpacity)}
        >
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.card, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(0, 0, 0, 0.10)"), glassOpacity) }]}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.topLine}>
                <View style={styles.groupPhoto}><MaterialIcons name="groups" size={22} color="#FFFFFF" /></View>
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
                  <MaterialIcons name="close" size={18} color="#4B4651" />
                </Pressable>
              </View>

              {viewerIsAdmin ? (
                <View style={styles.adminActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Rename this group" onPress={() => { setDraftName(group.settings.name); setRenaming((current) => !current); }} style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}>
                    <MaterialIcons name="edit" size={14} color="#666070" />
                    <Text style={styles.smallActionText}>{renaming ? "Cancel rename" : "Rename"}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Change the group photo" onPress={() => apply(setGroupPhoto(group, group.settings.photoUri ? null : "local-group-photo", viewerId))} style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}>
                    <MaterialIcons name="photo-camera" size={14} color="#666070" />
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
                        <MaterialIcons name="swap-horiz" size={15} color="#4B4651" />
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.name.split(" ")[0]} from the group`} onPress={() => apply(removeMember(group, member.id, viewerId))} style={styles.iconAction}>
                        <MaterialIcons name="person-remove-alt-1" size={15} color="#666070" />
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
                      <MaterialIcons name="person-add" size={16} color="#666070" />
                    </Pressable>
                  );
                })
              )}

              <Text style={styles.sectionLabel}>GROUP SETTINGS</Text>
              <View style={styles.settingRow}>
                <MaterialIcons name="notifications-off" size={16} color="#4B4651" />
                <View style={styles.memberCopy}><Text style={styles.settingTitle}>Mute notifications</Text><Text style={styles.memberRole}>Your choice only — other members are unaffected</Text></View>
                <Switch value={group.settings.muted} onValueChange={() => onUpdate({ ...group, settings: { ...group.settings, muted: !group.settings.muted } })} trackColor={{ false: "#D6DBDE", true: "#8E6F91" }} thumbColor="#FFFFFF" />
              </View>

              <Pressable accessibilityRole="button" accessibilityLabel="Start a group call" onPress={() => { onFeedback(callGate.message); if (callGate.allowed) onStartGroupCall(); }} style={({ pressed }) => [styles.callRow, pressed && styles.pressed]}>
                <View style={styles.callIcon}><MaterialIcons name="videocam" size={17} color="#4B4651" /></View>
                <View style={styles.memberCopy}><Text style={styles.settingTitle}>Group call</Text><Text style={styles.memberRole}>{callGate.allowed ? "Everyone here has Premium" : "Needs Premium on every member"}</Text></View>
                <MaterialIcons name="chevron-right" size={17} color="#4B4651" />
              </Pressable>

              <Pressable accessibilityRole="button" accessibilityLabel="Leave this group" onPress={() => { const result = leaveGroup(group, viewerId); if (result.ok) { onFeedback(result.message); onLeave(); } else onFeedback(result.message); }} style={styles.leaveRow}>
                <MaterialIcons name="logout" size={16} color="#666070" />
                <Text style={styles.leaveText}>Leave group</Text>
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
  sheet: { width: "100%", borderRadius: 22, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), overflow: "hidden", shadowColor: "#E9F3FA", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  card: { borderRadius: 22, overflow: "hidden" },
  scroll: { flexGrow: 0 },
  content: { padding: 14, paddingBottom: 16 },
  topLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  groupPhoto: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#6B6B6B", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  headCopy: { flex: 1, minWidth: 0 },
  groupName: { color: "#4B4651", fontSize: 13.5, fontWeight: "700" },
  nameInput: { borderRadius: 11, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), paddingHorizontal: 9, paddingVertical: 6, color: "#4B4651", fontSize: 12.5, outlineStyle: "none" as any },
  groupMeta: { color: "#4B4651", fontSize: 12, marginTop: 2 },
  roundAction: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  adminActions: { flexDirection: "row", gap: 7, marginTop: 11, flexWrap: "wrap" },
  smallAction: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  smallActionText: { color: "#666070", fontSize: 12, fontWeight: "650" as any },
  adminNote: { color: "#4B4651", fontSize: 12, marginTop: 10 },
  sectionLabel: { color: "#4B4651", fontSize: 12, fontWeight: "700", letterSpacing: 0.9, marginTop: 14 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  memberAvatar: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.10)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  memberInitial: { color: "#666070", fontSize: 13.5, fontWeight: "700" },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { color: "#4B4651", fontSize: 12, fontWeight: "650" as any },
  memberRole: { color: "#4B4651", fontSize: 12, marginTop: 2 },
  adminPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(0, 0, 0, 0.10)" },
  adminPillText: { color: "#666070", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  memberActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconAction: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  emptyNote: { color: "#4B4651", fontSize: 12, lineHeight: 17, marginTop: 6 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  settingTitle: { color: "#4B4651", fontSize: 12, fontWeight: "650" as any },
  callRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  callIcon: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  leaveRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12, borderRadius: 13, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(214, 178, 186, 0.6)", backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  leaveText: { color: "#666070", fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.86 },
});
