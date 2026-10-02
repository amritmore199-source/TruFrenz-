import { glassNestedFill } from "@/lib/appearance-preferences";
import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { GlassBlur } from "@/components/glass-blur";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { nextSafetySlide, previousSafetySlide, safetyOnboardingSlides } from "@/lib/onboarding-carousel";

export function SafetyOnboardingCarousel({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const touchStartX = useRef(0);
  const slide = safetyOnboardingSlides[index];

  const goTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= safetyOnboardingSlides.length) return;
    Animated.timing(opacity, { toValue: 0, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      setIndex(nextIndex);
      translateX.setValue(nextIndex > index ? 12 : -12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  };

  const advance = () => {
    const next = nextSafetySlide(index);
    if (next === null) onComplete();
    else goTo(next);
  };
  const goBack = () => goTo(previousSafetySlide(index));

  return (
    <View style={styles.container}>
      <View style={styles.progressRow} accessibilityLabel={`Safety introduction, step ${index + 1} of ${safetyOnboardingSlides.length}`}>
        {safetyOnboardingSlides.map((item, itemIndex) => (
          <Pressable key={item.eyebrow} accessibilityRole="button" accessibilityLabel={`Go to ${item.eyebrow.toLowerCase()} step`} onPress={() => goTo(itemIndex)} style={[styles.progressTrack, itemIndex <= index && styles.progressTrackActive]} />
        ))}
      </View>
      <Animated.View
        style={[styles.slideAnimated, { opacity, transform: [{ translateX }] }]}
        onTouchStart={(event) => { touchStartX.current = event.nativeEvent.pageX; }}
        onTouchEnd={(event) => {
          const delta = event.nativeEvent.pageX - touchStartX.current;
          if (delta < -55) advance();
          if (delta > 55 && index > 0) goBack();
        }}
      >
        <GlassBlur intensity={32} style={styles.glassCard}>
          <View style={styles.cardContent}>
            <View style={styles.iconHalo}><MaterialIcons name={slide.icon} size={25} color="#B8B8B8" /></View>
            <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
            <View style={styles.ruleCard}>
              <View style={styles.ruleIcon}><MaterialIcons name={index === 2 ? "shield" : "favorite-border"} size={17} color={index === 2 ? "#8E8E8E" : "#666666"} /></View>
              <View style={styles.ruleCopy}><Text style={styles.ruleTitle}>{slide.ruleTitle}</Text><Text style={styles.ruleBody}>{slide.ruleBody}</Text></View>
            </View>
            <View style={styles.stepLabel}><Text style={styles.stepText}>A KINDER WAY TO CONNECT</Text><Text style={styles.stepNumber}>0{index + 1} / 0{ safetyOnboardingSlides.length }</Text></View>
          </View>
        </GlassBlur>
      </Animated.View>
      <View style={styles.controls}>
        {index > 0 ? <Pressable onPress={goBack} accessibilityRole="button" style={styles.backButton}><MaterialIcons name="arrow-back" size={16} color="#D5DEE5" /><Text style={styles.backText}>Back</Text></Pressable> : <View style={styles.backPlaceholder} />}
        <Pressable onPress={advance} accessibilityRole="button" style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}>
          <Text style={styles.nextText}>{index === safetyOnboardingSlides.length - 1 ? "Continue with phone" : "Continue"}</Text>
          <MaterialIcons name="arrow-forward" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
      <Text style={styles.swipeHint}>Swipe gently or use the arrows to continue</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", paddingTop: 5 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  progressTrack: { flex: 1, height: 4, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.24)" },
  progressTrackActive: { backgroundColor: "#666666" },
  slideAnimated: { width: "100%" },
  glassCard: { overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)"), backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.17)") },
  cardContent: { paddingHorizontal: 17, paddingTop: 18, paddingBottom: 14 },
  iconHalo: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.9)", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  eyebrow: { color: "#B8B8B8", fontSize: 12, fontWeight: "700", letterSpacing: 1.05, marginTop: 16 },
  title: { color: "#EDF8FF", fontSize: 24, lineHeight: 29, letterSpacing: -0.65, fontWeight: "700", marginTop: 4 },
  body: { color: "#DFE9F0", fontSize: 12, lineHeight: 17, marginTop: 7 },
  ruleCard: { flexDirection: "row", gap: 9, padding: 11, borderRadius: 15, marginTop: 17, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.23)"), borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.16)") },
  ruleIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#535A5E", alignItems: "center", justifyContent: "center" },
  ruleCopy: { flex: 1, gap: 3 },
  ruleTitle: { color: "#E8F2FA", fontSize: 12, fontWeight: "700" },
  ruleBody: { color: "#DFE9F0", fontSize: 12, lineHeight: 17 },
  stepLabel: { flexDirection: "row", justifyContent: "space-between", marginTop: 13 },
  stepText: { color: "#DFE9F0", fontSize: 12, letterSpacing: 0.7, fontWeight: "700" },
  stepNumber: { color: "#B8B8B8", fontSize: 12, fontWeight: "700" },
  controls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 10 },
  backButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8 },
  backText: { color: "#DFE9F0", fontSize: 12, fontWeight: "600" },
  backPlaceholder: { width: 58 },
  nextButton: { minHeight: 44, flex: 1, maxWidth: 220, borderRadius: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#666666", paddingHorizontal: 13 },
  nextText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  swipeHint: { color: "#DFE9F0", fontSize: 12, textAlign: "center", marginTop: 10 },
});
