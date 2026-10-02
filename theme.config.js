/** @type {const} */
/*
 * The app's tokens, for the light page with dark glass.
 *
 * `foreground` and `muted` are the two that carry text, and they sit on the dark panes
 * as well as on the light page - so they have to do the harder of the two jobs, which is
 * reading on dark glass. They were dark mauve values, correct while the panes were pale
 * and invisible the moment they were not.
 *
 * `primary` is the brand mauve. It could not stay at #7A5A7E: as a graphic on dark glass
 * that is 1.6:1. It is lifted to the point where an icon or a small mark clears the 3:1
 * non-text floor, and the deeper #7A5A7E is kept as the *fill* wherever the brand needs a
 * solid mauve button behind white text - which is a different job with a different floor.
 */
const themeColors = {
  primary: { light: '#A78FA9', dark: '#D0B3CE' },
  background: { light: '#FAF8F5', dark: '#211E24' },
  surface: { light: '#FFFFFF', dark: '#2D2831' },
  foreground: { light: '#F2F2F5', dark: '#F3EEF4' },
  muted: { light: '#B9B6BD', dark: '#B7AEBB' },
  border: { light: '#E7E0E9', dark: '#48414D' },
  success: { light: '#92C8AB', dark: '#92C8AB' },
  warning: { light: '#DDC08E', dark: '#DDC08E' },
  error: { light: '#DE9FAA', dark: '#DE9FAA' },
};

module.exports = { themeColors };
