/** @type {const} */
/*
 * Trufrenz is monochrome by default.
 *
 * `primary` was the blue the member kept seeing, and it reaches the UI in places that
 * do not go through the glass resolver at all - `text-primary`, the switch and spinner
 * tints, the focus ring - so neutralising only the glass would have left blue in those.
 * It is now the ink colour, and the only saturated colour anywhere in the default theme
 * is the three semantic tokens below: success, warning and error, because those carry a
 * meaning rather than a mood, and a status dot that could not be told from another
 * status dot is not a status dot. The semantic hues are already muted and warm rather
 * than the near-neon greens and reds they replaced.
 *
 * Sky blue returns as a cast the member chooses in Appearance, not as a theme token.
 */
const themeColors = {
  primary: { light: '#E8E8E8', dark: '#E8E8E8' },
  background: { light: '#0E1014', dark: '#0E1014' },
  surface: { light: '#16191F', dark: '#16191F' },
  foreground: { light: '#F2F3F5', dark: '#F2F3F5' },
  muted: { light: '#B9BEC4', dark: '#B9BEC4' },
  border: { light: '#3A4149', dark: '#3A4149' },
  success: { light: '#6FBF9A', dark: '#8FD4B2' },
  warning: { light: '#C9A961', dark: '#D8BE86' },
  error: { light: '#E08E9E', dark: '#EEAAB7' },
};

module.exports = { themeColors };
