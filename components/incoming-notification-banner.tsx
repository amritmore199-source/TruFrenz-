import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import type { IncomingNotification } from "@/lib/incoming-notifications";

export function IncomingNotificationBanner({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: IncomingNotification | null;
  onOpen: (notification: IncomingNotification) => void;
  onDismiss: () => void;
}) {
  const [displayed, setDisplayed] = useState<IncomingNotification | null>(notification);
  const translateY = useRef(new Animated.Value(-116)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const currentAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    currentAnimation.current?.stop();
    if (notification) {
      setDisplayed(notification);
      translateY.setValue(-116);
      opacity.setValue(0);
      currentAnimation.current = Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 270, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]);
      currentAnimation.current.start();
      return;
    }
    if (!displayed) return;
    currentAnimation.current = Animated.parallel([
      Animated.timing(translateY, { toValue: -116, duration: 210, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]);
    currentAnimation.current.start(({ finished }) => {
      if (finished) setDisplayed(null);
    });
  }, [notification, displayed, opacity, translateY]);

  if (!displayed) return null;
  const isInvite = displayed.kind === "meetup-invite";

  return (
    <Animated.View accessibilityRole="alert" accessibilityLiveRegion="polite" pointerEvents={notification ? "auto" : "none"} style={[styles.position, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.surface}>
        <BlurView intensity={38} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <Pressable onPress={() => onOpen(displayed)} style={({ pressed }) => [styles.mainAction, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${isInvite ? "Meetup invitation" : "New message"} from ${displayed.senderName}. ${displayed.preview}`}>
          <View style={[styles.iconWell, isInvite ? styles.inviteIconWell : styles.messageIconWell]}>
            <MaterialIcons name={isInvite ? "event-available" : "chat-bubble-outline"} size={19} color={isInvite ? "#8A7598" : "#798FA0"} />
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
          <MaterialIcons name="chevron-right" size={20} color="#A497A6" />
        </Pressable>
        <Pressable onPress={onDismiss} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss notification">
          <MaterialIcons name="close" size={15} color="#857A88" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: "absolute", top: 8, left: 13, right: 13, zIndex: 100, elevation: 20 },
  surface: { minHeight: 76, flexDirection: "row", alignItems: "center", borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(252,249,252,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#58475E", shadowOpacity: 0.16, shadowRadius: 19, shadowOffset: { width: 0, height: 7 }, elevation: 9 },
  mainAction: { flex: 1, minWidth: 0, minHeight: 76, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 11, paddingRight: 30 },
  iconWell: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", position: "relative" },
  inviteIconWell: { backgroundColor: "rgba(240,230,243,0.91)" },
  messageIconWell: { backgroundColor: "rgba(232,240,245,0.93)" },
  statusDot: { position: "absolute", right: 2, top: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: "#D48EB0", borderWidth: 1.5, borderColor: "#FFFFFF" },
  copy: { flex: 1, minWidth: 0, paddingVertical: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  kind: { color: "#927B96", fontSize: 7, fontWeight: "800", letterSpacing: 1 },
  now: { color: "#A69DA8", fontSize: 7, fontWeight: "600", letterSpacing: 0.6 },
  sender: { color: "#514A57", fontSize: 11, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  preview: { color: "#89818D", fontSize: 9, lineHeight: 13, marginTop: 1 },
  close: { position: "absolute", right: 6, top: 6, width: 23, height: 23, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.77)" },
  pressed: { opacity: 0.8 },
});
