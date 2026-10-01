import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

import { COMPANY_DETAILS, GUEST_MODE_NOTICE, WELCOME_SLIDES, clampSlideIndex } from "@/lib/welcome-intro";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";

const ambientLoop = require("../assets/audio/ambient-welcome.mp3");

/** Fixed bubble field keeps the drift deterministic between renders. */
const BUBBLES = [
  { left: "6%", size: 78, delay: 0, duration: 9000, drift: 92, tint: "rgba(231, 218, 155, 0.55)" },
  { left: "22%", size: 46, delay: 1400, duration: 11000, drift: 128, tint: "rgba(203, 222, 234, 0.55)" },
  { left: "38%", size: 96, delay: 2600, duration: 12500, drift: 74, tint: "rgba(234, 228, 193, 0.5)" },
  { left: "54%", size: 58, delay: 800, duration: 10200, drift: 142, tint: "rgba(210, 226, 231, 0.5)" },
  { left: "70%", size: 84, delay: 2100, duration: 11800, drift: 96, tint: "rgba(235, 221, 156, 0.5)" },
  { left: "86%", size: 40, delay: 3300, duration: 9400, drift: 118, tint: "rgba(206, 224, 236, 0.55)" },
  { left: "14%", size: 64, delay: 4200, duration: 13200, drift: 88, tint: "rgba(231, 225, 197, 0.45)" },
  { left: "62%", size: 34, delay: 5200, duration: 10600, drift: 132, tint: "rgba(214, 228, 234, 0.5)" },
] as const;

const SLIDE_TINTS: Record<string, string> = {
  sky: "#E4EFF5",
  blush: "#f3ecc5",
  sage: "#E7F1EA",
};

export function WelcomeScreen({
  onSignUp,
  onLogIn,
  onContinueAsGuest,
  soundEnabledByDefault = false,
}: {
  onSignUp: () => void;
  onLogIn: () => void;
  onContinueAsGuest: () => void;
  soundEnabledByDefault?: boolean;
}) {
  const { glassOpacity } = useAppAppearance();
  const { width } = useWindowDimensions();
  const [slide, setSlide] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(soundEnabledByDefault);
  const [soundUnavailable, setSoundUnavailable] = useState(false);
  const [carouselWidth, setCarouselWidth] = useState(0);

  const player = useAudioPlayer(ambientLoop);
  const drift = useRef(BUBBLES.map(() => new Animated.Value(0))).current;
  const carousel = useRef<ScrollView | null>(null);

  const slideWidth = useMemo(() => (carouselWidth > 0 ? carouselWidth : Math.min(width, 460)), [carouselWidth, width]);

  useEffect(() => {
    const loops = drift.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(BUBBLES[index].delay),
          Animated.timing(value, { toValue: 1, duration: BUBBLES[index].duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: BUBBLES[index].duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [drift]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      player.loop = true;
      player.volume = 0.32;
    } catch {
      // Older web builds may not expose these setters; playback still works without looping.
    }
  }, [player]);

  useEffect(() => {
    if (!soundOn) return;
    try {
      player.play();
    } catch {
      setSoundUnavailable(true);
      setSoundOn(false);
    }
  }, [soundOn, player]);

  const tap = useCallback(() => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const toggleSound = () => {
    tap();
    if (soundOn) {
      try {
        player.pause();
      } catch {
        // Ignore pause failures on unsupported browsers.
      }
      setSoundOn(false);
      return;
    }
    setSoundOn(true);
  };

  const goToSlide = (index: number) => {
    const target = clampSlideIndex(index);
    setSlide(target);
    carousel.current?.scrollTo({ x: target * slideWidth, animated: true });
    tap();
  };

  const gate = () => {
    if (!termsAccepted) {
      setTermsOpen(true);
      return false;
    }
    return true;
  };

  const startSignUp = () => {
    if (!gate()) return;
    tap();
    onSignUp();
  };

  const startLogIn = () => {
    if (!gate()) return;
    tap();
    onLogIn();
  };

  return (
    <View style={styles.root}>
      {/*
        The night sky, fixed rather than paired with the cast: the welcome screen
        renders before a member has chosen anything, and its own wash already
        carries the light glass panel above it.
      */}
      <Image source={require("../assets/images/trufrenz-night.jpg")} style={styles.backdrop} resizeMode="cover" />
      <View style={styles.backdropWash} pointerEvents="none" />
      <View style={styles.bubbleField} pointerEvents="none">
        {BUBBLES.map((bubble, index) => (
          <Animated.View
            key={`${bubble.left}-${bubble.size}`}
            style={[
              styles.bubble,
              {
                left: bubble.left as unknown as number,
                width: bubble.size,
                height: bubble.size,
                borderRadius: bubble.size / 2,
                backgroundColor: bubble.tint,
                opacity: drift[index].interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }),
                transform: [
                  { translateY: drift[index].interpolate({ inputRange: [0, 1], outputRange: [0, -bubble.drift] }) },
                  { scale: drift[index].interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                ],
              },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.soundToggleWrap}>
            <Pressable
              onPress={toggleSound}
              accessibilityRole="switch"
              accessibilityState={{ checked: soundOn }}
              accessibilityLabel={soundOn ? "Turn ambient sound off" : "Turn ambient sound on"}
              style={({ pressed }) => [styles.soundToggle, pressed && styles.pressed]}
            >
              <MaterialIcons name={soundOn ? "volume-up" : "volume-off"} size={18} color="#6d6952" />
            </Pressable>
            <Text style={styles.soundHint}>{soundUnavailable ? "Sound unavailable here" : soundOn ? "Ambient on" : "Ambient off"}</Text>
          </View>
          <View style={styles.guestPill}>
            <MaterialIcons name="verified-user" size={13} color="#69808F" />
            <Text style={styles.guestPillText}>Verified friendships only</Text>
          </View>
        </View>

        <BlurView
          intensity={42}
          tint="light"
          experimentalBlurMethod="dimezisBlurView"
          style={[styles.glass, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.72)"), glassOpacity) }]}
        >
          <View style={styles.glassInner}>
            <View style={styles.brandMark}>
              <View style={styles.brandIcon}>
                <MaterialIcons name="spa" size={22} color="#4A4210" />
              </View>
            </View>
            <Text style={styles.brand}>Trufrenz</Text>
            <Text style={styles.tagline}>Your people. Real friendships.</Text>
            <Text style={styles.support}>A calm, safety-first circle for nearby friends — never a dating app.</Text>

            <Pressable
              onPress={startSignUp}
              accessibilityRole="button"
              accessibilityLabel="Sign up"
              style={({ pressed }) => [styles.primaryButton, !termsAccepted && styles.buttonMuted, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Sign Up</Text>
              <MaterialIcons name="arrow-forward" size={17} color="#4A4210" />
            </Pressable>

            <Pressable
              onPress={startLogIn}
              accessibilityRole="button"
              accessibilityLabel="Log in"
              style={({ pressed }) => [styles.ghostButton, !termsAccepted && styles.buttonMuted, pressed && styles.pressed]}
            >
              <Text style={styles.ghostButtonText}>Log In</Text>
            </Pressable>

            <Pressable onPress={() => { tap(); onContinueAsGuest(); }} accessibilityRole="button" accessibilityLabel="Continue as guest" style={({ pressed }) => [styles.guestLink, pressed && styles.pressed]}>
              <Text style={styles.guestLinkText}>Continue as guest</Text>
            </Pressable>
            <Text style={styles.guestNote}>Browse-only preview · no chatting until you join</Text>
          </View>
        </BlurView>

        <View style={styles.carouselBlock}>
          <View style={styles.carouselFrame} onLayout={(event) => setCarouselWidth(Math.round(event.nativeEvent.layout.width))}>
            <ScrollView
              ref={carousel}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) => setSlide(clampSlideIndex(event.nativeEvent.contentOffset.x / Math.max(slideWidth, 1)))}
              onMomentumScrollEnd={(event) => setSlide(clampSlideIndex(event.nativeEvent.contentOffset.x / Math.max(slideWidth, 1)))}
              style={styles.carousel}
            >
            {WELCOME_SLIDES.map((item) => (
              <View key={item.id} style={[styles.slide, { width: slideWidth }]}>
                <View style={[styles.slideIllustration, { backgroundColor: SLIDE_TINTS[item.tint] ?? "#f0eacb" }]}>
                  <MaterialIcons name={item.icon as keyof typeof MaterialIcons.glyphMap} size={26} color="#777152" />
                </View>
                <Text style={styles.slideTitle}>{item.title}</Text>
                <Text style={styles.slideBody}>{item.body}</Text>
              </View>
            ))}
            </ScrollView>
          </View>

          <View style={styles.dots}>
            {WELCOME_SLIDES.map((item, index) => (
              <Pressable
                key={`dot-${item.id}`}
                onPress={() => goToSlide(index)}
                accessibilityRole="button"
                accessibilityLabel={`Go to intro slide ${index + 1}: ${item.title}`}
                style={[styles.dot, slide === index && styles.dotActive]}
              />
            ))}
          </View>
          <Text style={styles.swipeHint}>Swipe gently, or tap a dot to move through the intro.</Text>
        </View>

        <BlurView
          intensity={30}
          tint="light"
          experimentalBlurMethod="dimezisBlurView"
          style={[styles.companyGlass, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.66)"), glassOpacity) }]}
        >
          <View style={styles.companyInner}>
            <Pressable
              onPress={() => { tap(); setTermsAccepted((current) => !current); }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel="Accept the terms and privacy policy"
              style={({ pressed }) => [styles.termsRow, pressed && styles.pressed]}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxOn]}>
                {termsAccepted ? <MaterialIcons name="check" size={14} color="#4A4210" /> : null}
              </View>
              <Text style={styles.termsText}>
                I agree to the Trufrenz Terms of Service and Privacy Policy, and I am {""}
                <Text style={styles.termsStrong}>18 or older</Text>.
              </Text>
            </Pressable>
            <Pressable onPress={() => { tap(); setTermsOpen(true); }} accessibilityRole="button" accessibilityLabel="Read the terms and privacy summary" style={({ pressed }) => [styles.termsLink, pressed && styles.pressed]}>
              <Text style={styles.termsLinkText}>Read Terms &amp; Privacy</Text>
            </Pressable>
            <View style={styles.companyLine}>
              <MaterialIcons name="apartment" size={13} color="#8a877f" />
              <Text style={styles.companyText}>
                {COMPANY_DETAILS.legalName} · {COMPANY_DETAILS.location}
              </Text>
            </View>
            <Text style={styles.companyTextSmall}>
              © {new Date().getFullYear()} {COMPANY_DETAILS.name} · {COMPANY_DETAILS.supportEmail}
            </Text>
          </View>
        </BlurView>
      </ScrollView>

      <Modal visible={termsOpen} transparent animationType="fade" onRequestClose={() => setTermsOpen(false)}>
        <View style={styles.termsShade}>
          <BlurView intensity={38} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.termsSheet, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(252, 250, 242, 0.93)"), glassOpacity) }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.termsHeader}>
                <Text style={styles.termsTitle}>Terms &amp; Privacy</Text>
                <Pressable onPress={() => setTermsOpen(false)} accessibilityLabel="Close terms" style={styles.termsClose}>
                  <MaterialIcons name="close" size={18} color="#726e59" />
                </Pressable>
              </View>
              <Text style={styles.termsBodyTitle}>Friendship only</Text>
              <Text style={styles.termsBody}>
                Trufrenz is for platonic friendship and group meetups. Romantic or dating use is not permitted, and we never show swipe or scoring mechanics.
              </Text>
              <Text style={styles.termsBodyTitle}>Verification</Text>
              <Text style={styles.termsBody}>
                Every profile shows how it was verified: phone, or phone plus ID/selfie match. Phone verification is required to create an account, and your number is never shown on your profile.
              </Text>
              <Text style={styles.termsBodyTitle}>Safety &amp; privacy</Text>
              <Text style={styles.termsBody}>
                Chats open only after a mutual yes. You share a broad area rather than a live pin, and you can pause discovery, appear offline, or report and block at any time.
              </Text>
              <Text style={styles.termsBodyTitle}>Guest preview</Text>
              <Text style={styles.termsBody}>{GUEST_MODE_NOTICE}</Text>
              <Text style={styles.termsBodyTitle}>Your data</Text>
              <Text style={styles.termsBody}>
                Appearance settings and demo preferences stay on this device. Identity documents are reviewed by our verification partner and are never shown to other members.
              </Text>
              <Pressable
                onPress={() => { tap(); setTermsAccepted(true); setTermsOpen(false); }}
                accessibilityRole="button"
                accessibilityLabel="Accept terms and continue"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Accept &amp; continue</Text>
              </Pressable>
              <Text style={styles.termsFootnote}>Prototype build: these summaries stand in for the full published policy.</Text>
            </ScrollView>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#f7f5ea" },
  backdrop: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.5 },
  backdropWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(250, 247, 235, 0.42)" },
  bubbleField: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  bubble: { position: "absolute", bottom: -60, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.7)") },
  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, gap: 14 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  soundToggleWrap: { alignItems: "center", gap: 4 },
  soundToggle: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"),
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"),
    shadowColor: "#68634e",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  soundHint: { color: "#DFE6EB", fontSize: 7.5 },
  guestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 13,
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.7)"),
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.95)"),
  },
  guestPillText: { color: "#6F7C88", fontSize: 8, fontWeight: "600" },
  glass: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"),
    shadowColor: "#57533d",
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  glassInner: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22, alignItems: "center" },
  brandMark: { alignItems: "center" },
  brandIcon: {
    width: 58,
    height: 58,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1DE55",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.85)"),
    shadowColor: "#746d45",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  brand: { color: "#4c4936", fontSize: 30, fontWeight: "800", letterSpacing: 0.4, marginTop: 12 },
  tagline: { color: "#77735a", fontSize: 13, fontWeight: "600", marginTop: 6, textAlign: "center" },
  support: { color: "#DFE6EB", fontSize: 9.5, lineHeight: 15, marginTop: 7, textAlign: "center", paddingHorizontal: 6 },
  primaryButton: {
    minHeight: 50,
    width: "100%",
    marginTop: 20,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F1DE55",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.55)"),
    shadowColor: "#756e46",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: { color: "#4A4210", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  ghostButton: {
    minHeight: 48,
    width: "100%",
    marginTop: 10,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.5)"),
    borderWidth: 1,
    borderColor: "rgba(131, 114, 31, 0.5)",
  },
  ghostButtonText: { color: "#776f44", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  buttonMuted: { opacity: 0.62 },
  guestLink: { marginTop: 14, paddingVertical: 4, paddingHorizontal: 10 },
  guestLinkText: { color: "#7C8A96", fontSize: 10.5, fontWeight: "700", textDecorationLine: "underline" },
  guestNote: { color: "#9b9891", fontSize: 8, marginTop: 3, textAlign: "center" },
  carouselBlock: { alignItems: "center", gap: 2 },
  carouselFrame: { width: "100%", height: 172 },
  carousel: { width: "100%", height: "100%" },
  slide: { alignItems: "center", paddingHorizontal: 14, gap: 8 },
  slideIllustration: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.95)"),
    shadowColor: "#6a664e",
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  slideTitle: { color: "#54513e", fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 4 },
  slideBody: { color: "#8a877d", fontSize: 9.5, lineHeight: 15, textAlign: "center", paddingHorizontal: 8 },
  dots: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(131, 114, 31, 0.32)" },
  dotActive: { width: 20, backgroundColor: "#F1DE55" },
  swipeHint: { color: "#9b9891", fontSize: 7.5, marginTop: 3, marginBottom: 4 },
  companyGlass: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.95)"),
    shadowColor: "#5c5742",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  companyInner: { paddingHorizontal: 14, paddingVertical: 13, gap: 7 },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 1.4,
    borderColor: "rgba(131, 114, 31, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.8)"),
  },
  checkboxOn: { backgroundColor: "#F1DE55", borderColor: "#F1DE55" },
  termsText: { flex: 1, color: "#7d7b72", fontSize: 8.5, lineHeight: 14 },
  termsStrong: { color: "#686249", fontWeight: "700" },
  termsLink: { alignSelf: "flex-start", paddingVertical: 2 },
  termsLinkText: { color: "#776f44", fontSize: 8.5, fontWeight: "700", textDecorationLine: "underline" },
  companyLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  companyText: { color: "#8a877f", fontSize: 8 },
  companyTextSmall: { color: "#9e9b93", fontSize: 7.5 },
  termsShade: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingVertical: 44, backgroundColor: "rgba(53, 50, 31, 0.3)" },
  termsSheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "100%",
    borderRadius: 26,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"),
    shadowColor: "#4f4b36",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  termsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  termsTitle: { color: "#4c4936", fontSize: 17, fontWeight: "800" },
  termsClose: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.40)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.95)") },
  termsBodyTitle: { color: "#5c5946", fontSize: 10.5, fontWeight: "700", marginTop: 10 },
  termsBody: { color: "#DFE6EB", fontSize: 9.5, lineHeight: 15, marginTop: 3 },
  termsFootnote: { color: "#9f9c95", fontSize: 8, marginTop: 10, textAlign: "center" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
