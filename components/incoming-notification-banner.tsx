import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GlassBlur } from "@/components/glass-blur";
import { MaterialIcons } from "@expo/vector-icons";
import type { IncomingNotification } from "@/lib/incoming-notifications";
import { shouldDismissIncomingNotificationSwipe } from "@/lib/incoming-notifications";
import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";

export function IncomingNotificationBanner({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: IncomingNotification | null;
  onOpen: (notification: IncomingNotification) => void;
  onDismiss: () => void;
}) {
  const { glassOpacity } = useAppAppearance();
  const [displayed, setDisplayed] = useState<IncomingNotification | null>(notification);
  const { width: screenWidth } = useWindowDimensions();
  const displayedRef = useRef<IncomingNotification | null>(notification);
  const translateY = useRef(new Animated.Value(-118)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.975)).current;
  const swipeDirection = useRef(0);
  const currentAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const suppressNextClick = useRef(false);
  const clickResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressBannerClick = useCallback(() => {
    suppressNextClick.current = true;
    if (clickResetTimer.current) clearTimeout(clickResetTimer.current);
    clickResetTimer.current = setTimeout(() => { suppressNextClick.current = false; }, 500);
  }, []);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderMove: (_event, gesture) => translateX.setValue(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      if (shouldDismissIncomingNotificationSwipe(gesture.dx, gesture.vx)) {
        suppressBannerClick();
        swipeDirection.current = gesture.dx < 0 ? -1 : 1;
        onDismiss();
        return;
      }
      swipeDirection.current = 0;
      Animated.spring(translateX, {
        toValue: 0,
        damping: 23,
        stiffness: 230,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      swipeDirection.current = 0;
      Animated.spring(translateX, {
        toValue: 0,
        damping: 23,
        stiffness: 230,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
    },
  }), [onDismiss, suppressBannerClick, translateX]);

  useEffect(() => () => {
    if (clickResetTimer.current) clearTimeout(clickResetTimer.current);
    currentAnimation.current?.stop();
  }, []);

  useEffect(() => {
    currentAnimation.current?.stop();
    if (notification) {
      displayedRef.current = notification;
      setDisplayed(notification);
      swipeDirection.current = 0;
      translateX.setValue(0);
      translateY.setValue(-118);
      scale.setValue(0.975);
      opacity.setValue(0);
      currentAnimation.current = Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 310, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 310, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
      currentAnimation.current.start();
      return;
    }

    if (!displayedRef.current) return;
    const direction = swipeDirection.current;
    currentAnimation.current = Animated.parallel([
      Animated.timing(translateX, { toValue: direction * (screenWidth + 40), duration: direction ? 230 : 0, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: direction ? -8 : -118, duration: 230, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.975, duration: 230, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    currentAnimation.current.start(({ finished }) => {
      if (finished) {
        displayedRef.current = null;
        swipeDirection.current = 0;
        setDisplayed(null);
      }
    });
  }, [notification, opacity, scale, screenWidth, translateX, translateY]);

  if (!displayed) return null;
  const isInvite = displayed.kind === "meetup-invite";

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityHint="Swipe left or right to dismiss, or use the dismiss control."
      style={[styles.position, { opacity, pointerEvents: notification ? "auto" : "none", transform: [{ translateX }, { translateY }, { scale }] }]}
    >
      <View style={[styles.surface, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(252, 250, 242, 0.92)"), glassOpacity) }]}>
        <GlassBlur intensity={44} style={StyleSheet.absoluteFill} />
        <Pressable onPress={() => { if (suppressNextClick.current) { suppressNextClick.current = false; return; } onOpen(displayed); }} style={({ pressed }) => [styles.mainAction, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${isInvite ? "Meetup invitation" : "New message"} from ${displayed.senderName}. ${displayed.preview}`}>
          <View style={[styles.iconWell, isInvite ? styles.inviteIconWell : styles.messageIconWell]}>
            <MaterialIcons name={isInvite ? "event-available" : "chat-bubble-outline"} size={19} color={isInvite ? "#83721f" : "#798FA0"} />
            <View style={styles.statusDot} />
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.kind}>{isInvite ? "MEETUP INVITE" : "NEW MESSAGE"}</Text>
              <Text style={styles.now}>NOW</Text>
            </View>
            <Text style={styles.sender} numberOfLines={1}>{displayed.senderName}</Text>
            <Text style={styles.preview} numberOfLines={1}>{displayed.preview}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color="#8B8881" />
        </Pressable>
        <Pressable onPress={onDismiss} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss notification">
          <MaterialIcons name="close" size={15} color="#807d76" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: "absolute", top: 8, left: 13, right: 13, zIndex: 100, elevation: 20 },
  surface: { minHeight: 76, flexDirection: "row", alignItems: "center", borderRadius: 20, overflow: "hidden", backgroundColor: glassNestedFill("rgba(252, 250, 242, 0.92)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), shadowColor: "#544d2e", shadowOpacity: 0.19, shadowRadius: 21, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  mainAction: { flex: 1, minWidth: 0, minHeight: 76, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 11, paddingRight: 30 },
  iconWell: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", position: "relative" },
  inviteIconWell: { backgroundColor: "rgba(242, 234, 193, 0.94)" },
  messageIconWell: { backgroundColor: glassNestedFill("rgba(232, 240, 245, 0.96)") },
  statusDot: { position: "absolute", right: 2, top: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: "#E9D177", borderWidth: 1.5, borderColor: "#FFFFFF" },
  copy: { flex: 1, minWidth: 0, paddingVertical: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  kind: { color: "#7C6C1D", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  now: { color: "#6E6C67", fontSize: 12, fontWeight: "600", letterSpacing: 0.6 },
  sender: { color: "#504d3e", fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 2 },
  preview: { color: "#6E6C67", fontSize: 12, lineHeight: 17, marginTop: 1 },
  close: { position: "absolute", right: 6, top: 6, width: 23, height: 23, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.43)") },
  pressed: { opacity: 0.8 },
});
