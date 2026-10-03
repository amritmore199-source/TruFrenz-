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
import { GlassBlur } from "@/components/glass-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

import { COMPANY_DETAILS, GUEST_MODE_NOTICE, WELCOME_SLIDES, clampSlideIndex } from "@/lib/welcome-intro";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import {
  GLASS_SHADOW,
  GLASS_SHADOW_OPACITY,
  ambientIntensityFor,
  glassAmbient,
  glassEdge,
  glassTranslucentPane,
  glassTextureInk,
  glassFieldBorder } from "@/lib/glass";
import { useAppAppearance } from "@/lib/appearance-context";
import { AmbientField } from "@/components/ambient-field";
import { GlassTexture } from "@/components/glass-texture";

const ambientLoop = require("../assets/audio/ambient-welcome.mp3");

/** Fixed bubble field keeps the drift deterministic between renders. */
const BUBBLES = [
  { left: "6%", size: 78, delay: 0, duration: 9000, drift: 92, tint: "rgba(255, 255, 255, 0.55)" },
  { left: "22%", size: 46, delay: 1400, duration: 11000, drift: 128, tint: "rgba(0, 0, 0, 0.10)" },
  { left: "38%", size: 96, delay: 2600, duration: 12500, drift: 74, tint: "rgba(255, 255, 255, 0.5)" },
  { left: "54%", size: 58, delay: 800, duration: 10200, drift: 142, tint: "rgba(0, 0, 0, 0.10)" },
  { left: "70%", size: 84, delay: 2100, duration: 11800, drift: 96, tint: "rgba(255, 255, 255, 0.5)" },
  { left: "86%", size: 40, delay: 3300, duration: 9400, drift: 118, tint: "rgba(0, 0, 0, 0.10)" },
  { left: "14%", size: 64, delay: 4200, duration: 13200, drift: 88, tint: "rgba(255, 255, 255, 0.45)" },
  { left: "62%", size: 34, delay: 5200, duration: 10600, drift: 132, tint: "rgba(0, 0, 0, 0.10)" },
] as const;

/*
 * The ink for anything that sits on the page rather than on a pane.
 *
 * The page is near-white paper, so its ink is dark. This is the same ramp the signed-in
 * app uses for its headings, kept here as a named pair so a page-level style cannot drift
 * back to white by being copied from a card-level one.
 */
const PAGE_INK = {
  strong: "#1C1B19",
  body: "#3F3D39",
} as const;

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
  const { glassOpacity, glassTint } = useAppAppearance();
  /* The member's cast, under the name the surfaces below use. This screen reads the
     stored appearance like every other screen does rather than shipping its own. */
  const cast = glassTint;
  /*
   * The welcome screen takes the profile intensity: it is a reading screen first —
   * three lines of copy and two buttons over the panel — so it wants the same
   * calm field the denser signed-in screens take, not the richest one.
   */
  const ambient = glassAmbient(glassTint, ambientIntensityFor("profile"));
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
      <Image source={require("../assets/images/trufrenz-art.jpg")} style={styles.backdrop} resizeMode="cover" />
      <View style={styles.backdropWash} pointerEvents="none" />
      {/*
        The same colour field the signed-in app lays behind its glass.
        Without it the first-run panels were diffusing the wash rather than a
        scene, which is the one place the app's own guidance says glass stops
        reading as glass. The member now meets the real material on the very
        first screen instead of a lighter imitation of it.
      */}
      <View style={styles.field} pointerEvents="none">
        <AmbientField warm={ambient.warm} cool={ambient.cool} soft={ambient.soft} />
      </View>
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
              <MaterialIcons name={soundOn ? "volume-up" : "volume-off"} size={18} color="#F5F5F7" />
            </Pressable>
            <Text style={styles.soundHint}>{soundUnavailable ? "Sound unavailable here" : soundOn ? "Ambient on" : "Ambient off"}</Text>
          </View>
          <View style={styles.guestPill}>
            <MaterialIcons name="verified-user" size={13} color="#F5F5F7" />
            <Text style={styles.guestPillText}>Verified friendships only</Text>
          </View>
        </View>

        {/*
          The panel is built the same way every other surface in the app is built,
          because it *is* the same surface. It had been a bare blur with a fill and a
          radius - no outer rim, no inner hairline, no sheen, no top glow, no shadow -
          so it rendered as a flat tinted rectangle while the cards behind the sign-in
          door were properly lit. On the first screen the member ever sees, that is the
          worst place to have been the one exception.
        */}
        <View
          style={[
            styles.glass,
            {
              backgroundColor: "transparent",
              borderColor: glassEdge("card", cast),
              shadowColor: GLASS_SHADOW,
              shadowOpacity: GLASS_SHADOW_OPACITY,
            },
          ]}
        >
          <GlassBlur
            intensity={42}
            fill={glassTranslucentPane(glassOpacity, cast)}
            texture={false}
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, styles.glassShape]}
          />
          {/* No white veil: it washed the see-through pane grey and reduced label contrast. */}
          {/* The tooth, so the pane reads as a material rather than as a flat field. It sits
              above the blur and below the content, because it belongs to the sheet. */}
          <GlassTexture color={glassTextureInk(cast)} radius={28} />
          <View style={styles.glassInner}>
            <View style={styles.brandMark}>
              <View style={styles.brandIcon}>
                <MaterialIcons name="spa" size={22} color="#FFFFFF" />
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
              <MaterialIcons name="arrow-forward" size={17} color="#FFFFFF" />
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
        </View>

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
                {/*
                  The tile is a pane like every other surface, so it takes the same fill
                  and the same white ink. It was a pale pastel with a white glyph, which
                  is white on #E4EFF5 - 1.1:1, and invisible.
                */}
                <View
                  style={[
                    styles.slideIllustration,
                    { backgroundColor: glassSurfaceColor(glassFieldBorder(), glassOpacity), borderColor: glassEdge("card", cast) },
                  ]}
                >
                  <MaterialIcons name={item.icon as keyof typeof MaterialIcons.glyphMap} size={26} color="#F5F5F7" />
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

        <GlassBlur
          intensity={30}
          style={[styles.companyGlass]}
          fill={glassSurfaceColor(glassFieldBorder(), glassOpacity)}
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
                {termsAccepted ? <MaterialIcons name="check" size={14} color="#FFFFFF" /> : null}
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
              <MaterialIcons name="apartment" size={13} color="#F5F5F7" />
              <Text style={styles.companyText}>
                {COMPANY_DETAILS.legalName} · {COMPANY_DETAILS.location}
              </Text>
            </View>
            <Text style={styles.companyTextSmall}>
              © {new Date().getFullYear()} {COMPANY_DETAILS.name} · {COMPANY_DETAILS.supportEmail}
            </Text>
          </View>
        </GlassBlur>
      </ScrollView>

      <Modal visible={termsOpen} transparent animationType="fade" onRequestClose={() => setTermsOpen(false)}>
        <View style={styles.termsShade}>
          <GlassBlur intensity={38} style={[styles.termsSheet]}
            fill={glassSurfaceColor(glassFieldBorder(), glassOpacity)}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.termsHeader}>
                <Text style={styles.termsTitle}>Terms &amp; Privacy</Text>
                <Pressable onPress={() => setTermsOpen(false)} accessibilityLabel="Close terms" style={styles.termsClose}>
                  <MaterialIcons name="close" size={18} color="#F5F5F7" />
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
          </GlassBlur>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * The first screen is the brightest screen in the app, and it is worth saying why.
   *
   * It was a dark slate (`#5C5B56`) with the artwork at half opacity and a ten per cent
   * black wash over the top. That composition was left over from a dark-palette pass and
   * it made the one screen that has to sell the app read as *black grey*: the artwork is
   * a drawing on near-white paper (mean luminance 253), so laying it over a dark ground
   * and then darkening it again threw away most of the picture and gave the glass nothing
   * bright behind it to diffuse.
   *
   * It is now the same composition the signed-in app uses - the artwork at nearly full
   * strength over the artwork's own paper white, with a light wash rather than a dark
   * one - so the first screen and every screen after it are the same material, and the
   * glass has a bright, detailed backdrop to work with. That is what makes it read as
   * fresh rather than as grey.
   */
  root: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#F4F2EF" },
  backdrop: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.94 },
  backdropWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255, 255, 255, 0.10)" },
  /* Clipped, so a pool that runs past the edge cannot widen the page. */
  field: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  bubbleField: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  bubble: { position: "absolute", bottom: -60, borderWidth: 1, borderColor: glassFieldBorder() },
  /*
   * The vertical rhythm of the first screen.
   *
   * The terms card was reported as sitting too far down, and the gap below the carousel is
   * what put it there: the intro frame is 172pt tall whatever it contains, so a 14pt gap
   * either side of it read as roughly 40pt of dead space between the panel and the card.
   * The frame is trimmed and the gap with it, which lifts the terms card about 24pt on a
   * small phone without crowding the slides.
   */
  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 20, gap: 9 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  soundToggleWrap: { alignItems: "center", gap: 4 },
  soundToggle: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassFieldBorder(),
    borderWidth: 1,
    borderColor: glassFieldBorder(),
    shadowColor: "#E3EDF4",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  soundHint: { color: "#F5F5F7", fontSize: 12 },
  guestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 13,
    backgroundColor: glassFieldBorder(),
    borderWidth: 1,
    borderColor: glassFieldBorder(),
  },
  guestPillText: { color: "#F5F5F7", fontSize: 12, fontWeight: "600" },
  glass: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: glassFieldBorder(),
    shadowColor: "#E9F3FB",
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
  },
  /* Clips the blur and the sheen to the panel's own shape. */
  glassShape: { borderRadius: 28 },
  glassInner: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22, alignItems: "center" },
  /* The gap the terms card used to sit across is closed: the two panes are one block. */
  brandMark: { alignItems: "center" },
  brandIcon: {
    width: 58,
    height: 58,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A78FA9",
    borderWidth: 1,
    borderColor: glassFieldBorder(),
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.30,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  brand: { color: "#F5F5F7", fontSize: 30, fontWeight: "800", letterSpacing: 0.4, marginTop: 12 },
  tagline: { color: "#F5F5F7", fontSize: 13.5, fontWeight: "600", marginTop: 6, textAlign: "center" },
  support: { color: "#F5F5F7", fontSize: 12, lineHeight: 17, marginTop: 7, textAlign: "center", paddingHorizontal: 6 },
  primaryButton: {
    minHeight: 50,
    width: "100%",
    marginTop: 20,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    /*
     * The primary action takes the solid brand mauve, which is the one place in the app a
     * saturated fill belongs: "Sign Up" is the main way in and the ghost beside it is the
     * secondary, so the two have to be told apart at a glance. They were nearly identical
     * outlined pills before this, which left the member no hierarchy to follow. White on
     * this fill is 6.4:1, so the label is comfortable rather than merely legal.
     */
    backgroundColor: "#7A5A7E",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700", letterSpacing: 0.3 },
  ghostButton: {
    minHeight: 48,
    width: "100%",
    marginTop: 10,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassFieldBorder(),
    /*
     * The outline is what makes a ghost button a button, so it is solved rather than
     * tinted. Measured on the rendered panel, a boundary is held to 3:1 and this
     * outline was at 1.76:1 - which is what the member saw as corners "not closing":
     * the line was faint enough to dissolve where the curve met the straight edge, so
     * the shape read as two arcs rather than one pill.
     *
     * Only full opacity clears the floor. Over the panel, the mauve composites to
     * 3.01:1 at 1.0 and to 2.65:1 at 0.9, so there is no translucent value that works
     * and the outline is opaque. Its *face* is deliberately left translucent - a face
     * cannot carry 3:1 by translucency at any alpha (the best it reaches over this
     * panel is 1.30:1 at 0.7), which is why a ghost button is defined by its line and
     * not by its body, and why the body stays glass.
     */
    borderWidth: 1,
    borderColor: "#A78FA9",
  },
  ghostButtonText: { color: "#F5F5F7", fontSize: 13.5, fontWeight: "700", letterSpacing: 0.3 },
  buttonMuted: { opacity: 0.62 },
  guestLink: { marginTop: 14, paddingVertical: 4, paddingHorizontal: 10 },
  guestLinkText: { color: "#F5F5F7", fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  guestNote: { color: "#F5F5F7", fontSize: 12, marginTop: 3, textAlign: "center" },
  carouselBlock: { alignItems: "center", gap: 2 },
  carouselFrame: { width: "100%", height: 150 },
  carousel: { width: "100%", height: "100%" },
  slide: { alignItems: "center", paddingHorizontal: 14, gap: 8 },
  slideIllustration: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.10)"),
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  /*
   * The carousel sits on the *page*, not on the panel, so its ink is the page's ink.
   *
   * It was white, which over this artwork measures about 1.0:1 - the slides were not
   * faint, they were invisible, and the member reported precisely that. Anything outside
   * a pane takes the page ramp; only what sits on a pane takes the white one.
   */
  slideTitle: { color: PAGE_INK.strong, fontSize: 13.5, fontWeight: "700", textAlign: "center", marginTop: 4 },
  slideBody: { color: PAGE_INK.body, fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 8 },
  dots: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(28, 27, 25, 0.28)" },
  dotActive: { width: 20, backgroundColor: "#A78FA9" },
  swipeHint: { color: PAGE_INK.body, fontSize: 12, marginTop: 3, marginBottom: 4 },
  companyGlass: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  companyInner: { paddingHorizontal: 14, paddingVertical: 13, gap: 7 },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 1.4,
    borderColor: "rgba(28, 27, 25, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassFieldBorder(),
  },
  checkboxOn: { backgroundColor: "#A78FA9", borderColor: "#A78FA9" },
  termsText: { flex: 1, color: "#F5F5F7", fontSize: 12, lineHeight: 17 },
  termsStrong: { color: "#F5F5F7", fontWeight: "700" },
  termsLink: { alignSelf: "flex-start", paddingVertical: 2 },
  termsLinkText: { color: "#F5F5F7", fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  companyLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  companyText: { color: "#F5F5F7", fontSize: 12 },
  companyTextSmall: { color: "#F5F5F7", fontSize: 12 },
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
    borderColor: glassFieldBorder(),
    shadowColor: "#ECF6FD",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  termsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  termsTitle: { color: "#F5F5F7", fontSize: 17, fontWeight: "800" },
  termsClose: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: glassFieldBorder(), borderWidth: 1, borderColor: glassFieldBorder() },
  termsBodyTitle: { color: "#F5F5F7", fontSize: 12, fontWeight: "700", marginTop: 10 },
  termsBody: { color: "#F5F5F7", fontSize: 12, lineHeight: 17, marginTop: 3 },
  termsFootnote: { color: "#F5F5F7", fontSize: 12, marginTop: 10, textAlign: "center" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
