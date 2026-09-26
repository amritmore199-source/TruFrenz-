import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import { glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { availabilityView, displayUnread, type ChatRowState } from "@/lib/chat-extras";
import { CHAT_ROW_ACTION_SIZE, chatRowRevealWidth, chatRowSwipeThreshold } from "@/lib/chat-layout";

export type ChatRowData = {
  id: string;
  name: string;
  image: ImageSourcePropType;
  kind: "friend" | "group";
  lastMessage: string;
  time: string;
  unread: number;
  verified: boolean;
  availability?: "available" | "away" | "unavailable";
};

type Props = {
  chat: ChatRowData;
  state: ChatRowState;
  statusLine?: string | null;
  onOpen: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
};

/** Distance the row must travel before a swipe commits. */
const SWIPE_THRESHOLD = chatRowSwipeThreshold();

/** How far the row can travel, so both corner buttons stay reachable. */
export function swipeRevealWidth(): number {
  return chatRowRevealWidth();
}

/**
 * A chat row that reveals compact Mute and Archive buttons in its trailing
 * corners as the member swipes it left.
 *
 * The buttons are deliberately small and icon-only so the conversation preview
 * keeps the row's width; the accessible labels still spell out the action. The
 * row springs back if the gesture does not commit.
 */
export function SwipeableChatRow({ chat, state, statusLine, onOpen, onToggleMute, onToggleArchive }: Props) {
  const { glassOpacity } = useAppAppearance();
  const translateX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const committedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const availability = availabilityView(chat.kind === "group" ? undefined : chat.availability);
  const unread = displayUnread(chat.unread, state);
  const reveal = swipeRevealWidth();

  const settle = (toValue: number) => {
    setRevealed(toValue !== 0);
    Animated.timing(translateX, {
      toValue,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          const next = Math.max(-reveal, Math.min(0, gesture.dx));
          translateX.setValue(next);
          offsetRef.current = next;
        },
        onPanResponderRelease: () => {
          const travelled = offsetRef.current;
          if (travelled <= -SWIPE_THRESHOLD) {
            committedRef.current = true;
            settle(-reveal);
            return;
          }
          settle(0);
        },
        onPanResponderTerminate: () => settle(0),
      }),
    [reveal, translateX],
  );

  useEffect(() => {
    if (!state.muted && !state.archived) settle(0);
    // Only react to the member's own mute/archive state changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.muted, state.archived]);

  const handleOpen = () => {
    if (committedRef.current) {
      committedRef.current = false;
      settle(0);
      return;
    }
    if (offsetRef.current < -20) {
      settle(0);
      return;
    }
    onOpen();
  };

  return (
    <View style={styles.shell}>
      {/* Corner actions. They sit in the row's trailing edge and only become
          visible once the row has slid, so the conversation preview is never
          competing with them for space. Their opacity follows the slide so the
          translucent row never lets them show through before the swipe. */}
      <Animated.View
        style={[
          styles.actionsLayer,
          {
            opacity: translateX.interpolate({
              inputRange: [-reveal, -18, 0],
              outputRange: [1, 1, 0],
              extrapolate: "clamp",
            }),
          },
        ]}
        pointerEvents={revealed ? "auto" : "none"}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.muted ? `Unmute ${chat.name}` : `Mute ${chat.name}`}
          onPress={() => {
            settle(0);
            onToggleMute();
          }}
          style={({ pressed }) => [styles.action, styles.muteAction, pressed && styles.actionPressed]}
        >
          <MaterialIcons
            name={state.muted ? "notifications-active" : "notifications-off"}
            size={16}
            color="#FFFFFF"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.archived ? `Unarchive ${chat.name}` : `Archive ${chat.name}`}
          onPress={() => {
            settle(0);
            onToggleArchive();
          }}
          style={({ pressed }) => [styles.action, styles.archiveAction, pressed && styles.actionPressed]}
        >
          <MaterialIcons name={state.archived ? "unarchive" : "archive"} size={16} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open conversation with ${chat.name}${unread > 0 ? `, ${unread} unread` : ""}${state.muted ? ", muted" : ""}${state.archived ? ", archived" : ""}`}
          onPress={handleOpen}
          style={({ pressed }) => [
            styles.row,
            pressed && styles.rowPressed,
          ]}
        >
          {/* Blur first, then the tint: the wallpaper's bright areas would
              otherwise read as hard white patches across the row. */}
          <BlurView
            intensity={34}
            tint="light"
            experimentalBlurMethod="dimezisBlurView"
            style={[StyleSheet.absoluteFillObject, styles.rowBlur]}
            pointerEvents="none"
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.rowTint,
              { backgroundColor: glassSurfaceColor("rgba(255,255,255,0.66)", glassOpacity) },
            ]}
          />
          <View style={styles.avatarWrap}>
            <Image source={chat.image} style={styles.avatar} />
            {chat.kind === "group" ? (
              <View style={styles.groupMini}>
                <MaterialIcons name="groups" size={10} color="#FFFFFF" />
              </View>
            ) : (
              <View
                style={[
                  styles.dot,
                  availability.tone === "available" ? styles.dotAvailable : styles.dotUnavailable,
                  availability.pulses && styles.dotPulse,
                ]}
              />
            )}
          </View>

          <View style={styles.info}>
            <View style={styles.titleRow}>
              <View style={styles.nameCluster}>
                <Text style={styles.name} numberOfLines={1}>
                  {chat.name}
                </Text>
                {chat.verified ? <MaterialIcons name="verified" size={13} color="#61A088" /> : null}
                {state.muted ? <MaterialIcons name="notifications-off" size={12} color="#A69DAB" /> : null}
                {state.archived ? <MaterialIcons name="archive" size={12} color="#A69DAB" /> : null}
              </View>
              <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{chat.time}</Text>
            </View>
            <View style={styles.lastRow}>
              <Text style={styles.preview} numberOfLines={1}>
                {chat.lastMessage}
              </Text>
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread}</Text>
                </View>
              ) : null}
            </View>
            {statusLine ? (
              <Text style={styles.status} numberOfLines={1}>
                {statusLine}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { position: "relative", marginBottom: 6, borderRadius: 16, overflow: "hidden" },
  actionsLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingVertical: 7,
    paddingRight: 7,
    gap: 6,
  },
  action: {
    width: CHAT_ROW_ACTION_SIZE,
    height: Math.round(CHAT_ROW_ACTION_SIZE * 0.62),
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
  },
  muteAction: { backgroundColor: "#8FA6B6" },
  archiveAction: { backgroundColor: "#9D7E9E" },
  actionPressed: { opacity: 0.8 },
  rowBlur: { borderRadius: 16, overflow: "hidden" },
  rowTint: { borderRadius: 16 },
  row: {
    minHeight: 69,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.94)",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: "#817888",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.055,
    shadowRadius: 9,
    elevation: 1,
  },
  rowPressed: { opacity: 0.9 },
  avatarWrap: { position: "relative" },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(232,226,234,0.9)" },
  groupMini: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#9D8AA8",
    borderWidth: 2,
    borderColor: "#FBF9FB",
  },
  dot: { position: "absolute", right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#FBF9FB" },
  dotAvailable: { backgroundColor: "#6FBF8F" },
  dotUnavailable: { backgroundColor: "#D98A8A" },
  dotPulse: { opacity: 0.96 },
  info: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  nameCluster: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  name: { color: "#47414D", fontSize: 12, fontWeight: "650" as any, flexShrink: 1 },
  time: { color: "#9A929D", fontSize: 9 },
  timeUnread: { color: "#A2568B", fontWeight: "700" },
  lastRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  preview: { flex: 1, color: "#8A8291", fontSize: 10 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, backgroundColor: "#C08FB4" },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  status: { color: "#8E8194", fontSize: 8.5, fontWeight: "600", marginTop: 3 },
});
