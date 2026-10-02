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
  /*
   * The open conversation's palette, on the dark system.
   *
   * This used to be a light palette - pale bubbles carrying dark ink - and it was the
   * one screen that could not use white text, because the artwork sat on white paper
   * underneath it. With the backdrop dark the constraint is gone and the reason for
   * the split is gone with it: the conversation now uses the same white ink as the
   * rest of the app, so a member moving from the inbox into a thread sees one
   * interface rather than two.
   *
   * The surfaces are faint lifts rather than washes. A bubble is still glass - it
   * takes the blur behind it - so it cannot be opaque, and a faint lift over a dark
   * backdrop is what keeps white ink comfortable on it while the artwork still shows
   * through. The outgoing bubble is the one exception and it is deliberate: a sent
   * message is the member's own, so it takes the accent as a solid fill, exactly as
   * the send button does.
   */
  backdrop: "rgba(0, 0, 0, 0.22)",
  incomingBubble: "rgba(255, 255, 255, 0.12)",
  outgoingBubble: "rgba(43, 108, 143, 0.92)",
  typingBubble: "rgba(255, 255, 255, 0.12)",
  controlSurface: "rgba(255, 255, 255, 0.12)",
  composerSurface: "rgba(255, 255, 255, 0.12)",
  markerSurface: "rgba(255, 255, 255, 0.12)",
  primaryText: "#FFFFFF",
  secondaryText: "rgba(255, 255, 255, 0.84)",
  subtleText: "rgba(255, 255, 255, 0.68)",
  accentText: "#BCBCBC",
  border: "rgba(255, 255, 255, 0.22)",
  divider: "rgba(255, 255, 255, 0.22)",
} as const;
