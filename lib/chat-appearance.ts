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
   * The open conversation's palette.
   *
   * This has been rebuilt twice, and the second rebuild is the one worth recording.
   * It was originally a light palette; the dark-glass pass inverted it to white ink on
   * faint lifts, with a solid blue outgoing bubble; and when the casts were restored to
   * pale glass the palette was left behind. A sent message was therefore the one surface
   * in the app that ignored the member's choice - picking White still produced a blue
   * bubble, which is the "why is this colour appearing" report.
   *
   * It is a *light* palette again, because the app is a light app. The bubbles are
   * translucent so they still take the blur behind them - that is what keeps them glass
   * rather than paint - and they carry the same dark ink as the cards, which is what
   * makes a conversation read as one interface with the inbox rather than two.
   *
   * The outgoing bubble is distinguished by *lift* and by its position and tail, which
   * is how a conversation is read anyway, rather than by a colour the member never
   * chose. Measured on the card, the worst of the three surfaces carries the body ink at
   * 8.03:1 and the secondary ink at 6.44:1, both clear of AA.
   */
  backdrop: "rgba(0, 0, 0, 0.22)",
  incomingBubble: "rgba(255, 255, 255, 0.62)",
  outgoingBubble: "rgba(255, 255, 255, 0.86)",
  typingBubble: "rgba(255, 255, 255, 0.62)",
  controlSurface: "rgba(255, 255, 255, 0.62)",
  composerSurface: "rgba(255, 255, 255, 0.55)",
  markerSurface: "rgba(255, 255, 255, 0.55)",
  primaryText: "#4B4651",
  secondaryText: "#5A5563",
  subtleText: "#6E6C67",
  accentText: "#00BFFF",
  border: "rgba(0, 0, 0, 0.10)",
  divider: "rgba(0, 0, 0, 0.10)",
} as const;
