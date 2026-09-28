import { glassNestedFill } from "@/lib/appearance-preferences";
import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
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
        <BlurView intensity={32} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.glassCard}>
          <View style={styles.cardContent}>
            <View style={styles.iconHalo}><MaterialIcons name={slide.icon} size={25} color="#83721f" /></View>
            <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
            <View style={styles.ruleCard}>
              <View style={styles.ruleIcon}><MaterialIcons name={index === 2 ? "shield" : "favorite-border"} size={17} color={index === 2 ? "#6F94A3" : "#83721f"} /></View>
              <View style={styles.ruleCopy}><Text style={styles.ruleTitle}>{slide.ruleTitle}</Text><Text style={styles.ruleBody}>{slide.ruleBody}</Text></View>
            </View>
            <View style={styles.stepLabel}><Text style={styles.stepText}>A KINDER WAY TO CONNECT</Text><Text style={styles.stepNumber}>0{index + 1} / 0{ safetyOnboardingSlides.length }</Text></View>
          </View>
        </BlurView>
      </Animated.View>
      <View style={styles.controls}>
        {index > 0 ? <Pressable onPress={goBack} accessibilityRole="button" style={styles.backButton}><MaterialIcons name="arrow-back" size={16} color="#827e75" /><Text style={styles.backText}>Back</Text></Pressable> : <View style={styles.backPlaceholder} />}
        <Pressable onPress={advance} accessibilityRole="button" style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}>
          <Text style={styles.nextText}>{index === safetyOnboardingSlides.length - 1 ? "Continue with phone" : "Continue"}</Text>
          <MaterialIcons name="arrow-forward" size={16} color="#4A4210" />
        </Pressable>
      </View>
      <Text style={styles.swipeHint}>Swipe gently or use the arrows to continue</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", paddingTop: 5 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  progressTrack: { flex: 1, height: 4, borderRadius: 3, backgroundColor: "rgba(233, 209, 119, 0.24)" },
  progressTrackActive: { backgroundColor: "#F1DE55" },
  slideAnimated: { width: "100%" },
  glassCard: { overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)") },
  cardContent: { paddingHorizontal: 17, paddingTop: 18, paddingBottom: 14 },
  iconHalo: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(241, 233, 192, 0.9)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.9)") },
  eyebrow: { color: "#83721f", fontSize: 8, fontWeight: "700", letterSpacing: 1.05, marginTop: 16 },
  title: { color: "#474536", fontSize: 24, lineHeight: 29, letterSpacing: -0.65, fontWeight: "700", marginTop: 4 },
  body: { color: "#86847c", fontSize: 11, lineHeight: 17, marginTop: 7 },
  ruleCard: { flexDirection: "row", gap: 9, padding: 11, borderRadius: 15, marginTop: 17, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.40)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)") },
  ruleIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#f3edd2", alignItems: "center", justifyContent: "center" },
  ruleCopy: { flex: 1, gap: 3 },
  ruleTitle: { color: "#57554f", fontSize: 10, fontWeight: "700" },
  ruleBody: { color: "#8e8c85", fontSize: 8, lineHeight: 13 },
  stepLabel: { flexDirection: "row", justifyContent: "space-between", marginTop: 13 },
  stepText: { color: "#a6a39c", fontSize: 7, letterSpacing: 0.7, fontWeight: "700" },
  stepNumber: { color: "#83721f", fontSize: 7, fontWeight: "700" },
  controls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 10 },
  backButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8 },
  backText: { color: "#858278", fontSize: 10, fontWeight: "600" },
  backPlaceholder: { width: 58 },
  nextButton: { minHeight: 44, flex: 1, maxWidth: 220, borderRadius: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#F1DE55", paddingHorizontal: 13 },
  nextText: { color: "#4A4210", fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  swipeHint: { color: "#a2a19b", fontSize: 7, textAlign: "center", marginTop: 10 },
});
