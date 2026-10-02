import { glassNestedFill } from "@/lib/appearance-preferences";
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
import { GlassBlur } from "@/components/glass-blur";
import { GlassTopGlow } from "@/components/glass-glow";

import {
  GLASS_RIM_INNER_INSET,
  GLASS_SHADOW,
  GLASS_SHADOW_OPACITY,
  glassBlur,
  glassEdge,
  glassInnerRim,
  glassTint,
  glassVeil,
} from "@/lib/glass";
import { useAppAppearance } from "@/lib/appearance-context";
import { availabilityView, displayUnread, type ChatRowState } from "@/lib/chat-extras";
import {
  CHAT_ROW_ACTION_SIZE,
  CHAT_ROW_ARCHIVE_REVEAL,
  archiveSwipeLabel,
  chatRowRevealWidth,
  resolveChatRowSwipe,
} from "@/lib/chat-layout";

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
  /**
   * Unread messages derived from the member's read marker. Falls back to the
   * seeded count so the row still renders if a caller omits it.
   */
  unreadCount?: number;
  chat: ChatRowData;
  state: ChatRowState;
  statusLine?: string | null;
  onOpen: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  /**
   * Long-press puts the conversation back to unread.
   *
   * The two swipe directions are already taken, and a third gesture axis on a
   * list row would fight the scroll. A long press is the platform's own gesture
   * for "something else about this row", and it leaves the swipes untouched.
   */
  onMarkUnread: () => void;
  /** Whether the member has already put this conversation back to unread. */
  markedUnread?: boolean;
};

/** How far the row can travel, so both corner buttons stay reachable. */
export function swipeRevealWidth(): number {
  return chatRowRevealWidth();
}

/** How far the row may travel right, so the archive panel stays reachable. */
export function swipeArchiveWidth(): number {
  return CHAT_ROW_ARCHIVE_REVEAL;
}

/**
 * A chat row with a gesture in each direction.
 *
 * Swipe **left** and compact Mute and Archive buttons appear in the row's
 * trailing corners; swipe **right** and the row archives in one movement, with
 * the panel behind it naming the action as the thumb passes over it. The row
 * springs back if a gesture does not commit.
 *
 * The buttons are deliberately small and icon-only so the conversation preview
 * keeps the row's width; the accessible labels still spell out the action.
 */
export function SwipeableChatRow({
  chat,
  state,
  statusLine,
  unreadCount,
  onOpen,
  onToggleMute,
  onToggleArchive,
  onMarkUnread,
  markedUnread = false,
}: Props) {
  const { glassOpacity, glassTint: cast } = useAppAppearance();
  const translateX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const committedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const availability = availabilityView(chat.kind === "group" ? undefined : chat.availability);
  /*
   * The badge comes from the caller's derived count, not from the seeded number
   * on the chat. A seeded count can never clear, so a conversation the member had
   * read kept claiming unread messages.
   */
  const unread = displayUnread(unreadCount ?? chat.unread, state);
  const reveal = swipeRevealWidth();
  const archiveReveal = swipeArchiveWidth();

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
          // Left reveals the corner actions, right starts the archive swipe.
          const next = Math.max(-reveal, Math.min(archiveReveal, gesture.dx));
          translateX.setValue(next);
          offsetRef.current = next;
        },
        onPanResponderRelease: () => {
          const outcome = resolveChatRowSwipe(offsetRef.current);
          if (outcome === "reveal-actions") {
            committedRef.current = true;
            settle(-reveal);
            return;
          }
          if (outcome === "archive") {
            // Archive as the row springs back, so the panel reads as a
            // confirmation of the gesture rather than a second screen.
            committedRef.current = true;
            onToggleArchive();
            settle(0);
            return;
          }
          settle(0);
        },
        onPanResponderTerminate: () => settle(0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reveal, archiveReveal, translateX],
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
    if (offsetRef.current < -20 || offsetRef.current > 20) {
      settle(0);
      return;
    }
    onOpen();
  };

  return (
    <View style={styles.shell}>
      {/* Archive panel. It sits behind the row's leading edge and is revealed by
          a swipe to the right, naming the action as the thumb passes over it.
          It is decorative: the row's own label and the corner buttons carry the
          actions for screen readers, so this must not be announced at rest. */}
      <Animated.View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.archiveLayer,
          {
            opacity: translateX.interpolate({
              inputRange: [0, 18, archiveReveal],
              outputRange: [0, 1, 1],
              extrapolate: "clamp",
            }),
          },
        ]}
        pointerEvents="none"
      >
        <MaterialIcons name={state.archived ? "unarchive" : "archive"} size={17} color="#FFFFFF" />
        <Text style={styles.archiveLabel}>{archiveSwipeLabel(state.archived)}</Text>
      </Animated.View>

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
          accessibilityLabel={`Open conversation with ${chat.name}${unread > 0 ? `, ${unread} unread` : ""}${markedUnread ? ", marked unread" : ""}${state.muted ? ", muted" : ""}${state.archived ? ", archived" : ""}`}
          accessibilityHint="Long press to mark this conversation unread"
          onPress={handleOpen}
          onLongPress={() => {
            /*
             * If it is already a reminder, long pressing again does nothing.
             * Opening the thread is the natural clear action, and turning a
             * long-press into a toggle would make the row's state ambiguous.
             */
            if (markedUnread) return;
            settle(0);
            onMarkUnread();
          }}
          delayLongPress={420}
          style={({ pressed }) => [
            styles.row,
            { borderColor: glassEdge("row", cast) },
            pressed && styles.rowPressed,
          ]}
        >
          {/*
            The row is built from the same five layers as every card and the welcome
            panel: blur, cast, sheen, top glow and a double rim. It had only the first
            two, so it was glass with no edge surface - no lit rim, no inner hairline,
            no falloff across the face - and at 69pt tall in a stack of four it is the
            most repeated surface in the app, which is where the omission showed most.
          */}
          <GlassBlur
            intensity={glassBlur("row")}
            style={[StyleSheet.absoluteFillObject, styles.rowBlur]}
            pointerEvents="none"
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.rowTint,
              { backgroundColor: glassTint("row", glassOpacity) },
            ]}
          />
          {/* Light across the whole face, so the row is not one flat field. */}
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, styles.rowTint, { backgroundColor: glassVeil("row", glassOpacity, cast) }]}
          />
          {/* A pool of light along the top edge, as a real gradient. */}
          <GlassTopGlow cast={cast} radius={16} heightRatio={0.46} />
          {/* The inner hairline, inset from the rim exactly as the cards' is. */}
          <View
            pointerEvents="none"
            style={[styles.rowInnerRim, { borderColor: glassInnerRim(cast) }]}
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
                {chat.verified ? <MaterialIcons name="verified" size={13} color="#4B4651" /> : null}
                {state.muted ? <MaterialIcons name="notifications-off" size={12} color="#4B4651" /> : null}
                {state.archived ? <MaterialIcons name="archive" size={12} color="#4B4651" /> : null}
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
  archiveLayer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: CHAT_ROW_ARCHIVE_REVEAL,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#8E6F91",
  },
  archiveLabel: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
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
    borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"),
  },
  muteAction: { backgroundColor: "#949494" },
  archiveAction: { backgroundColor: "#8E6F91" },
  actionPressed: { opacity: 0.8 },
  rowBlur: { borderRadius: 16, overflow: "hidden" },
  rowTint: { borderRadius: 16 },
  rowInnerRim: {
    position: "absolute",
    left: GLASS_RIM_INNER_INSET,
    right: GLASS_RIM_INNER_INSET,
    top: GLASS_RIM_INNER_INSET,
    bottom: GLASS_RIM_INNER_INSET,
    borderWidth: 1,
    borderRadius: 16 - GLASS_RIM_INNER_INSET,
  },
  row: {
    minHeight: 69,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: GLASS_SHADOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: GLASS_SHADOW_OPACITY,
    shadowRadius: 10,
    elevation: 2,
  },
  rowPressed: { opacity: 0.9 },
  avatarWrap: { position: "relative" },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(0, 0, 0, 0.10)" },
  groupMini: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6B6B6B",
    borderWidth: 2,
    borderColor: "#868386",
  },
  dot: { position: "absolute", right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#868386" },
  dotAvailable: { backgroundColor: "#AFAFAF" },
  dotUnavailable: { backgroundColor: "#D98A8A" },
  dotPulse: { opacity: 0.96 },
  info: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  nameCluster: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  name: { color: "#4B4651", fontSize: 12.5, fontWeight: "650" as any, flexShrink: 1 },
  time: { color: "#4B4651", fontSize: 12 },
  timeUnread: { color: "#4B4651", fontWeight: "700" },
  lastRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  preview: { flex: 1, color: "#4B4651", fontSize: 12 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, backgroundColor: "#6B6B6B" },
  badgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  status: { color: "#666070", fontSize: 12, fontWeight: "600", marginTop: 3 },
});
