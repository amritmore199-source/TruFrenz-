/**
 * Experimental palette for the open conversation only.
 * The inbox, tabs, profile, and all other app surfaces keep the existing palette.
 */
export const CHAT_NIGHT = {
  backdrop: "rgba(7, 16, 30, 0.22)",
  incomingBubble: "rgba(9, 25, 43, 0.82)",
  outgoingBubble: "rgba(18, 37, 55, 0.88)",
  typingBubble: "rgba(8, 22, 39, 0.84)",
  controlSurface: "rgba(8, 22, 39, 0.76)",
  composerSurface: "rgba(6, 19, 34, 0.82)",
  markerSurface: "rgba(8, 22, 39, 0.74)",
  primaryText: "#FFFFFF",
  secondaryText: "rgba(255, 255, 255, 0.82)",
  subtleText: "rgba(255, 255, 255, 0.68)",
  accentText: "#FFF0A6",
  border: "rgba(255, 255, 255, 0.36)",
  divider: "rgba(255, 255, 255, 0.36)",
} as const;
