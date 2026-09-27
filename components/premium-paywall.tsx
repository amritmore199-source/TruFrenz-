import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { useAppAppearance } from "@/lib/appearance-context";
import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { purchaseButtonLabel, purchaseInFlight, type PurchaseState } from "@/lib/subscription-store";
import {
  FEATURE_COMPARISON,
  LAUNCH_OFFERS,
  PLANS,
  formatInr,
  launchAnnualPriceInr,
  monthlyEquivalent,
  planPriceLine,
  planSavingLine,
  renewalLine,
  savingsPercent,
  type PlanId,
  type Subscription,
} from "@/lib/subscription";

type Props = {
  visible: boolean;
  subscription: Subscription;
  /** Which plan the paywall opens on, usually set by whatever limit was hit. */
  initialPlanId?: PlanId;
  /** The limit that brought the member here, shown above the plans. */
  reason?: string;
  onClose: () => void;
  onPurchase: (planId: PlanId) => Promise<void> | void;
  /**
   * Where the purchase actually is. The app screen owns this, because it is the
   * one talking to the store and the server; the paywall only reports it.
   */
  purchase: PurchaseState;
};

/** Padded, honest copy about where the money actually goes. */
const PAYMENT_NOTE =
  "Subscriptions are bought inside the app through Google Play Billing or Apple In-App Purchase. Your store account is charged at confirmation, and you can cancel any time from the store.";

export function PremiumPaywall({
  visible,
  subscription,
  initialPlanId,
  reason,
  onClose,
  onPurchase,
  purchase,
}: Props) {
  const layout = useResponsiveModalLayout();
  const { glassOpacity } = useAppAppearance();
  const [selected, setSelected] = useState<PlanId>(initialPlanId ?? "quarterly");
  const [busy, setBusy] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [launchWindowOpen, setLaunchWindowOpen] = useState(true);

  /** Light haptic on deliberate taps; silent on web, as elsewhere in the app. */
  const hapticTap = () => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // The plan the member was sent here for, or the default, is re-selected each
  // time the sheet opens so a previous choice never leaks into a new visit.
  useEffect(() => {
    if (visible) {
      setSelected(initialPlanId ?? "quarterly");
      setBusy(false);
      setShowAllFeatures(false);
    }
  }, [visible, initialPlanId]);

  const active = useMemo(() => subscription.tier === "premium", [subscription.tier]);
  const selectedPlan = useMemo(() => PLANS.find((plan) => plan.id === selected) ?? PLANS[0], [selected]);

  // Annual is the plan the launch discount applies to, so it shows the struck
  // price alongside the discounted one.
  const discounted = useMemo(() => {
    if (selectedPlan.id !== "annual") return null;
    const launch = launchAnnualPriceInr(20);
    return launch < selectedPlan.priceInr ? { launch, full: selectedPlan.priceInr } : null;
  }, [selectedPlan]);

  const rows = showAllFeatures ? FEATURE_COMPARISON : FEATURE_COMPARISON.filter((row) => row.free !== row.premium);

  // The launch window closes once the annual plan is no longer discounted, so
  // the button never quotes a price the store will not charge.
  useEffect(() => {
    setLaunchWindowOpen(discounted !== null);
  }, [discounted]);

  const confirm = async () => {
    if (busy || purchaseInFlight(purchase)) return;
    setBusy(true);
    hapticTap();
    try {
      await onPurchase(selected);
    } finally {
      setBusy(false);
    }
  };

  /*
   * The button's busy state has to cover the whole purchase, not just the tap.
   *
   * `busy` only spans the awaited `onPurchase` call. If that resolves as soon as
   * the store sheet closes while the server is still verifying the receipt, the
   * spinner stops and the button re-enables before Premium is granted — inviting
   * a second purchase on a plan already being processed, which is how a member
   * gets charged twice. `purchase.status` is owned by the app screen and stays
   * `pending`/`verifying` for that whole window, so it is the honest source and
   * the label already reads from it.
   */
  const inFlight = busy || purchaseInFlight(purchase);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close premium" />
        <View
          style={[styles.sheet, { maxWidth: layout.maxWidth, maxHeight: layout.maxHeight }]}
          accessibilityViewIsModal
        >
          <BlurView intensity={46} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glassSurfaceColor("rgba(252,249,252,0.92)", glassOpacity) }]} />

          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.crownBadge}>
              <MaterialIcons name="workspace-premium" size={18} color="#8E5F7E" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{active ? "You're on Trufrenz Premium" : "Trufrenz Premium"}</Text>
              <Text style={styles.subtitle}>
                {active
                  ? renewalLine(subscription) || "Everything is unlocked."
                  : "Calls, live map, read receipts, and room for 100 friends in a group."}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close premium" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <MaterialIcons name="close" size={17} color="#6D6178" />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {reason ? (
              <View style={styles.reasonCard}>
                <MaterialIcons name="info-outline" size={15} color="#8E7894" />
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ) : null}

            {active ? (
              <View style={styles.activeCard}>
                <MaterialIcons name="check-circle" size={17} color="#5C8F73" />
                <View style={styles.activeText}>
                  <Text style={styles.activeTitle}>Premium is active</Text>
                  <Text style={styles.activeSub}>
                    {renewalLine(subscription) ? `${renewalLine(subscription)} · ${selectedPlan.label}` : "Renews automatically."}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.sectionLabel}>CHOOSE A PLAN</Text>
                <View style={styles.planRow}>
                  {PLANS.map((plan) => {
                    const isSelected = plan.id === selected;
                    const saving = planSavingLine(plan);
                    return (
                      <Pressable
                        key={plan.id}
                        onPress={() => { setSelected(plan.id); hapticTap(); }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${plan.label}, ${planPriceLine(plan)}${saving ? `, ${saving}` : ""}`}
                        style={({ pressed }) => [styles.planCard, isSelected && styles.planCardSelected, pressed && styles.pressed]}
                      >
                        <Text style={[styles.planName, isSelected && styles.planNameSelected]}>{plan.label}</Text>
                        <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>{formatInr(plan.priceInr)}</Text>
                        <Text style={styles.planMeta}>
                          {plan.months === 1 ? "1 month" : `${plan.months} months`}
                        </Text>
                        {saving ? (
                          <View style={[styles.savePill, isSelected && styles.savePillSelected]}>
                            <Text style={[styles.savePillText, isSelected && styles.savePillTextSelected]}>{saving}</Text>
                          </View>
                        ) : (
                          <Text style={styles.planMetaQuiet}>Billed monthly</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.effectiveLine}>
                  {selectedPlan.label} works out to {formatInr(monthlyEquivalent(selectedPlan))} / month
                  {savingsPercent(selectedPlan) > 0 ? ` · ${planSavingLine(selectedPlan)}` : ""}
                </Text>

                {discounted ? (
                  <View style={styles.offerCard}>
                    <MaterialIcons name="local-offer" size={15} color="#8E5F7E" />
                    <Text style={styles.offerText}>
                      Launch discount: {formatInr(discounted.launch)} for the first year instead of{" "}
                      <Text style={styles.offerStrike}>{formatInr(discounted.full)}</Text>, for the first 90 days after launch.
                    </Text>
                  </View>
                ) : null}
              </>
            )}

            <Text style={styles.sectionLabel}>WHAT CHANGES</Text>
            <View style={styles.featureCard}>
              {rows.map((row, index) => (
                <View key={row.label} style={[styles.featureRow, index > 0 && styles.featureDivider]}>
                  <View style={styles.featureLabelWrap}>
                    <Text style={styles.featureLabel}>{row.label}</Text>
                    {row.free === row.premium ? (
                      <Text style={styles.featureBoth}>{row.free}</Text>
                    ) : (
                      <Text style={styles.featureFree}>Free: {row.free}</Text>
                    )}
                  </View>
                  {row.free === row.premium ? (
                    <MaterialIcons name="check" size={16} color="#8FA9A0" />
                  ) : (
                    <View style={styles.premiumCell}>
                      <MaterialIcons name="check" size={16} color="#5C8F73" />
                      <Text style={styles.premiumCellText}>{row.premium}</Text>
                    </View>
                  )}
                </View>
              ))}
              <Pressable
                onPress={() => { setShowAllFeatures((current) => !current); hapticTap(); }}
                accessibilityRole="button"
                accessibilityLabel={showAllFeatures ? "Show only what changes" : "Show everything both plans include"}
                style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}
              >
                <Text style={styles.moreText}>
                  {showAllFeatures ? "Show only what changes" : "Show everything both plans include"}
                </Text>
                <MaterialIcons name={showAllFeatures ? "expand-less" : "expand-more"} size={17} color="#8E7894" />
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>OFFERS</Text>
            <View style={styles.offerList}>
              {LAUNCH_OFFERS.map((offer) => (
                <View key={offer.id} style={styles.offerRow}>
                  <MaterialIcons name="star-outline" size={14} color="#B08FA8" />
                  <View style={styles.offerRowText}>
                    <Text style={styles.offerTitle}>{offer.title}</Text>
                    <Text style={styles.offerDetail}>{offer.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.paymentNote}>
              <MaterialIcons name="lock-outline" size={14} color="#8A8391" />
              <Text style={styles.paymentNoteText}>{PAYMENT_NOTE}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {active ? (
              <Pressable
                onPress={() => { hapticTap(); onClose(); }}
                accessibilityRole="button"
                accessibilityLabel="Keep premium"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Keep Premium</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={confirm}
                  disabled={inFlight}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: inFlight, busy: inFlight }}
                  accessibilityLabel={purchaseButtonLabel(purchase, selected, launchWindowOpen)}
                  style={({ pressed }) => [styles.primaryButton, inFlight && styles.primaryButtonBusy, pressed && styles.pressed]}
                >
                  {inFlight ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="workspace-premium" size={17} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>
                        {purchaseButtonLabel(purchase, selected, launchWindowOpen)}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.footerNote}>
                  {selectedPlan.label} · {planPriceLine(selectedPlan)} · cancel any time in your store account
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(48,38,52,0.34)" },
  sheet: { width: "100%", borderRadius: 26, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", shadowColor: "#4A3A50", shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(122,108,128,0.28)", marginTop: 9 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  crownBadge: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.85)", alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: "#3F3548" },
  subtitle: { fontSize: 11.5, color: "#7A7284", marginTop: 2, lineHeight: 16 },
  close: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 14, gap: 9 },
  reasonCard: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(255,255,255,0.6)", borderRadius: 14, padding: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.75)" },
  reasonText: { flex: 1, fontSize: 11.5, color: "#5F5766", lineHeight: 16 },
  activeCard: { flexDirection: "row", gap: 9, alignItems: "center", backgroundColor: "rgba(233,245,238,0.75)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  activeText: { flex: 1 },
  activeTitle: { fontSize: 13, fontWeight: "700", color: "#3F5548" },
  activeSub: { fontSize: 11.5, color: "#6B7D72", marginTop: 2 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.7, color: "#9A93A4", marginTop: 4 },
  planRow: { flexDirection: "row", gap: 8 },
  planCard: { flex: 1, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 9, alignItems: "center", backgroundColor: "rgba(255,255,255,0.56)", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)" },
  planCardSelected: { backgroundColor: "rgba(233,220,238,0.92)", borderColor: "#C9A9C6" },
  planName: { fontSize: 11.5, fontWeight: "700", color: "#5F5766" },
  planNameSelected: { color: "#6C4A66" },
  planPrice: { fontSize: 19, fontWeight: "700", color: "#463C50", marginTop: 4 },
  planPriceSelected: { color: "#5A3A55" },
  planMeta: { fontSize: 10, color: "#867E90", marginTop: 1 },
  planMetaQuiet: { fontSize: 9.5, color: "#A29AA9", marginTop: 3 },
  savePill: { marginTop: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: "rgba(255,255,255,0.75)" },
  savePillSelected: { backgroundColor: "#C9A9C6" },
  savePillText: { fontSize: 9.5, fontWeight: "700", color: "#7A5F74" },
  savePillTextSelected: { color: "#FFFFFF" },
  effectiveLine: { fontSize: 11, color: "#6F6879", textAlign: "center", marginTop: 1 },
  offerCard: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(247,236,244,0.8)", borderRadius: 14, padding: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  offerText: { flex: 1, fontSize: 11.5, color: "#5F4A5C", lineHeight: 16 },
  offerStrike: { textDecorationLine: "line-through", color: "#9A8A99" },
  featureCard: { backgroundColor: "rgba(255,255,255,0.56)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.72)", overflow: "hidden" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
  featureDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(140,128,146,0.22)" },
  featureLabelWrap: { flex: 1 },
  featureLabel: { fontSize: 12.5, fontWeight: "600", color: "#4A4254" },
  featureBoth: { fontSize: 10.5, color: "#8A8391", marginTop: 1 },
  featureFree: { fontSize: 10.5, color: "#9A8A99", marginTop: 1 },
  premiumCell: { alignItems: "flex-end", maxWidth: 128 },
  premiumCellText: { fontSize: 10.5, color: "#4E6B5C", marginTop: 1, textAlign: "right" },
  moreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(140,128,146,0.22)" },
  moreText: { fontSize: 11.5, fontWeight: "600", color: "#7A6280" },
  offerList: { gap: 7 },
  offerRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(255,255,255,0.5)", borderRadius: 13, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.7)" },
  offerRowText: { flex: 1 },
  offerTitle: { fontSize: 12, fontWeight: "700", color: "#4A4254" },
  offerDetail: { fontSize: 11, color: "#7A7284", marginTop: 2, lineHeight: 15.5 },
  paymentNote: { flexDirection: "row", gap: 7, alignItems: "flex-start", paddingHorizontal: 2, marginTop: 2 },
  paymentNoteText: { flex: 1, fontSize: 10.5, color: "#8A8391", lineHeight: 15 },
  footer: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 14, gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(140,128,146,0.24)", backgroundColor: "rgba(255,255,255,0.34)" },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 46, borderRadius: 16, backgroundColor: "#A2789B", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", shadowColor: "#6E4A69", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  primaryButtonBusy: { opacity: 0.8 },
  primaryButtonText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  footerNote: { fontSize: 10.5, color: "#7A7284", textAlign: "center" },
  pressed: { opacity: 0.82 },
});
