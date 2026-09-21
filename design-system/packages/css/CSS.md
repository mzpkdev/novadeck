# CSS API

`@novadeck/css` is a framework-independent class and custom-property contract. Import its public stylesheet with `@import "@novadeck/css/styles.css";`.

Tailwind 4 consumers can import `@novadeck/css/tailwind.css` instead. That entry loads Tailwind,
the NovaDeck tokens and base styles, and the dark-theme token overrides. Import only the component
recipes the application renders so unused recipes stay out of its stylesheet:

```ts
import "@novadeck/css/tailwind.css"
import "@novadeck/css/recipes/button.css"
import "@novadeck/css/recipes/card.css"
```

The adapter declares the shared cascade order up front, with Tailwind utilities last, so utilities
can provide application-specific layout without overriding a component recipe unintentionally.

## Design islands

Place components inside an opt-in `.novadeck` island:

```html
<section class="novadeck">
  <button class="button filled">Save</button>
</section>
```

The island owns the reset, tokens, theme, and component recipes. Keep it as narrow as practical so unrelated host markup does not acquire styles from short class names such as `.button` or `.card`.

Set `data-theme="dark"` on an island or one of its ancestors to use the dark color scheme:

```html
<main data-theme="dark">
  <section class="novadeck">
    <button class="button filled">Save</button>
  </section>
</main>
```

The theme changes semantic color roles only. Named palette values such as `--color__cyan-300`,
`--color__zinc-950`, and `--color__white` stay the same in both schemes. This keeps palette swatches
and explicit palette choices stable while components adapt through scheme-sensitive roles.

Portalled content needs its own `.novadeck` island. It must inherit the source island's direction, language, `data-theme`, `theme-*` classes, and custom properties.

Framework adapters should create the same island around each portalled surface and synchronize its context from the source element. Their refresh contract should cover source and ancestor context mutations, resizing, viewport changes, and preference-media changes.

## Class grammar

Component roots use nouns. Visual and layout choices use adjectives:

```html
<button class="button outlined">Standard action</button>
<button class="button filled">Primary action</button>
<button class="button outlined icon-only" aria-label="Search">...</button>
<div class="button-group" role="group" aria-label="Text alignment">...</div>
<div class="stack items-stretch justify-start">...</div>
<div class="inline items-center justify-between">...</div>
<div class="container fluid align-center">...</div>
<div class="divider horizontal labeled">
  <div class="content">Or</div>
</div>
```

Treatments such as `outlined`, `filled`, `elevated`, `tonal`, and `text` are mutually exclusive for a component. Stack arranges content vertically; Inline arranges it horizontally and wraps by default. Axis modifiers are explicit: use `items-center` for cross-axis alignment and `justify-between` for main-axis distribution.

Button layout modifiers are independent from its treatment. `icon-only` uses square control spacing
and `fluid` fills the available inline space. `aria-busy="true"` reserves the original content width
while showing progress. A `button-group` joins direct Button children and can also use `fluid` for
equal segments.

On devices with a coarse primary pointer, buttons, navigation-menu links and triggers, and
tree-view rows have a minimum height of `2.75rem`. Icon-only buttons also use that width.
These touch targets are part of the recipes and apply in every theme.

Container uses `fluid` when the parent, rather than a maximum width, owns its inline size. Its
`align-start`, `align-center`, `align-end`, and `align-justify` modifiers set logical text alignment.
Divider uses `horizontal` or `vertical` for its axis. Add `labeled` and a direct `content` part when
text or an icon interrupts the rule.

Values that are not a small vocabulary belong in custom properties:

```html
<div class="grid" style="--grid__columns: 4; --grid__gap: 1.5rem">...</div>
<div class="grid responsive" style="--grid__min-width: 18rem; --grid__gap: 1rem">...</div>
```

Parts use short names under an owning recipe:

```html
<button class="button filled" aria-busy="true" disabled>
  <span class="content">Save</span>
  <span class="spinner" aria-hidden="true"></span>
</button>

<div class="input">
  <span class="start" aria-hidden="true">...</span>
  <input class="control" aria-label="Search" />
  <span class="end">kg</span>
</div>

<div class="textarea">
  <textarea class="control" aria-label="Project summary"></textarea>
  <div class="footer">42 / 280</div>
</div>

<article class="card">
  <div class="image">...</div>
  <div class="content">
    <header class="header">...</header>
    <div class="meta">...</div>
    <div class="description">...</div>
  </div>
  <footer class="extra">...</footer>
</article>
```

Input, Textarea, and Select frames accept `outlined` (default) or `elevated`. For example, use
`class="input elevated"` or `class="textarea elevated"`. Inside a `.field`, the control's
`elevated` class selects the floating-label and underline treatment.

The Input frame accepts optional `start` and `end` parts. An end Button becomes a joined action, while
`aria-busy="true"` on the control lets adapters replace the end part with the Input spinner. The
Textarea frame accepts an optional footer for information or actions tied to its current value. The
stylesheet qualifies every part through its owner, such as `.card > .content > .header`. It does not
define bare `.header`, `.content`, or `.item` rules.

## Native dialogs

Native `<dialog>` elements can use the Dialog surface and parts without a framework adapter:

```html
<dialog class="dialog" aria-labelledby="search-title">
  <div class="header">
    <h2 class="title" id="search-title">Search</h2>
    <form method="dialog">
      <button class="button text icon-only" aria-label="Close search">
        <span class="content" aria-hidden="true">×</span>
      </button>
    </form>
  </div>
  <div class="body">...</div>
</dialog>
```

Place the dialog inside a `.novadeck` island and open it with `showModal()`. The browser owns
the top layer, focus containment, and native open/closed state. The recipe shares its surface
with adapter dialogs, supplies `::backdrop`, and becomes fullscreen below 48rem.

Use `--dialog__inline-size` and `--dialog__max-block-size` for desktop size limits,
and `--dialog__header-padding` / `--dialog__body-padding` for content spacing. The mobile
fullscreen treatment takes precedence over the size limits. To customize a native backdrop,
set `--dialog__backdrop` on `dialog.dialog::backdrop`; an adapter backdrop uses `.dialog-backdrop`.

## State

CSS reads native and accessible state first:

- `:hover`, `:active`, `:focus-visible`, `:disabled`, `:checked`, and `:invalid`
- `aria-expanded`, `aria-selected`, `aria-current`, `aria-pressed`, `aria-busy`, and `aria-disabled`

Ark UI may keep generated `data-*` attributes in the DOM. Recipes only use them when a composite-widget state has no native or ARIA equivalent on the styled element, such as roving highlight, dragging, indeterminate state, or exit presence. They are implementation bridges, not the public styling API.

## Custom properties

The `.novadeck` island contains tokens such as `--color__cyan-700` and `--spacing__md`. The contract has three layers:

- Named primitives hold literal values, such as `--color__cyan-700`, `--spacing__md`, and `--shadow__level-1`.
- Semantic design aliases reference primitives with `var()`, such as `--color__primary-700`, `--spacing__regular`, and `--shadow`.
- Component-private mappings use `--<component>__<property>`, such as `--button__background` and `--field__control-background`. Recipes map the appropriate foundation or semantic values and may use literal defaults. These mappings are implementation details, not foundation tokens.

Component mappings are the recipe-specific override surface. Use the owning component name and a double underscore before the property, for example `--card__spacing-inline`, `--grid__gap`, and `--dialog__backdrop`.

### Foundation token contract

| Family           | Public tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette          | `--color__<family>-<step>`. Families are `brown`, `grey`, `blue-grey`, `slate`, `zinc`, `stone`, `red`, `pink`, `purple`, `deep-purple`, `indigo`, `blue`, `light-blue`, `cyan`, `teal`, `green`, `light-green`, `lime`, `yellow`, `amber`, `orange`, and `deep-orange`. Every family has steps `50` through `950`; chromatic families also have `A100`, `A200`, `A400`, and `A700`. `--color__white` and `--color__black` are also available.                                                                                                                                    |
| Semantic color   | `--color__primary-<step>` references cyan and `--color__negative-<step>` references red, including accent steps. Scheme-sensitive roles include `--color__text-<step>`, `--color__background`, `--color__surface`, `--color__surface-subtle`, `--color__surface-muted`, `--color__border-subtle`, `--color__border`, `--color__border-muted`, `--color__border-strong`, `--color__accent-subtle`, `--color__accent`, `--color__accent-hover`, `--color__accent-focus`, `--color__danger`, `--color__on-accent`, `--color__on-accent-muted`, and `--color__text-on-accent-subtle`. |
| Typography       | `--font__ratio`, `--font-size__2xs` through `--font-size__3xl`, and `--font-family__display`, `--font-family__serif`, `--font-family__sans-serif`, and `--font-family__monospace`. Display and sans-serif resolve to `sans-serif`; serif resolves to `serif`; monospace resolves to `monospace`.                                                                                                                                                                                                                                                                                  |
| Spacing          | Primitives are `--spacing__2xs` through `--spacing__2xl`; semantic aliases are `--spacing__narrow`, `--spacing__regular`, and `--spacing__wide`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Shape            | Primitives are `--roundness__none`, `--roundness__2xs` through `--roundness__2xl`, and `--roundness__full`; `--roundness` references `--roundness__2xs`. `--thickness` is 1px. The stepped roundness values use the dedicated 0.125rem through 0.875rem scale.                                                                                                                                                                                                                                                                                                                    |
| Depth and layers | `--shadow__none`, `--shadow__inner`, and `--shadow__level-1` through `--shadow__level-3` are primitives; `--shadow` references level 1. Z-index primitives are `--z-index__auto`, `--z-index__-50` through `--z-index__-10`, and `--z-index__0` through `--z-index__50`.                                                                                                                                                                                                                                                                                                          |
| Motion           | `--transition__duration` provides the 175ms design value. `--transition__easing` references `--easing__out-expo`. The easing primitives use `--easing__in-<family>`, `--easing__out-<family>`, and `--easing__in-out-<family>` for `sine`, `quad`, `cubic`, `quart`, `quint`, `expo`, `circ`, and `back`.                                                                                                                                                                                                                                                                         |

The double underscore is part of each token name. For example, use `var(--color__deep-purple-A400)` for an accent step and `var(--easing__out-expo)` for an easing curve.

### Palette 950 values

Each `--color__<family>-950` token uses a Tailwind 950 value. Families with the same name in
both systems use that Tailwind family: `slate`, `zinc`, `stone`, `red`, `pink`, `purple`,
`indigo`, `blue`, `cyan`, `teal`, `green`, `lime`, `yellow`, `amber`, and `orange`.

OutlineCSS also retains several Material-only names. Their `950` tokens use the nearest Tailwind
hue:

| OutlineCSS family | Tailwind family |
| ----------------- | --------------- |
| `brown`           | `stone`         |
| `grey`            | `gray`          |
| `blue-grey`       | `slate`         |
| `deep-purple`     | `violet`        |
| `light-blue`      | `sky`           |
| `light-green`     | `lime`          |
| `deep-orange`     | `orange`        |

### Corrected source values

NovaDeck uses OutlineCSS names, token layers, and semantic relationships, but intentionally
corrects three source-data defects. `--font-family__serif` resolves to `serif` and
`--font-family__sans-serif` resolves to `sans-serif`; the roundness primitives use their
dedicated 0.125rem through 0.875rem scale rather than spacing values; and every
`--color__lime-*` primitive uses the Lime palette rather than duplicating Teal. The remaining
primitive values follow OutlineCSS.

Field controls use `--field__control-background`. Set it when a field sits on another solid surface:

```html
<article class="card" style="--field__control-background: var(--color__surface)">
  <div class="field">...</div>
</article>
```

Do not declare these properties on `:root`. The island is their namespace.

## Cascade

The public stylesheet declares this order:

```css
@layer novadeck.tokens, novadeck.reset, novadeck.base, novadeck.recipes,
  novadeck.theme, novadeck.utilities;
```

Tokens and recipes use `@scope (.novadeck)`. Global CSS identifiers still keep their namespace because scope cannot isolate them. Layer names use `novadeck.*`, and animation names use `novadeck-*`.

Application CSS can override the library with unlayered rules or a layer declared after `novadeck.utilities`. Prefer custom properties for routine adjustments.

## Browser support

The stylesheet targets modern evergreen browsers with support for CSS cascade layers and scoped styles. Browsers that discard `@scope` are not supported. The package does not ship a duplicated selector fallback.
