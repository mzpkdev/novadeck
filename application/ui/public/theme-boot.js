// Shows the saved theme before the first paint: sets data-theme and data-scheme on
// <html> from the boot record theme/apply.ts saves, resolving "system" against the
// system's scheme, and the scheme as <html>'s color-scheme, so the browser's own ground
// matches it before the theme's stylesheet arrives. apply.ts hands color-scheme back to
// the theme. A file of its own, because the Content Security Policy allows no inline
// scripts; see docs/theming.md.
;(() => {
  // The themes and their schemes, as theme/themes.ts lists them (a test keeps the two
  // alike). The first is the default.
  const themes = { graphite: ["light", "dark"], phosphor: ["dark"] }
  let theme = "graphite"
  let choice = "system"
  try {
    const saved = JSON.parse(localStorage.getItem("novadeck.theme-boot") ?? "null")
    if (saved?.scheme === "system" || saved?.scheme === "light" || saved?.scheme === "dark") {
      choice = saved.scheme
      // A record without a theme, or with one the app does not have, is for the default.
      if (Object.hasOwn(themes, saved.theme)) theme = saved.theme
    }
  } catch {
    // Storage is unavailable or the record is corrupt: the default applies.
  }
  let dark = false
  try {
    dark = matchMedia("(prefers-color-scheme: dark)").matches
  } catch {
    // Without media queries the system counts as light.
  }
  const wanted = choice === "system" ? (dark ? "dark" : "light") : choice
  const schemes = themes[theme]
  const scheme = schemes.includes(wanted) ? wanted : schemes[0]
  const root = document.documentElement
  root.setAttribute("data-theme", theme)
  root.setAttribute("data-scheme", scheme)
  root.style.colorScheme = scheme
})()
