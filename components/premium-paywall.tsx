import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { GlassSurface } from "@/components/glass-surface";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { useAppAppearance } from "@/lib/appearance-context";
import { glassNestedSurfaceColor, glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { purchaseButtonLabel, purchaseInFlight, type PurchaseState } from "@/lib/subscription-store";
import { priceLineFor, savingLineFor, type StorePriceCatalogue } from "@/lib/store-prices";
import {
  FEATURE_COMPARISON,
  LAUNCH_OFFERS,
  PLANS,
  formatInr,
  launchAnnualPriceInr,
  monthlyEquivalent,
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
  /**
   * The store's own prices for this member's market, when it has them.
   *
   * Null is the normal state on web and in Expo Go, and simply means the rupee
   * catalogue is shown instead.
   */
  storePrices?: StorePriceCatalogue | null;
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
  storePrices = null,
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

  /*
   * The store's price wins over the catalogue everywhere a number is shown.
   *
   * A member paying in another currency must not be quoted rupees, and even in
   * India the store is authoritative — that is the figure that appears on their
   * statement. The catalogue still drives the maths whenever the store has not
   * quoted both plans in one currency, which is why the saving line is computed
   * by the same module rather than inline here.
   */
  const priceLines = useMemo(() => {
    const byPlan = new Map<PlanId, { line: string; saving: string; fromStore: boolean }>();
    for (const plan of PLANS) {
      const priced = priceLineFor(plan, storePrices);
      byPlan.set(plan.id, {
        line: priced.line,
        saving: savingLineFor(plan, storePrices),
        fromStore: priced.fromStore,
      });
    }
    return byPlan;
  }, [storePrices]);

  // Annual is the plan the launch discount applies to, so it shows the struck
  // price alongside the discounted one.
  const discounted = useMemo(() => {
    if (selectedPlan.id !== "annual") return null;
    const launch = launchAnnualPriceInr(20);
    return launch < selectedPlan.priceInr ? { launch, full: selectedPlan.priceInr } : null;
  }, [selectedPlan]);

  /*
   * Whether the rupee launch-offer comparison is safe to show.
   *
   * The struck-through price and its replacement are both rupee figures, and the
   * discount only exists if the store console actually carries that promotional
   * price. So the comparison is suppressed once the store has quoted the annual
   * plan in another currency: quoting "₹399 instead of ₹499" to someone being
   * charged in dollars would be a number they never pay. The store's own price,
   * with its own offer, is what they see.
   */
  const annualQuote = storePrices?.quotes.annual ?? null;
  const showRupeeDiscount =
    discounted !== null &&
    (!annualQuote || (annualQuote.currencyCode !== null && annualQuote.currencyCode === "INR"));

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
        <BlurView intensity={28} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close premium" />
        <View
          style={[styles.sheet, { maxWidth: layout.maxWidth, maxHeight: layout.maxHeight }]}
          accessibilityViewIsModal
        >
          <BlurView intensity={46} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(252, 250, 242, 0.92)"), glassOpacity) }]} />

          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={[styles.crownBadge, { backgroundColor: glassNestedSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.72)"), glassOpacity) }]}>
              <MaterialIcons name="workspace-premium" size={18} color="#796d32" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{active ? "You're on Trufrenz Premium" : "Trufrenz Premium"}</Text>
              <Text style={styles.subtitle}>
                {active
                  ? renewalLine(subscription) || "Everything is unlocked."
                  : "Calls, live map, read receipts, and room for 100 friends in a group."}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close premium" style={({ pressed }) => [styles.close, { backgroundColor: glassNestedSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.7)"), glassOpacity) }, pressed && styles.pressed]}>
              <MaterialIcons name="close" size={17} color="#6b664c" />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {reason ? (
              <View style={[styles.reasonCard, { backgroundColor: glassNestedSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.6)"), glassOpacity) }]}>
                <MaterialIcons name="info-outline" size={15} color="#83721f" />
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
                    const priced = priceLines.get(plan.id)!;
                    const saving = priced.saving;
                    return (
                      <Pressable
                        key={plan.id}
                        onPress={() => { setSelected(plan.id); hapticTap(); }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${plan.label}, ${priced.line}${saving ? `, ${saving}` : ""}`}
                        style={({ pressed }) => [styles.planCard, { backgroundColor: glassNestedSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.56)"), glassOpacity) }, isSelected && styles.planCardSelected, pressed && styles.pressed]}
                      >
                        <Text style={[styles.planName, isSelected && styles.planNameSelected]}>{plan.label}</Text>
                        <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                          {priced.fromStore ? priced.line.split(" / ")[0] : formatInr(plan.priceInr)}
                        </Text>
                        <Text style={styles.planMeta}>
                          {plan.months === 1 ? "1 month" : `${plan.months} months`}
                        </Text>
                        {saving ? (
                          <View style={[styles.savePill, { backgroundColor: glassNestedSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.75)"), glassOpacity) }, isSelected && styles.savePillSelected]}>
                            <Text style={[styles.savePillText, isSelected && styles.savePillTextSelected]}>{saving}</Text>
                          </View>
                        ) : (
                          <Text style={styles.planMetaQuiet}>Billed monthly</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/*
                  The per-month split is only shown when it is arithmetically
                  meaningful. It divides the rupee catalogue price, so if the
                  store has quoted this plan in another currency the split would
                  be computed from a figure the member is not paying — better to
                  show nothing than a confident wrong number.
                */}
                {!storePrices?.quotes[selectedPlan.id] ||
                storePrices.quotes[selectedPlan.id]?.currencyCode === "INR" ? (
                  <Text style={styles.effectiveLine}>
                    {selectedPlan.label} works out to {formatInr(monthlyEquivalent(selectedPlan))} / month
                    {savingsPercent(selectedPlan) > 0 ? ` · ${planSavingLine(selectedPlan)}` : ""}
                  </Text>
                ) : null}

                {discounted && showRupeeDiscount ? (
                  <View style={styles.offerCard}>
                    <MaterialIcons name="local-offer" size={15} color="#796d32" />
                    <Text style={styles.offerText}>
                      Launch discount: {formatInr(discounted.launch)} for the first year instead of{" "}
                      <Text style={styles.offerStrike}>{formatInr(discounted.full)}</Text>, for the first 90 days after launch.
                    </Text>
                  </View>
                ) : null}
              </>
            )}

            {/*
              The upgrade is sold on a *surface*, so the surface is shown.
              The feature list below says "ad-free" and leaves the member to
              imagine it; this renders the real ad-free card, built from the same
              glass primitives the app uses, at their own weight and cast. It is
              not an illustration of the benefit — it is the benefit, at the size
              it appears in the app, so nothing here can drift out of step with
              what they actually receive. The dismiss control is included because
              "no banner" is only meaningful once you have seen the banner.
            */}
            <Text style={styles.sectionLabel}>WHAT THE AD-FREE SCREEN LOOKS LIKE</Text>
            <GlassSurface surface="card" radius={14} style={styles.adFreeSample}>
              <View style={styles.adFreeBody}>
                <View style={styles.adFreeRow}>
                  <View style={styles.adFreeAvatar} />
                  <View style={styles.adFreeLines}>
                    <Text style={styles.adFreeName}>Maya Chen</Text>
                    <Text style={styles.adFreeCopy}>That little garden café was lovely</Text>
                  </View>
                  <View style={styles.adFreeDismiss}><MaterialIcons name="close" size={13} color="#8B8981" /></View>
                </View>
                <Text style={styles.adFreeNote}>No banner, no dismiss control, nothing to scroll past.</Text>
              </View>
            </GlassSurface>

            <Text style={styles.sectionLabel}>WHAT CHANGES</Text>
            <View style={[styles.featureCard, { backgroundColor: glassNestedSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.56)"), glassOpacity) }]}>
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
                    <MaterialIcons name="check" size={16} color="#788E86" />
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
                <MaterialIcons name={showAllFeatures ? "expand-less" : "expand-more"} size={17} color="#83721f" />
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>OFFERS</Text>
            <View style={styles.offerList}>
              {LAUNCH_OFFERS.map((offer) => (
                <View key={offer.id} style={[styles.offerRow, { backgroundColor: glassNestedSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.5)"), glassOpacity) }]}>
                  <MaterialIcons name="star-outline" size={14} color="#83721f" />
                  <View style={styles.offerRowText}>
                    <Text style={styles.offerTitle}>{offer.title}</Text>
                    <Text style={styles.offerDetail}>{offer.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.paymentNote}>
              <MaterialIcons name="lock-outline" size={14} color="#6E6C67" />
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
                    <ActivityIndicator color="#4A4210" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="workspace-premium" size={17} color="#4A4210" />
                      <Text style={styles.primaryButtonText}>
                        {purchaseButtonLabel(purchase, selected, launchWindowOpen)}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.footerNote}>
                  {selectedPlan.label} · {priceLines.get(selectedPlan.id)!.line} · cancel any time in your store account
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
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(45, 42, 23, 0.34)" },
  sheet: { width: "100%", borderRadius: 26, overflow: "hidden", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), shadowColor: "#454023", shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(118, 113, 91, 0.28)", marginTop: 9 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  crownBadge: { width: 34, height: 34, borderRadius: 12, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.85)"), alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: "#3f3920" },
  subtitle: { fontSize: 12, color: "#5F5D57", marginTop: 2, lineHeight: 17 },
  close: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.7)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.8)") },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 14, gap: 9 },
  /*
   * The ad-free sample. Deliberately the same shape and weight as a real chat row,
   * because the claim is about a surface rather than about a feature.
   */
  adFreeSample: { overflow: "hidden" },
  adFreeBody: { paddingHorizontal: 11, paddingVertical: 10, gap: 6 },
  adFreeRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  adFreeAvatar: { width: 30, height: 30, borderRadius: 11, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.9)") },
  adFreeLines: { flex: 1 },
  adFreeName: { fontSize: 12, fontWeight: "700", color: "#3F3D37" },
  adFreeCopy: { fontSize: 12, color: "#6E6C67", marginTop: 1 },
  adFreeDismiss: { width: 22, height: 22, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: glassNestedFill("rgba(140, 138, 130, 0.3)") },
  adFreeNote: { fontSize: 12, color: "#7C6C1D", fontWeight: "600" },
  reasonCard: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), borderRadius: 14, padding: 11, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.75)") },
  reasonText: { flex: 1, fontSize: 12, color: "#53514C", lineHeight: 17 },
  activeCard: { flexDirection: "row", gap: 9, alignItems: "center", backgroundColor: glassNestedFill("rgba(233, 245, 238, 0.75)"), borderRadius: 14, padding: 12, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.8)") },
  activeText: { flex: 1 },
  activeTitle: { fontSize: 13.5, fontWeight: "700", color: "#3F5548" },
  activeSub: { fontSize: 12, color: "#6E6C67", marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.7, color: "#7C6C1D", marginTop: 4 },
  planRow: { flexDirection: "row", gap: 8 },
  planCard: { flex: 1, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 9, alignItems: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.56)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.72)") },
  planCardSelected: { backgroundColor: "rgba(237, 225, 168, 0.92)", borderColor: "#968945" },
  planName: { fontSize: 12, fontWeight: "700", color: "#53514C" },
  planNameSelected: { color: "#5e5529" },
  planPrice: { fontSize: 19, fontWeight: "700", color: "#464026", marginTop: 4 },
  planPriceSelected: { color: "#4c451d" },
  planMeta: { fontSize: 12, color: "#6E6C67", marginTop: 1 },
  planMetaQuiet: { fontSize: 12, color: "#7C6C1D", marginTop: 3 },
  savePill: { marginTop: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.75)") },
  savePillSelected: { backgroundColor: "#c5b45b" },
  savePillText: { fontSize: 12, fontWeight: "700", color: "#6f6741" },
  savePillTextSelected: { color: "#4A4210" },
  effectiveLine: { fontSize: 12, color: "#6d6b63", textAlign: "center", marginTop: 1 },
  offerCard: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(246, 240, 209, 0.8)", borderRadius: 14, padding: 11, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.8)") },
  offerText: { flex: 1, fontSize: 12, color: "#575133", lineHeight: 17 },
  offerStrike: { textDecorationLine: "line-through", color: "#5F5D57" },
  featureCard: { backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.56)"), borderRadius: 16, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), overflow: "hidden" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
  featureDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(140, 128, 146, 0.22)" },
  featureLabelWrap: { flex: 1 },
  featureLabel: { fontSize: 13, fontWeight: "600", color: "#494532" },
  featureBoth: { fontSize: 12, color: "#5F5D57", marginTop: 1 },
  featureFree: { fontSize: 12, color: "#5F5D57", marginTop: 1 },
  premiumCell: { alignItems: "flex-end", maxWidth: 128 },
  premiumCellText: { fontSize: 12, color: "#4E6B5C", marginTop: 1, textAlign: "right" },
  moreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(140, 128, 146, 0.22)" },
  moreText: { fontSize: 12, fontWeight: "600", color: "#736b41" },
  offerList: { gap: 7 },
  offerRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.5)"), borderRadius: 13, padding: 10, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.7)") },
  offerRowText: { flex: 1 },
  offerTitle: { fontSize: 12.5, fontWeight: "700", color: "#494532" },
  offerDetail: { fontSize: 12, color: "#5F5D57", marginTop: 2, lineHeight: 17 },
  paymentNote: { flexDirection: "row", gap: 7, alignItems: "flex-start", paddingHorizontal: 2, marginTop: 2 },
  paymentNoteText: { flex: 1, fontSize: 12, color: "#5F5D57", lineHeight: 17 },
  footer: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 14, gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(140, 128, 146, 0.24)", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.34)") },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 46, borderRadius: 16, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.5)"), shadowColor: "#5f5528", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  primaryButtonBusy: { opacity: 0.8 },
  primaryButtonText: { fontSize: 14, fontWeight: "700", color: "#4A4210" },
  footerNote: { fontSize: 12, color: "#5F5D57", textAlign: "center" },
  pressed: { opacity: 0.82 },
});
