/**
 * The open conversation's palette.
 *
 * A conversation used to be a dark room: near-black translucent bubbles with
 * bright white text, which suited the dark wallpaper that used to sit behind the
 * app. The wallpaper is now the crew artwork on white paper and the rest of the
 * app draws dark ink on pale glass, so a conversation keeps the dark *surfaces*
 * but swaps the ink — dark bubbles, dark text — which is what a light-on-light
 * app looks like when one screen is deliberately deeper than the others.
 *
 * Named for what it is rather than for a colour, because the colour has changed
 * once already and the call sites should not have to care.
 */
export const CHAT_NIGHT = {
  backdrop: "rgba(236, 241, 247, 0.42)",
  incomingBubble: "rgba(232, 238, 245, 0.88)",
  outgoingBubble: "rgba(245, 231, 168, 0.92)",
  typingBubble: "rgba(232, 238, 245, 0.86)",
  controlSurface: "rgba(240, 244, 249, 0.82)",
  composerSurface: "rgba(243, 246, 250, 0.86)",
  markerSurface: "rgba(238, 242, 248, 0.82)",
  primaryText: "#2F3A45",
  secondaryText: "rgba(47, 58, 69, 0.78)",
  subtleText: "rgba(47, 58, 69, 0.62)",
  accentText: "#64707D",
  border: "rgba(47, 58, 69, 0.28)",
  divider: "rgba(47, 58, 69, 0.28)",
} as const;
