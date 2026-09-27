/**
 * Manage Subscription.
 *
 * The screen a member opens when they want to know what they are paying for.
 * It answers the four questions support gets asked most: which plan am I on,
 * when does it renew, how do I stop it, and where did my purchase go after I
 * reinstalled.
 *
 * Two honest constraints shape the copy here:
 *
 * - Cancelling happens in the store, not in the app. Both stores require that,
 *   so the screen explains where to go rather than pretending to have a cancel
 *   button that works.
 * - A cancellation does not end the plan immediately. The member keeps what they
 *   paid for until the period runs out, and the screen says so.
 */

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import Constants from "expo-constants";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { useAppAppearance } from "@/lib/appearance-context";
import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import {
  PLANS,
  planPriceLine,
  type PlanId,
  type Subscription,
} from "@/lib/subscription";
import {
  CANCEL_EXPLAINER,
  REFUND_LINE,
  activePlanLine,
  chargeLine,
  periodLine,
  storeManagementLine,
  type RestoreState,
  type StoreChannel,
} from "@/lib/subscription-store";
import { storeManageActionLabel, storeManageLink, storeManageStepsText } from "@/lib/store-links";

export type ReceiptSummary = {
  id: number;
  channel: StoreChannel;
  productId: string;
  status: string;
  expiresAt: string;
  autoRenewing: boolean;
  cancelledAt: string | null;
  verifiedBy: string;
};

type Props = {
  visible: boolean;
  subscription: Subscription;
  /** Verified purchases on file, newest first. Empty until the server answers. */
  receipts: ReceiptSummary[];
  /** Which store this build sells through. */
  channel: StoreChannel;
  /** "store" once the server verifies against the real API, "sandbox" until then. */
  verification: "store" | "sandbox";
  restore: RestoreState;
  restoring: boolean;
  onClose: () => void;
  /** Opens the paywall on a specific plan. */
  onChangePlan: (planId: PlanId) => void;
  onRestore: () => void;
  /** Called after the member confirms the store has stopped the renewal. */
  onReportCancelled: () => Promise<void> | void;
};

/** One row on the details card. */
function DetailRow({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning";
}) {
  const color = tone === "positive" ? "#4E8567" : tone === "warning" ? "#A5763F" : "#5F5766";
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon} size={15} color="#8E7894" />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, { color }]}>{value}</Text>
    </View>
  );
}

export function ManageSubscriptionModal({
  visible,
  subscription,
  receipts,
  channel,
  verification,
  restore,
  restoring,
  onClose,
  onChangePlan,
  onRestore,
  onReportCancelled,
}: Props) {
  const layout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reportingCancel, setReportingCancel] = useState(false);

  const hapticTap = () => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const active = subscription.tier === "premium";
  const premium = useMemo(() => active, [active]);
  const cancelled = useMemo(() => Boolean(subscription.cancelledAt), [subscription.cancelledAt]);
  const renewal = useMemo(() => periodLine(subscription), [subscription]);
  const panelColor = glassSurfaceColor("#FFFFFF", glassOpacity);

  const reportCancel = async () => {
    setReportingCancel(true);
    try {
      await onReportCancelled();
    } finally {
      setReportingCancel(false);
      setConfirmingCancel(false);
    }
  };

  /**
   * Open the store's subscription screen, since that is where cancelling
   * actually happens. Candidates are tried in order and a failure is silent:
   * the written steps sit directly below the button, so the member is never
   * left with a tap that did nothing and no other way forward.
   */
  const openStoreManagement = async () => {
    const link = storeManageLink(Platform.OS, {
      androidPackage: Constants.expoConfig?.android?.package ?? null,
      iosBundleId: Constants.expoConfig?.ios?.bundleIdentifier ?? null,
    });
    for (const url of link.urls) {
      try {
        await Linking.openURL(url);
        hapticTap();
        return;
      } catch {
        // Try the next candidate.
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingHorizontal: layout.horizontalGutter, paddingVertical: layout.verticalGutter }]}>
        <View
          style={[
            styles.sheet,
            {
              maxWidth: layout.maxWidth,
              maxHeight: layout.maxHeight,
              backgroundColor: panelColor,
            },
          ]}
        >
          <BlurView intensity={46} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.headerBadge}>
              <MaterialIcons name={premium ? "workspace-premium" : "card-giftcard"} size={18} color="#7A5F74" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Manage subscription</Text>
              <Text style={styles.subtitle}>
                {premium ? "Your Trufrenz Premium plan" : "You are on the free plan"}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                hapticTap();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close manage subscription"
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <MaterialIcons name="close" size={17} color="#6C6270" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* -------------------------- current plan -------------------------- */}
            <View style={styles.planCard}>
              <View style={styles.planCardTop}>
                <View style={styles.planCardText}>
                  <Text style={styles.planCardTitle}>{activePlanLine(subscription)}</Text>
                  <Text style={styles.planCardSub}>
                    {premium ? renewal || "Active" : `Free plan · Premium starts at ${planPriceLine(PLANS[0])}`}
                  </Text>
                </View>
                <View style={[styles.tierPill, premium ? styles.tierPillPremium : styles.tierPillFree]}>
                  <Text style={[styles.tierPillText, premium ? styles.tierPillTextPremium : styles.tierPillTextFree]}>
                    {premium ? "Premium" : "Free"}
                  </Text>
                </View>
              </View>

              {premium ? (
                <>
                  <View style={styles.detailList}>
                    <DetailRow icon="repeat" label="Billing" value={chargeLine(subscription.planId)} />
                    <DetailRow
                      icon="event"
                      label="Renews"
                      value={
                        subscription.renewsOn
                          ? new Date(subscription.renewsOn).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"
                      }
                    />
                    <DetailRow
                      icon="autorenew"
                      label="Auto-renew"
                      value={cancelled ? "Stopped" : subscription.autoRenewing ? "On" : "Off"}
                      tone={cancelled ? "warning" : "positive"}
                    />
                    <DetailRow
                      icon="verified-user"
                      label="Receipt"
                      value={verification === "store" ? "Verified with store" : "Verified (sandbox)"}
                      tone="positive"
                    />
                  </View>
                  {cancelled ? (
                    <View style={styles.noticeCard}>
                      <MaterialIcons name="info-outline" size={14} color="#8A6A3E" />
                      <Text style={styles.noticeText}>
                        Auto-renew is off. Premium stays on until {subscription.renewsOn ? new Date(subscription.renewsOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "the period ends"}, then your account returns to the free plan.
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.detailList}>
                  <DetailRow icon="check" label="Included" value="Chats, friends, meetups, groups" />
                  <DetailRow icon="lock-outline" label="Premium adds" value="Calls, live map, 100 per group" />
                </View>
              )}
            </View>

            {/* --------------------------- restore ----------------------------- */}
            <Text style={styles.sectionLabel}>PURCHASES ON THIS DEVICE</Text>
            <View style={styles.receiptCard}>
              {receipts.length === 0 ? (
                <Text style={styles.emptyReceipts}>
                  No purchases are on file for this account yet. If you bought Premium before, restore it below.
                </Text>
              ) : (
                receipts.map((receipt, index) => (
                  <View
                    key={receipt.id}
                    style={[styles.receiptRow, index > 0 && styles.receiptDivider]}
                  >
                    <MaterialIcons
                      name={receipt.channel === "play" ? "android" : "phone-iphone"}
                      size={15}
                      color="#8E7894"
                    />
                    <View style={styles.receiptText}>
                      <Text style={styles.receiptTitle}>
                        {PLANS.find((plan) => plan.id === receipt.productId.split(".").pop())?.label ?? "Premium"}
                        {receipt.cancelledAt ? " · cancelled" : ""}
                      </Text>
                      <Text style={styles.receiptSub}>
                        {receipt.verifiedBy === "store" ? "Store-verified" : "Verified (sandbox)"} ·{" "}
                        {new Date(receipt.expiresAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, receipt.autoRenewing ? styles.statusActive : styles.statusStopped]}>
                      <Text style={[styles.statusText, receipt.autoRenewing ? styles.statusTextActive : styles.statusTextStopped]}>
                        {receipt.autoRenewing ? "Active" : "Ends soon"}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              <Pressable
                onPress={() => {
                  hapticTap();
                  onRestore();
                }}
                disabled={restoring}
                accessibilityRole="button"
                accessibilityState={{ disabled: restoring, busy: restoring }}
                accessibilityLabel="Restore purchases"
                style={({ pressed }) => [styles.secondaryButton, restoring && styles.buttonBusy, pressed && styles.pressed]}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color="#7A5F74" />
                ) : (
                  <>
                    <MaterialIcons name="restore" size={15} color="#7A5F74" />
                    <Text style={styles.secondaryButtonText}>Restore purchases</Text>
                  </>
                )}
              </Pressable>
              {restore.status !== "idle" && restore.status !== "checking" ? (
                <Text
                  style={[
                    styles.restoreNote,
                    restore.status === "restored" && styles.restoreNoteOk,
                    restore.status === "failed" && styles.restoreNoteBad,
                  ]}
                >
                  {restore.message}
                </Text>
              ) : null}
            </View>

            {/* ------------------------ change or cancel ----------------------- */}
            {premium ? (
              <>
                <Text style={styles.sectionLabel}>CHANGE PLAN</Text>
                <View style={styles.changeRow}>
                  {PLANS.filter((plan) => plan.id !== subscription.planId).map((plan) => (
                    <Pressable
                      key={plan.id}
                      onPress={() => {
                        hapticTap();
                        onChangePlan(plan.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Switch to the ${plan.label} plan`}
                      style={({ pressed }) => [styles.changeCard, pressed && styles.pressed]}
                    >
                      <Text style={styles.changeName}>{plan.label}</Text>
                      <Text style={styles.changePrice}>{planPriceLine(plan)}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>CANCELLING</Text>
                <View style={styles.cancelCard}>
                  <Text style={styles.cancelBody}>{CANCEL_EXPLAINER}</Text>
                  {/*
                    This used to be a sentence naming the store, with an
                    open-in-new icon that suggested it was tappable. It was not.
                    Now the tap opens the store's own subscriptions screen, and
                    the written route sits underneath for a device where the
                    installed-app scheme cannot open — so the instruction is
                    followed by the way to act on it, either way.
                  */}
                  <Pressable
                    onPress={() => void openStoreManagement()}
                    accessibilityRole="link"
                    accessibilityLabel={storeManageActionLabel(Platform.OS)}
                    style={({ pressed }) => [styles.storeHint, pressed && styles.pressed]}
                  >
                    <MaterialIcons name="open-in-new" size={13} color="#8A8391" />
                    <Text style={styles.storeHintTextLinked}>{storeManagementLine(channel)}</Text>
                  </Pressable>
                  <Text style={styles.storeStepsText}>{storeManageStepsText(Platform.OS)}</Text>

                  {confirmingCancel ? (
                    <View style={styles.confirmBox}>
                      <Text style={styles.confirmText}>
                        Confirm you have turned off auto-renew in your store account. Trufrenz will mark this plan as
                        cancelled and keep it active until the period ends.
                      </Text>
                      <View style={styles.confirmActions}>
                        <Pressable
                          onPress={() => setConfirmingCancel(false)}
                          accessibilityRole="button"
                          accessibilityLabel="Keep my subscription"
                          style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
                        >
                          <Text style={styles.ghostButtonText}>Keep it</Text>
                        </Pressable>
                        <Pressable
                          onPress={reportCancel}
                          disabled={reportingCancel}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: reportingCancel, busy: reportingCancel }}
                          accessibilityLabel="Confirm cancellation reported"
                          style={({ pressed }) => [styles.dangerButton, reportingCancel && styles.buttonBusy, pressed && styles.pressed]}
                        >
                          {reportingCancel ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.dangerButtonText}>Confirm</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        setConfirmingCancel(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="I cancelled in my store account"
                      style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.ghostButtonText}>I cancelled in my store account</Text>
                    </Pressable>
                  )}

                  <View style={styles.refundRow}>
                    <MaterialIcons name="help-outline" size={13} color="#8A8391" />
                    <Text style={styles.refundText}>{REFUND_LINE}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  hapticTap();
                  onChangePlan(subscription.planId);
                }}
                accessibilityRole="button"
                accessibilityLabel="Compare Premium plans"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <MaterialIcons name="workspace-premium" size={16} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Compare Premium plans</Text>
              </Pressable>
            )}

            <View style={styles.footerNote}>
              <MaterialIcons name="lock-outline" size={13} color="#8A8391" />
              <Text style={styles.footerNoteText}>
                {verification === "store"
                  ? "Every purchase is confirmed with your store before Premium turns on."
                  : "Store verification is running in sandbox mode on this build. Receipts are recorded but not charged."}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(48,38,52,0.34)",
  },
  sheet: {
    width: "100%",
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    shadowColor: "#4A3A50",
    shadowOpacity: 0.22,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(122,108,128,0.28)", marginTop: 9 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  headerBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: "#3F3548" },
  subtitle: { fontSize: 11.5, color: "#7A7284", marginTop: 2, lineHeight: 16 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 9 },
  planCard: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    gap: 10,
  },
  planCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  planCardText: { flex: 1 },
  planCardTitle: { fontSize: 14.5, fontWeight: "700", color: "#3F3548" },
  planCardSub: { fontSize: 11.5, color: "#7A7284", marginTop: 2 },
  tierPill: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 3 },
  tierPillPremium: { backgroundColor: "rgba(206,178,214,0.9)" },
  tierPillFree: { backgroundColor: "rgba(255,255,255,0.8)" },
  tierPillText: { fontSize: 10, fontWeight: "700" },
  tierPillTextPremium: { color: "#FFFFFF" },
  tierPillTextFree: { color: "#6C6270" },
  detailList: { gap: 7 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailLabel: { fontSize: 11.5, color: "#8A8391", width: 78 },
  detailValue: { flex: 1, fontSize: 11.5, fontWeight: "600" },
  noticeCard: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "rgba(250,240,224,0.82)",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  noticeText: { flex: 1, fontSize: 11, color: "#6E5636", lineHeight: 16 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.7, color: "#8A8391", marginTop: 5, marginLeft: 2 },
  receiptCard: {
    backgroundColor: "rgba(255,255,255,0.56)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    gap: 9,
  },
  emptyReceipts: { fontSize: 11.5, color: "#7A7284", lineHeight: 16 },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  receiptDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(140,128,146,0.22)", paddingTop: 9 },
  receiptText: { flex: 1 },
  receiptTitle: { fontSize: 12, fontWeight: "600", color: "#4A4254" },
  receiptSub: { fontSize: 10.5, color: "#8A8391", marginTop: 1 },
  statusPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  statusActive: { backgroundColor: "rgba(214,238,224,0.9)" },
  statusStopped: { backgroundColor: "rgba(250,240,224,0.95)" },
  statusText: { fontSize: 9.5, fontWeight: "700" },
  statusTextActive: { color: "#4E8567" },
  statusTextStopped: { color: "#A5763F" },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  secondaryButtonText: { fontSize: 12.5, fontWeight: "700", color: "#7A5F74" },
  restoreNote: { fontSize: 11, color: "#7A7284", lineHeight: 15 },
  restoreNoteOk: { color: "#4E8567", fontWeight: "600" },
  restoreNoteBad: { color: "#A5603F" },
  changeRow: { flexDirection: "row", gap: 8 },
  changeCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    gap: 3,
  },
  changeName: { fontSize: 12.5, fontWeight: "700", color: "#4A4254" },
  changePrice: { fontSize: 11, color: "#8A8391" },
  cancelCard: {
    backgroundColor: "rgba(255,255,255,0.56)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    gap: 9,
  },
  cancelBody: { fontSize: 11.5, color: "#5F5766", lineHeight: 16 },
  storeHint: { flexDirection: "row", alignItems: "center", gap: 6 },
  /*
   * The store row is a link, and it previously looked like one without being
   * one — an open-in-new icon beside instruction text. The affordance now
   * matches the behaviour, so the label is underlined and slightly darker.
   */
  storeHintTextLinked: { fontSize: 11, color: "#7C6A83", fontWeight: "700", textDecorationLine: "underline" },
  storeStepsText: {
    fontSize: 10.5,
    lineHeight: 15,
    color: "#8A8391",
    marginTop: 6,
  },
  confirmBox: { gap: 9, backgroundColor: "rgba(255,255,255,0.6)", borderRadius: 12, padding: 10 },
  confirmText: { fontSize: 11, color: "#5F5766", lineHeight: 15.5 },
  confirmActions: { flexDirection: "row", gap: 8 },
  ghostButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
  },
  ghostButtonText: { fontSize: 12, fontWeight: "700", color: "#6C6270" },
  dangerButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(201,129,145,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  dangerButtonText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  refundRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  refundText: { flex: 1, fontSize: 10.5, color: "#8A8391", lineHeight: 15 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#B08FA8",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  primaryButtonText: { fontSize: 13.5, fontWeight: "700", color: "#FFFFFF" },
  buttonBusy: { opacity: 0.7 },
  footerNote: { flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: 4 },
  footerNoteText: { flex: 1, fontSize: 10.5, color: "#8A8391", lineHeight: 15 },
  pressed: { opacity: 0.82 },
});
