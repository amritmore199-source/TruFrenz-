// Placeholder module.
//
// The Bizz section is a section of the main root screen — it shares the top bar,
// the wallpaper and the bottom bar with every other section — so it does not
// live in its own route. This file only exists so the section can be assembled
// separately and reviewed on its own before it is inlined.
//
// Do not register this as a route: two screens owning the same section means two
// sources of truth for the member's settings.
export {};