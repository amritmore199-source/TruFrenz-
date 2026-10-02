import React, { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { GlassBlur } from "@/components/glass-blur";
import { MaterialIcons } from "@expo/vector-icons";

import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { INTEREST_SUGGESTIONS, LOCALITY_SUGGESTIONS } from "@/lib/onboarding-profile";
import {
  GENDER_OPTIONS,
  LANGUAGE_SUGGESTIONS,
  LOOKING_FOR_OPTIONS,
  MAX_BIO_LENGTH,
  MAX_LANGUAGES,
  MAX_LOOKING_FOR,
  MAX_PHOTOS,
  MAX_STATUS_LENGTH,
  REQUEST_AUDIENCE_OPTIONS,
  STATUS_LIFETIME_HOURS,
  STATUS_SUGGESTIONS,
  clampBio,
  clampStatus,
  createStatus,
  firstProfileDetailError,
  profileCompleteness,
  statusFreshness,
  toggleFromList,
  validateEditableProfile,
  verificationBadge,
  type EditableProfile,
  type GenderOption,
  type LookingFor,
  type ProfileErrors,
  type ProfilePhoto,
  type RequestAudience,
} from "@/lib/profile-details";

/** A compact palette of mood markers for the status line. */
const STATUS_EMOJI_CHOICES: readonly string[] = ["🌿", "🏋️", "☕", "📚", "🎧", "🧺", "🧗", "🎬", "🚶", "🍜"];

type Props = {
  visible: boolean;
  profile: EditableProfile;
  onChange: (profile: EditableProfile) => void;
  onClose: () => void;
  onAddPhoto: () => void;
  onStartVerification: () => void;
  onNotify: (message: string) => void;
  onSaved: () => void;
};

export function EditProfileModal({ visible, profile, onChange, onClose, onAddPhoto, onStartVerification, onNotify, onSaved }: Props) {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [statusText, setStatusText] = useState(profile.status?.text ?? "");
  const [statusEmoji, setStatusEmoji] = useState(profile.status?.emoji ?? "");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const badge = verificationBadge(profile.verification);
  const completeness = profileCompleteness(profile);

  useEffect(() => {
    if (!visible) {
      setErrors({});
      setPrivacyOpen(false);
      setEmojiPickerOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setStatusText(profile.status?.text ?? "");
      setStatusEmoji(profile.status?.emoji ?? "");
    }
  }, [visible, profile.status]);

  const patch = (changes: Partial<EditableProfile>) => onChange({ ...profile, ...changes });

  const handleSave = () => {
    const nextErrors = validateEditableProfile(profile);
    setErrors(nextErrors);
    const message = firstProfileDetailError(nextErrors);
    if (message) {
      onNotify(message);
      return;
    }
    onChange({ ...profile, status: createStatus(statusText, statusEmoji) });
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <View style={[styles.scrim, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}>
        <GlassBlur intensity={28} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <GlassBlur intensity={56} style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close edit profile" onPress={onClose} />
          <View style={[styles.sheet, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(252, 250, 242, 0.94)"), glassOpacity) }]}>
            <GlassBlur intensity={64} pointerEvents="none" style={StyleSheet.absoluteFill} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>EDIT PROFILE</Text>
                <Text style={styles.title}>Your glass card</Text>
              </View>
              <View style={styles.completeness} accessibilityLabel={`Profile ${completeness} percent complete`}>
                <Text style={styles.completenessText}>{completeness}%</Text>
              </View>
              <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close edit profile">
                <MaterialIcons name="close" size={19} color="#726e59" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, !badge.strong && styles.badgePhone]}>
                  <MaterialIcons name={badge.strong ? "verified-user" : "phone-iphone"} size={14} color={badge.strong ? "#5E947B" : "#7B8D9C"} />
                  <Text style={[styles.badgeText, !badge.strong && styles.badgeTextPhone]}>{badge.label}</Text>
                </View>
                {badge.canGetVerified ? (
                  <Pressable onPress={onStartVerification} accessibilityLabel="Get verified with ID and selfie" style={({ pressed }) => [styles.verifyButton, pressed && styles.pressed]}>
                    <MaterialIcons name="badge" size={14} color="#4A4210" />
                    <Text style={styles.verifyButtonText}>Get Verified</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.sectionLabel}>PHOTOS · {profile.photos.length}/{MAX_PHOTOS} · PRIMARY FIRST</Text>
              <View style={styles.photoGrid}>
                {profile.photos.map((photo, index) => {
                  const primary = photo.id === profile.primaryPhotoId;
                  return (
                    <View key={photo.id} style={styles.photoTile}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                      {primary ? (
                        <View style={styles.primaryFlag}><Text style={styles.primaryFlagText}>Primary</Text></View>
                      ) : (
                        <Pressable onPress={() => patch({ primaryPhotoId: photo.id })} accessibilityLabel={`Make photo ${index + 1} primary`} style={styles.primaryAction}>
                          <MaterialIcons name="star-outline" size={13} color="#757159" />
                        </Pressable>
                      )}
                      <View style={styles.photoControls}>
                        <Pressable onPress={() => onChange({ ...profile, photos: move(profile.photos, index, -1), primaryPhotoId: profile.primaryPhotoId })} disabled={index === 0} accessibilityLabel={`Move photo ${index + 1} earlier`} style={[styles.photoControl, index === 0 && styles.photoControlDisabled]}>
                          <MaterialIcons name="chevron-left" size={15} color="#82898E" />
                        </Pressable>
                        <Pressable onPress={() => onChange({ ...profile, photos: move(profile.photos, index, 1), primaryPhotoId: profile.primaryPhotoId })} disabled={index === profile.photos.length - 1} accessibilityLabel={`Move photo ${index + 1} later`} style={[styles.photoControl, index === profile.photos.length - 1 && styles.photoControlDisabled]}>
                          <MaterialIcons name="chevron-right" size={15} color="#82898E" />
                        </Pressable>
                        <Pressable onPress={() => onChange(removePhoto(profile, photo.id))} accessibilityLabel={`Remove photo ${index + 1}`} style={styles.photoControl}>
                          <MaterialIcons name="delete-outline" size={15} color="#83721f" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                {profile.photos.length < MAX_PHOTOS ? (
                  <Pressable onPress={onAddPhoto} accessibilityLabel="Add a photo" style={({ pressed }) => [styles.addPhoto, pressed && styles.pressed]}>
                    <MaterialIcons name="add-a-photo" size={22} color="#83721f" />
                    <Text style={styles.addPhotoText}>Add photo</Text>
                  </Pressable>
                ) : null}
              </View>
              {errors.photos ? <Text style={styles.fieldError}>{errors.photos}</Text> : null}
              <Text style={styles.hint}>Drag order with the arrows · the primary photo appears on your discovery card.</Text>

              <Text style={styles.sectionLabel}>NAME OR NICKNAME</Text>
              <TextInput
                value={profile.name}
                onChangeText={(value) => { patch({ name: value }); setErrors((current) => ({ ...current, name: undefined })); }}
                placeholder="What do people call you?"
                placeholderTextColor="#a7a6a1"
                style={styles.input}
                returnKeyType="done"
              />
              {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}

              <Text style={styles.sectionLabel}>STATUS · {statusText.length}/{MAX_STATUS_LENGTH}</Text>
              <View style={styles.statusRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pick a status emoji"
                  onPress={() => setEmojiPickerOpen((open) => !open)}
                  style={({ pressed }) => [styles.statusEmojiButton, pressed && styles.pressed]}
                >
                  <Text style={styles.statusEmojiText}>{statusEmoji || "＋"}</Text>
                </Pressable>
                <TextInput
                  value={statusText}
                  onChangeText={(value) => setStatusText(clampStatus(value))}
                  placeholder="free this weekend"
                  placeholderTextColor="#a7a6a1"
                  style={[styles.input, styles.statusInput]}
                  maxLength={MAX_STATUS_LENGTH}
                  returnKeyType="done"
                />
              </View>
              {emojiPickerOpen ? (
                <View style={styles.chipWrap}>
                  {STATUS_EMOJI_CHOICES.map((choice) => (
                    <Pressable
                      key={choice}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: statusEmoji === choice }}
                      accessibilityLabel={`Status emoji ${choice}`}
                      onPress={() => { setStatusEmoji(choice); setEmojiPickerOpen(false); }}
                      style={[styles.chip, statusEmoji === choice && styles.chipActive]}
                    >
                      <Text style={styles.chipText}>{choice}</Text>
                    </Pressable>
                  ))}
                  <Pressable accessibilityLabel="Remove status emoji" onPress={() => { setStatusEmoji(""); setEmojiPickerOpen(false); }} style={styles.chip}>
                    <Text style={styles.chipText}>None</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={styles.statusPreviewLabel}>EVERYONE SEES</Text>
              <View style={styles.statusPreview}>
                <View style={styles.statusPreviewDot} />
                <Text style={styles.statusPreviewText} numberOfLines={1}>
                  {statusText.trim() ? `${statusEmoji ? `${statusEmoji} ` : ""}${statusText.trim()}` : "No status set — your name shows on its own."}
                </Text>
              </View>
              <View style={styles.chipWrap}>
                {STATUS_SUGGESTIONS.slice(0, 6).map((suggestion) => (
                  <Pressable
                    key={suggestion.text}
                    accessibilityLabel={`Use status ${suggestion.text}`}
                    onPress={() => { setStatusText(suggestion.text); setStatusEmoji(suggestion.emoji); }}
                    style={({ pressed }) => [styles.chip, statusText === suggestion.text && styles.chipActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, statusText === suggestion.text && styles.chipTextActive]}>
                      {suggestion.emoji} {suggestion.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {statusText.trim() ? (
                <Pressable accessibilityLabel="Clear status" onPress={() => { setStatusText(""); setStatusEmoji(""); }} style={styles.statusClear}>
                  <MaterialIcons name="close" size={13} color="#6E6C67" />
                  <Text style={styles.statusClearText}>Clear status</Text>
                </Pressable>
              ) : null}
              <Text style={styles.hint}>{statusFreshness(profile.status) ? `${statusFreshness(profile.status)} · ` : ""}Statuses quietly fade after {STATUS_LIFETIME_HOURS} hours so nothing feels stale.</Text>

              <Text style={styles.sectionLabel}>AGE · LOCKED TO YOUR VERIFIED DATE OF BIRTH</Text>
              <View style={[styles.input, styles.lockedField]}>
                <Text style={styles.lockedValue}>{profile.age}</Text>
                <MaterialIcons name="lock" size={14} color="#6E6C67" />
              </View>
              <Text style={styles.hint}>Ages stay accurate because they come from verification, not a free-text field.</Text>

              <Text style={styles.sectionLabel}>GENDER</Text>
              <View style={styles.chipWrap}>
                {GENDER_OPTIONS.map((option) => {
                  const selected = profile.gender === option;
                  return (
                    <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Gender ${option}`} onPress={() => patch({ gender: option as GenderOption })} style={[styles.chip, selected && styles.chipActive]}>
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>HOME AREA · SEPARATE FROM LIVE LOCATION</Text>
              <TextInput
                value={profile.locality}
                onChangeText={(value) => { patch({ locality: value, localityAutoFilled: false }); setErrors((current) => ({ ...current, locality: undefined })); }}
                placeholder="Your neighborhood"
                placeholderTextColor="#a7a6a1"
                style={styles.input}
                returnKeyType="done"
              />
              <View style={styles.chipWrap}>
                <Pressable onPress={() => patch({ locality: "Pacific Heights", localityAutoFilled: true })} accessibilityLabel="Use device location for home area" style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <MaterialIcons name="my-location" size={13} color="#7B8A95" />
                  <Text style={styles.chipText}>Use device location</Text>
                </Pressable>
                {LOCALITY_SUGGESTIONS.slice(0, 3).map((item) => (
                  <Pressable key={item} onPress={() => { patch({ locality: item, localityAutoFilled: false }); setErrors((current) => ({ ...current, locality: undefined })); }} style={[styles.chip, profile.locality === item && styles.chipActive]}>
                    <Text style={[styles.chipText, profile.locality === item && styles.chipTextActive]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
              {errors.locality ? <Text style={styles.fieldError}>{errors.locality}</Text> : null}

              <Text style={styles.sectionLabel}>ABOUT YOU · {profile.bio.length}/{MAX_BIO_LENGTH}</Text>
              <TextInput
                value={profile.bio}
                onChangeText={(value) => patch({ bio: clampBio(value) })}
                placeholder="A line or two about what you enjoy."
                placeholderTextColor="#a7a6a1"
                style={[styles.input, styles.bioInput]}
                multiline
                maxLength={MAX_BIO_LENGTH}
              />
              {errors.bio ? <Text style={styles.fieldError}>{errors.bio}</Text> : null}

              <Text style={styles.sectionLabel}>INTERESTS · PICK UP TO 8</Text>
              <View style={styles.chipWrap}>
                {INTEREST_SUGGESTIONS.map((item) => {
                  const selected = profile.interests.includes(item);
                  return (
                    <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Interest ${item}`} onPress={() => patch({ interests: toggleFromList(profile.interests, item, 8) })} style={[styles.chip, selected && styles.chipActive]}>
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors.interests ? <Text style={styles.fieldError}>{errors.interests}</Text> : null}

              <Text style={styles.sectionLabel}>LANGUAGES · PICK UP TO {MAX_LANGUAGES}</Text>
              <View style={styles.chipWrap}>
                {LANGUAGE_SUGGESTIONS.map((item) => {
                  const selected = profile.languages.includes(item);
                  return (
                    <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Language ${item}`} onPress={() => patch({ languages: toggleFromList(profile.languages, item, MAX_LANGUAGES) })} style={[styles.chip, selected && styles.chipActive]}>
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>LOOKING FOR · PICK UP TO {MAX_LOOKING_FOR}</Text>
              <View style={styles.chipWrap}>
                {LOOKING_FOR_OPTIONS.map((item) => {
                  const selected = profile.lookingFor.includes(item);
                  return (
                    <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Looking for ${item}`} onPress={() => patch({ lookingFor: toggleFromList(profile.lookingFor, item as LookingFor, MAX_LOOKING_FOR) })} style={[styles.chip, selected && styles.chipActive]}>
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>Available for a hello</Text>
                  <Text style={styles.switchSub}>Controls discovery and whether friends can reach you.</Text>
                </View>
                <Switch accessibilityLabel="Available for a hello" value={profile.available} onValueChange={(value) => patch({ available: value })} trackColor={{ false: "#dddace", true: "#B9D9E9" }} thumbColor="#FFFFFF" />
              </View>

              <Pressable onPress={() => setPrivacyOpen((current) => !current)} accessibilityLabel="Toggle privacy controls" style={styles.privacyHeader}>
                <MaterialIcons name={privacyOpen ? "expand-less" : "expand-more"} size={18} color="#83721f" />
                <Text style={styles.privacyTitle}>Privacy controls</Text>
                <Text style={styles.privacySummary}>{REQUEST_AUDIENCE_OPTIONS.find((option) => option.value === profile.privacy.requestAudience)?.label}</Text>
              </Pressable>
              {privacyOpen ? (
                <View style={styles.privacyBody}>
                  <Text style={styles.sectionLabel}>WHO CAN SEND REQUESTS</Text>
                  <View style={styles.chipWrap}>
                    {REQUEST_AUDIENCE_OPTIONS.map((option) => {
                      const selected = profile.privacy.requestAudience === option.value;
                      return (
                        <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Requests from ${option.label}`} onPress={() => patch({ privacy: { ...profile.privacy, requestAudience: option.value as RequestAudience } })} style={[styles.chip, selected && styles.chipActive]}>
                          <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}><Text style={styles.switchTitle}>Hide from discovery</Text><Text style={styles.switchSub}>You stay invisible in suggestions.</Text></View>
                    <Switch accessibilityLabel="Hide from discovery" value={profile.privacy.hideFromDiscovery} onValueChange={(value) => patch({ privacy: { ...profile.privacy, hideFromDiscovery: value } })} trackColor={{ false: "#dddace", true: "#e3d075" }} thumbColor="#FFFFFF" />
                  </View>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}><Text style={styles.switchTitle}>Hide exact locality</Text><Text style={styles.switchSub}>Show only a broad “~X km” range.</Text></View>
                    <Switch accessibilityLabel="Hide exact locality" value={profile.privacy.hideExactLocality} onValueChange={(value) => patch({ privacy: { ...profile.privacy, hideExactLocality: value } })} trackColor={{ false: "#dddace", true: "#e3d075" }} thumbColor="#FFFFFF" />
                  </View>
                  <Pressable onPress={() => onNotify(`Block list · ${profile.privacy.blockedIds.length} blocked member(s).`)} accessibilityLabel="Open block list" style={({ pressed }) => [styles.blockList, pressed && styles.pressed]}>
                    <MaterialIcons name="block" size={15} color="#83721f" />
                    <Text style={styles.blockListText}>Block list</Text>
                    <Text style={styles.blockListCount}>{profile.privacy.blockedIds.length}</Text>
                    <MaterialIcons name="chevron-right" size={17} color="#848A8F" />
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable onPress={onClose} accessibilityLabel="Cancel editing" style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} accessibilityLabel="Save profile" style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
                <Text style={styles.saveText}>Save profile</Text>
                <MaterialIcons name="check" size={16} color="#4A4210" />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function move(photos: ProfilePhoto[], index: number, offset: number): ProfilePhoto[] {
  const target = index + offset;
  if (target < 0 || target >= photos.length) return photos;
  const next = [...photos];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

function removePhoto(profile: EditableProfile, photoId: string): EditableProfile {
  const photos = profile.photos.filter((photo) => photo.id !== photoId);
  return { ...profile, photos, primaryPhotoId: profile.primaryPhotoId === photoId ? (photos[0]?.id ?? null) : profile.primaryPhotoId };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(77, 71, 43, 0.22)" },
  sheet: { flexShrink: 1, overflow: "hidden", borderRadius: 25, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), shadowColor: "#534c2e", shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: "rgba(219, 215, 192, 0.55)" },
  headerText: { flex: 1 },
  eyebrow: { color: "#5F5D57", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  title: { color: "#4a483a", fontSize: 16, fontWeight: "700", marginTop: 3 },
  completeness: { minWidth: 40, height: 26, borderRadius: 10, backgroundColor: "rgba(242, 236, 202, 0.92)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  completenessText: { color: "#7C6C1D", fontSize: 12, fontWeight: "800" },
  close: { width: 31, height: 31, borderRadius: 12, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.43)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), alignItems: "center", justifyContent: "center" },
  body: { padding: 16, paddingBottom: 8 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#EAF4EF" },
  badgePhone: { backgroundColor: glassNestedFill("#EDF1F4") },
  badgeText: { color: "#477463", fontSize: 12, fontWeight: "600" },
  badgeTextPhone: { color: "#5F6E7A" },
  verifyButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.64)") },
  verifyButtonText: { color: "#4A4210", fontSize: 12, fontWeight: "700" },
  sectionLabel: { color: "#5F5D57", fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 15, marginBottom: 7 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoTile: { width: 78, height: 78, borderRadius: 15, overflow: "hidden", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), backgroundColor: "rgba(242, 236, 202, 0.9)" },
  photoImage: { width: "100%", height: "100%" },
  primaryFlag: { position: "absolute", left: 4, top: 4, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: "rgba(112, 165, 139, 0.94)" },
  primaryFlagText: { color: "#43423d", fontSize: 12, fontWeight: "800" },
  primaryAction: { position: "absolute", right: 4, top: 4, width: 20, height: 20, borderRadius: 8, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.43)"), alignItems: "center", justifyContent: "center" },
  photoControls: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "space-between", backgroundColor: glassNestedFill("rgba(252, 250, 242, 0.86)") },
  photoControl: { flex: 1, height: 21, alignItems: "center", justifyContent: "center" },
  photoControlDisabled: { opacity: 0.35 },
  addPhoto: { width: 78, height: 78, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.62)"), borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(217, 206, 155, 0.95)" },
  addPhotoText: { color: "#6E6C67", fontSize: 12, fontWeight: "600" },
  hint: { color: "#5F5D57", fontSize: 12, lineHeight: 17, marginTop: 7 },
  input: { minHeight: 40, borderRadius: 13, paddingHorizontal: 12, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.7)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), color: "#53514C", fontSize: 12 },
  bioInput: { minHeight: 70, paddingTop: 10, textAlignVertical: "top" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusEmojiButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), shadowColor: "#68613d", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  statusEmojiText: { fontSize: 17 },
  statusInput: { flex: 1 },
  statusPreviewLabel: { color: "#5F5D57", fontSize: 12, fontWeight: "700", letterSpacing: 0.9, marginTop: 12 },
  statusPreview: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(246, 240, 209, 0.72)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)") },
  statusPreviewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E9D177" },
  statusPreviewText: { flex: 1, color: "#68655e", fontSize: 12, fontWeight: "600" },
  statusClear: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 8 },
  statusClearText: { color: "#5F5D57", fontSize: 12, fontWeight: "600" },
  lockedField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(239, 237, 225, 0.8)" },
  lockedValue: { color: "#5F5D57", fontSize: 12.5, fontWeight: "700" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.66)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  chipActive: { backgroundColor: "rgba(239, 232, 193, 0.96)", borderColor: "rgba(224, 211, 147, 1)" },
  chipText: { color: "#5F5D57", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#6f6740", fontWeight: "700" },
  fieldError: { color: "#7C6C1D", fontSize: 12, lineHeight: 17, marginTop: 6 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 14, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  switchText: { flex: 1 },
  switchTitle: { color: "#53514C", fontSize: 12, fontWeight: "700" },
  switchSub: { color: "#6E6C67", fontSize: 12, marginTop: 3 },
  privacyHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingHorizontal: 11, paddingVertical: 11, borderRadius: 14, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  privacyTitle: { flex: 1, color: "#53514C", fontSize: 12, fontWeight: "700" },
  privacySummary: { color: "#5F5D57", fontSize: 12 },
  privacyBody: { paddingHorizontal: 2 },
  blockList: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 14, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  blockListText: { flex: 1, color: "#53514C", fontSize: 12, fontWeight: "700" },
  blockListCount: { color: "#5F5D57", fontSize: 12 },
  footer: { flexDirection: "row", gap: 9, padding: 14, borderTopWidth: 1, borderTopColor: "rgba(219, 215, 192, 0.55)" },
  ghostButton: { flex: 1, minHeight: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)") },
  ghostText: { color: "#7C6C1D", fontSize: 12, fontWeight: "700" },
  saveButton: { flex: 1.4, minHeight: 42, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.64)"), shadowColor: "#5c5634", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  saveText: { color: "#4A4210", fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});
