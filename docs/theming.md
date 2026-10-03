# Theming

NovaDeck's look is a theme. Components give the interface its shape; a theme decides
how that shape is drawn: colours, borders, depth, corners, type, and the texture of the
workspace. Graphite, the app's own look, is a theme like any other, with a light and a
dark scheme. A new theme is one CSS file and one line in the theme list.

This guide is the contract between the two sides. Change it when the contract changes.

## Layers

`styles.css` declares one cascade order, before Tailwind loads:

```css
@layer theme, base, components, themes, accessibility, utilities;
```

| Layer           | Holds                                                                                                 | Written in                       |
| --------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `theme`         | Tailwind's layout scale: spacing, breakpoints, type sizes. No colours, radii or shadows (see below).  | `theme/contract.css`             |
| `base`          | Defaults for optional tokens, element defaults (body, focus ring, scrollbars, selection), vendor CSS. | `theme/base.css`, vendor imports |
| `components`    | Recipes: one per component, shape only, every visual value a token.                                   | beside each component            |
| `themes`        | Theme files: token values, and the few rules tokens can't express.                                    | `theme/themes/*.css`             |
| `accessibility` | Reduced motion and forced colours, so no theme can defeat them.                                       | `theme/accessibility.css`        |
| `utilities`     | Tailwind layout utilities from the TSX.                                                               | Tailwind                         |

Every stylesheet is layered, vendor CSS included: CSS outside a layer beats every
layer, so one unlayered rule would override every theme. `styles.css` imports each
stylesheet into a layer, except Tailwind and `theme/contract.css`, which Tailwind
layers itself; CSS imported from a script wraps its rules in `@layer`. Recipes and
themes never use `!important`, because it turns the layer order around. The one
exception is in `base`: the rule that stills transitions while the theme changes. Until
no utility in the TSX sets motion, the reduced-motion rule in `accessibility` needs it
too.

Until every component draws through a recipe, `theme/contract.css` also keeps the
colour, radius, shadow, font and motion entries that Tailwind's utilities and `@apply`
still use. Theme files override them; they leave the contract once nothing uses them.

## Tokens

Three tiers, each reading only from the one above it.

1. **Foundation tokens** are the theme's vocabulary. A theme defines every required one
   for each scheme it offers; `theme/contract.test.ts` checks this.
2. **Component tokens** are each recipe's knobs, such as `--button-bg` or
   `--window-selected-border-color`. A recipe falls back to foundation tokens when a
   theme leaves one unset, so a theme that sets none still looks whole.
3. **Private values** are what a recipe computes for itself, named `--_<name>`.

### Who declares what

Only themes declare foundation and component tokens. A recipe never declares one; it
reads each component token, with its fallback, into a private value on its own element,
and its states change only private values:

```css
.button {
  --_bg: var(--button-bg, var(--color-paper));
  background: var(--_bg);
}
.button:hover:not(:disabled) {
  --_bg: var(--button-hover-bg, var(--color-soft));
}
```

This is load-bearing. A declaration on an element beats the value it inherits, whatever
the layers, so `.button { --button-bg: … }` in a recipe would hide the theme's
`--button-bg` from every button. Reading tokens on the element also lets a theme
restyle a region: `[data-theme="x"] .sidebar { --color-paper: … }` reaches every
recipe inside the sidebar.

Optional foundation tokens get their defaults in `theme/base.css`, on `:root` in the
`base` layer, never in Tailwind's `@theme`, which would turn them back into utilities.

### Foundation tokens

Required in every scheme a theme offers:

| Group    | Tokens                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grounds  | `--color-canvas` (the workspace behind windows), `--color-shell` (sidebar, rail, settings), `--color-paper` (windows, cards, header, popovers), `--color-soft` (hover and pressed fills)               |
| Text     | `--color-ink` (primary), `--color-muted` (secondary), `--color-faint` (disabled, decoration)                                                                                                           |
| Lines    | `--color-line` (dividers, resting borders), `--color-line-strong` (emphasised borders)                                                                                                                 |
| Emphasis | `--color-strong`, `--color-strong-hover`, `--color-on-strong`: primary actions, on states, what is selected, focus                                                                                     |
| Overlays | `--color-scrim`, `--color-selection`, `--color-shadow` (the colour every shadow is made from)                                                                                                          |
| Tones    | `--color-{success,warning,danger,note}` (a tint) and `--color-{success,warning,danger,note}-fg` (text on it)                                                                                           |
| Syntax   | `--color-syntax-{keyword,string,number,property,definition,type,comment}`                                                                                                                              |
| Terminal | `--terminal-{bg,fg,cursor,selection}`; `--terminal-ansi-{black,red,green,yellow,blue,magenta,cyan,white}`, and each again as `--terminal-ansi-{black,red,green,yellow,blue,magenta,cyan,white}-bright` |
| Depth    | `--shadow-control`, `--shadow-panel`, `--shadow-floating`, `--shadow-modal`                                                                                                                            |

Optional, with defaults in `theme/base.css`:

| Group   | Tokens                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Shape   | `--radius-control`, `--radius-panel`, `--radius-popover`, `--border-width`                                     |
| Type    | `--font-sans`, `--font-mono`                                                                                   |
| Focus   | `--focus-ring-color`, `--focus-ring-width`, `--focus-ring-offset`                                              |
| Motion  | `--motion-feedback`, `--motion-state`, `--motion-layout`, `--motion-view`, `--ease-interface`                  |
| Texture | `--canvas-grain-opacity`, `--canvas-dots-opacity`, `--terminal-idle-opacity`, `--terminal-hover-opacity`       |
| Brand   | `--brand-tile-bg`, `--brand-tile-fg`, `--brand-tile-border-color` (the logo tile and the welcome start button) |

Don't register colour tokens with `@property`: a registered token given a value of the
wrong type silently falls back to its initial value.

### Component tokens

Names follow `--<component>[-<variant>][-<part>][-<state>]-<property>`:
`--button-bg`, `--button-primary-hover-bg`, `--item-selected-indicator-bg`,
`--toggle-track-on-bg`, `--window-phase-running-border-color`. Properties come from a
short vocabulary: `bg`, `fg`, `border-color`, `border-width`, `radius`, `shadow`,
`opacity`, `blur`, `image` (hatches, grain, dot grids), `font`, `height`, `padding`,
`ring-color`, `ring-offset`.

Each recipe opens with a comment that lists its tokens and what each one paints. That
comment is the component's theming reference; there is no separate list to keep in step.

The shared recipes, and what they cover:

| Recipe        | Covers                                                                    | Example tokens                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button`      | Dialog actions, empty states, create buttons; `.primary`, `.ghost`        | `--button-{bg,fg,border-color,shadow}`, `--button-hover-bg`, `--button-primary-bg`                                                                                                       |
| `icon-button` | Header, window, tab and sidebar actions; `.dim` stays faint until hovered | `--icon-button-fg`, `--icon-button-hover-bg`, `--icon-button-dim-opacity`                                                                                                                |
| `surface`     | `.panel`, `.card`, `.floating`, `.modal`                                  | `--{panel,card,floating,modal}-{bg,border-color,shadow,radius}`                                                                                                                          |
| `overlay`     | The scrim behind dialogs and the mobile sidebar                           | `--overlay-bg`, `--overlay-blur`                                                                                                                                                         |
| `region`      | The app's chrome: header, footer, sidebar, rail, settings ground          | `--region-{header,footer,sidebar,rail,settings}-{bg,fg,border-color}`                                                                                                                    |
| `item`        | Sidebar rows, menu and select items, search results                       | `--item-{hover,highlighted,selected}-bg`, `--item-selected-{border-color,shadow}`, `--item-selected-indicator-bg`                                                                        |
| `segmented`   | View switch, segment groups, toggle groups, tabs                          | `--segmented-bg`, `--segmented-active-{bg,fg,shadow}`, `--tabs-indicator-bg`                                                                                                             |
| `field`       | Select and combobox triggers, inputs                                      | `--field-{bg,fg,border-color,shadow}`, `--field-open-border-color`                                                                                                                       |
| `toggle`      | Switch and checkbox                                                       | `--toggle-track-{on,off}-bg`, `--toggle-thumb-bg`, `--toggle-mark-fg`                                                                                                                    |
| `tone`        | Anything marked `data-tone="success                                       | warning                                                                                                                                                                                  | danger | note"` | read straight from the foundation tones |
| `badge`       | Counts, `kbd`, small labels                                               | `--badge-{bg,fg,border-color}`, `--kbd-{bg,fg,border-color,shadow}`                                                                                                                      |
| `separator`   | Dividers and the panel sashes                                             | `--separator-bg`, `--sash-hover-bg`                                                                                                                                                      |
| `window`      | The terminal window, its header, selection bar and phase line             | `--window-{bg,border-color,shadow}`, `--window-selected-border-color`, `--window-indicator-bg`, `--window-phase-{running,starting,attention,ended}-border-color`, `--window-ended-image` |
| `workspace`   | The ground behind Focus, Grid and Canvas                                  | `--workspace-{bg,glow-bg,dots-image,grain-image}`                                                                                                                                        |
| `prose`       | Plans, documents, mail and the plan editor's decorations                  | `--prose-{heading,code,link,quote}-{fg,bg}`, `--prose-changed-bg`                                                                                                                        |
| `syntax`      | `.tok-*` highlighting in files an agent shows                             | read straight from the syntax tokens                                                                                                                                                     |

## Hooks

A theme's rules may select:

- a recipe's classes: the component (`.button`, `.terminal-window`), its parts
  (`.terminal-heading`) and its variants (`.primary`, `.ghost`, `.compact`);
- state attributes the app or Ark UI sets: `data-state`, `data-selected`,
  `data-highlighted`, `data-disabled`, `data-focus-visible`, `aria-checked`,
  `aria-pressed`, `data-tone`, `data-terminal-phase` and the others each recipe lists;
- `data-theme` and `data-scheme` on `<html>`.

Recipe classes and the attributes a recipe lists are public. Renaming one breaks every
theme that uses it, so rename it in the same change as the themes. Anything else in the
DOM may change without notice. CSS modules aren't used, because their class names
aren't stable.

Variants are classes (`.button.primary`); states are attributes. A component never
holds a state only in its class list or only in JS: if it can be on, checked, open or
selected, the DOM says so in an attribute.

## Rules for components

- **TSX arranges; recipes draw.** A `className` in TSX may use Tailwind only for how
  elements are arranged: display, flex and grid, gap, margin, outer padding, position,
  inset, overflow, z-index, order, visibility, transforms, pointer and scroll
  behaviour, opacity of exactly 0 or 1, sizes that come from the layout rather than
  the component, and the size and flow of type (`text-sm` or `text-[11px]`, line
  height, weight, alignment, wrapping and truncation). Everything a component looks
  like comes from its recipe: colour (every other `text-*`), background, borders
  (every `border*`: width, sides and colour), radius, shadow, ring, opacity between 0
  and 1, outline, fill, stroke, filters and backdrop filters, font family, letter
  spacing, text transform and decoration, motion (transitions, durations, easing,
  animations), and the component's own geometry, such as a control's height or a
  row's padding. `theme/contract.test.ts` checks class strings (in a `className`, a
  `cn()` call, or a constant named `…Classes` or `…ClassName`) against an allowlist of
  utility prefixes; it can't tell a component's own geometry from layout, so that part
  is for review.
- **A recipe reads only tokens.** No hex, `rgb()` or named colours outside theme
  files; the contract test enforces it. System colours (`Canvas`, `CanvasText`,
  `Highlight`) are allowed in the accessibility layer. A recipe may mix tokens, as in
  `color-mix(in srgb, var(--color-ink) 4%, transparent)`.
- **One recipe per look.** When a second component needs a look that exists, it uses
  that recipe or adds a variant to it. Copying a look into another recipe forks the
  theme surface.
- **Recipes live beside their components** (`ui-toolkit/button.css`,
  `terminals/window.css`); `styles.css` imports each into `layer(components)`.
- **Draw absence, don't remove it.** A recipe with no visible border draws a
  transparent one, and an elevated surface keeps a transparent outline, so forced
  colours can show them. A selected item has an indicator, not only a fill.
- **JS reads tokens, never colours.** Code that needs a colour outside CSS, such as the
  xterm theme, resolves the token through a hidden probe element (`color:
var(--terminal-bg)` read back with `getComputedStyle`), because a token can hold
  `color-mix()`, and reads again on `novadeck:themechange`. `tokenColors` in
  `theme/probe.ts` does this.

## Themes

A theme file sets its schemes on `[data-theme]`: the first scheme `theme/themes.ts`
lists for it on `[data-theme]` alone, each other one on `[data-scheme]` as well,
with `color-scheme` and every required token in each:

```css
[data-theme="graphite"] {
  color-scheme: light;
  --color-paper: #ffffff;
  /* every required token */
}

[data-theme="graphite"][data-scheme="dark"] {
  color-scheme: dark;
  --color-paper: #191c20;
  /* every required token again */
}
```

Then any component tokens it wants to change, and last any rules tokens can't express,
each against a [hook](#hooks):

```css
[data-theme="blueprint"] .terminal-heading::before {
  inset-block: 0;
  inline-size: 100%;
  opacity: 0.08;
}
```

Prefer tokens. The `themes` layer beats every recipe whatever the specificity, so a
theme rule that sets a property on a component's resting selector also overrides its
hover, selected and disabled looks; a theme that sets properties restates each state it
needs. When a theme needs many such rules, the recipe is missing a token: add it to the
recipe instead, and every theme gains it.

Theme rules match any element under `[data-theme]`. If the app ever renders a preview
of another theme inside the page, scope theme rules with
`@scope ([data-theme="x"]) to ([data-theme])` so they stop at the nested preview.

`theme/themes.ts` lists the themes: an id, the name Preferences shows, and the schemes
its file defines. To add a theme:

1. Copy `theme/themes/graphite.css` to `theme/themes/<id>.css`, rename the selectors and
   change the values.
2. Import it in `styles.css` into `layer(themes)`, and add `{ id, name, schemes }` to
   `theme/themes.ts`.
3. Run `pnpm --filter @novadeck/ui exec vitest run --project unit src/theme/`.

## Choosing a theme

Preferences holds `appearance: { theme, scheme }`, where `scheme` is `system`, `light`
or `dark`; it starts as Graphite following the system. Preferences shows a Theme list
from `theme/themes.ts` and a Mode choice (System, Light, Dark), disabled with a note for
a theme with one scheme. `theme/apply.ts` resolves the preference against the system's
scheme and the schemes the theme offers; a theme with one scheme always uses it, and
an unknown theme falls back to the first in the list, Graphite. It then sets
`data-theme` and `data-scheme` on `<html>` and dispatches `novadeck:themechange`.
`app/appearance.ts` is the one place that does this while the app runs: whenever the
preference changes, and whenever the system's scheme does.

- **Switching** sets `data-theme-switching` on `<html>` for one frame, which stills
  transitions so the whole page changes at once instead of fading control by control.
- **Before the first paint**, `public/theme-boot.js` sets the same attributes. `apply.ts`
  saves what the boot script needs under `novadeck.theme-boot` (the theme, the chosen
  scheme and the theme's schemes), and the script only resolves `system` against
  `matchMedia`. It is a plain script loaded in the head without `defer`, because the
  Content Security Policy allows same-origin scripts but not inline ones.
- **Windows** stay in step: each listens for the `storage` event and takes up the
  preferences another window saved, theme included.
- **The desktop host** follows the page. On every change the page reports its scheme
  and its `--color-canvas` as `#rrggbb` through the preload bridge; the host sets
  `nativeTheme.themeSource` so native menus and `prefers-color-scheme` agree, sets the
  window's background, and keeps that ground to open new windows on, so a dark theme
  never flashes white. While the page follows the system it reports `system`, not the
  scheme it resolved: a fixed `themeSource` would hide the system's own scheme from
  `matchMedia`. The host accepts only `system`, `light` or `dark` and an opaque hex
  colour. In a browser there is no host, and nothing is reported.
