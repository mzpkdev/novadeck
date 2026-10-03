// The theming contract in docs/theming.md, checked against the source.
//
// Themes: every theme in `themes.ts` has a file in `themes/`, imported into
// `layer(themes)`, whose selectors all start with its own `[data-theme]`; the file
// defines every required foundation token (`tokens.ts`, which the doc's table matches)
// for each scheme the manifest lists. The first scheme lives on `[data-theme="<id>"]`,
// each other one on `[data-theme="<id>"][data-scheme="<scheme>"]`.
//
// Ratchets: rules (a) to (c) below have files that still break them while components
// move to recipes. Each rule lists those files. A file not listed must follow the rule,
// and a listed file that now follows it fails the check until it is removed from the
// list, so the lists only shrink. Rule (d) holds for every file.
//
// (a) TSX arranges, recipes draw. Every string literal in the UI's .ts and .tsx
//     source is split into class tokens; a token whose utility (after its variants,
//     `!` and `-`) begins with a Tailwind utility root must match `layoutUtilities`.
//     Allowed: display, flex and grid, gap, margin, padding, position and inset,
//     z-index, order, overflow, visibility, sizes, transforms, pointer and scroll
//     behaviour, `opacity-0` and `opacity-100`, and type that sets size and flow:
//     text sizes (`text-sm`, `text-[11px]`), alignment (`text-center`), wrapping and
//     truncation, line height (`leading-*`) and weight (`font-medium`). Everything
//     else is a look: colours and backgrounds (`text-muted`, `bg-*`), every `border*`
//     (width, sides and colour), `rounded*`, `shadow*`, `ring*`, `outline*`, opacity
//     between 0 and 1, fill, stroke, filters and backdrops, font family
//     (`font-mono`), letter spacing, text transform and decoration, and motion
//     (`transition*`, `duration-*`, `ease-*`, `animate-*`). An arbitrary property
//     (`[overflow-wrap:anywhere]`) follows the same split by its property name.
// (b) No colour literals in CSS outside theme files: hex, colour functions (`rgb()`,
//     `hsl()`, `oklch()`, …), named colours, Tailwind palette colours in `@apply`, and
//     system colours outside `accessibility.css`. `transparent`, `currentColor` and
//     `color-mix()` over tokens are fine.
// (c) No `!important` (or an `@apply` important modifier) outside `theme/base.css`.
// (d) Every stylesheet is layered. Each `@import` in `styles.css` carries `layer(…)`,
//     except Tailwind itself and `theme/contract.css`, which hold only what Tailwind
//     layers. Any other CSS file is imported from `styles.css` into a layer or wraps
//     everything in `@layer`. CSS imported from .ts or .tsx counts as unlayered unless
//     it wraps itself; a package's CSS imported from .ts or .tsx is charged to the
//     importing file.

import { readdirSync, readFileSync } from "node:fs"
import { join, posix } from "node:path"

import { describe, expect, it } from "../test"
import { themes } from "./themes"
import { requiredTokens } from "./tokens"

const src = join(process.cwd(), "src")
const doc = readFileSync(join(process.cwd(), "..", "..", "docs", "theming.md"), "utf8")
const all = (readdirSync(src, { recursive: true }) as string[]).map((file) =>
  file.split("\\").join("/"),
)
const read = (file: string): string => readFileSync(join(src, file), "utf8")
const stylesheets = all.filter((file) => file.endsWith(".css"))
const themeFile = (file: string): boolean => /^theme\/themes\/[^/]+\.css$/.test(file)
const scripts = all.filter(
  (file) =>
    /\.tsx?$/.test(file) &&
    !/\.(test|spec)\.tsx?$/.test(file) &&
    !/^(specs|test|theme)\//.test(file) &&
    file !== "test.ts",
)

// ---- A small CSS reader: comments out, then blocks and statements by nesting.

type CssNode = { readonly prelude: string; readonly body?: string }

const uncomment = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "")

const cssNodes = (css: string): CssNode[] => {
  const found: CssNode[] = []
  let start = 0
  let open = 0
  let depth = 0
  let quote: string | undefined
  for (let index = 0; index < css.length; index++) {
    const char = css[index]
    if (quote) {
      if (char === "\\") index++
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === "{") {
      if (depth === 0) open = index
      depth++
    } else if (char === "}") {
      depth--
      if (depth === 0) {
        found.push({ prelude: css.slice(start, open).trim(), body: css.slice(open + 1, index) })
        start = index + 1
      }
    } else if (char === ";" && depth === 0) {
      found.push({ prelude: css.slice(start, index).trim() })
      start = index + 1
    }
  }
  const rest = css.slice(start).trim()
  return rest ? [...found, { prelude: rest }] : found
}

// Every statement inside any block, with the prelude of the block that holds it.
const statements = (css: string): { readonly block: string; readonly text: string }[] =>
  cssNodes(css).flatMap((node) =>
    node.body === undefined
      ? []
      : cssNodes(node.body).flatMap((inner) =>
          inner.body === undefined
            ? [{ block: node.prelude, text: inner.prelude }]
            : statements(`${inner.prelude}{${inner.body}}`),
        ),
  )

const declarations = (body: string): Map<string, string> =>
  new Map(
    cssNodes(body).flatMap((node) => {
      const colon = node.prelude.indexOf(":")
      return node.body === undefined && colon > 0
        ? [[node.prelude.slice(0, colon).trim(), node.prelude.slice(colon + 1).trim()] as const]
        : []
    }),
  )

// ---- The ratchet: violations by file against the files allowed to have them.

const ratchet = (found: Map<string, string[]>, allowed: readonly string[]): string[] => [
  ...[...found]
    .filter(([file]) => !allowed.includes(file))
    .map(([file, problems]) => {
      const shown = problems.slice(0, 8).join(", ")
      return problems.length > 8
        ? `${file}: ${shown} (${problems.length - 8} more)`
        : `${file}: ${shown}`
    }),
  ...allowed
    .filter((file) => !found.has(file))
    .map((file) => `${file} now follows the rule: remove it from the allowlist`),
]

const byFile = (entries: readonly (readonly [string, string[]])[]): Map<string, string[]> =>
  new Map(entries.filter(([, problems]) => problems.length > 0))

// Expands `--color-{a,b}-fg` into `--color-a-fg` and `--color-b-fg`.
const expand = (token: string): string[] => {
  const match = /\{([^}]+)\}/.exec(token)
  return match
    ? match[1]!.split(",").flatMap((part) => expand(token.replace(match[0], part.trim())))
    : [token]
}

describe("theme contract", () => {
  describe("foundation tokens", () => {
    it("are the ones the theming guide's table lists", () => {
      const section = doc.slice(
        doc.indexOf("Required in every scheme"),
        doc.indexOf("Optional, with defaults"),
      )
      const listed = section
        .split("\n")
        .filter((line) => line.startsWith("|"))
        .flatMap((line) => [...line.matchAll(/`(--[^`]+)`/g)].flatMap((match) => expand(match[1]!)))

      expect(listed.toSorted()).toEqual(requiredTokens.toSorted())
    })
  })

  describe.each(themes.map((theme) => [theme.id, theme] as const))("theme %s", (id, theme) => {
    const file = `theme/themes/${id}.css`

    it("has a file imported into the themes layer", () => {
      expect(stylesheets).toContain(file)
      expect(uncomment(read("styles.css"))).toContain(`@import "./${file}" layer(themes);`)
    })

    it("selects only its own theme", () => {
      const prefix = `[data-theme="${id}"]`
      const selectors = (css: string): string[] =>
        cssNodes(css).flatMap((node) =>
          node.body === undefined
            ? []
            : node.prelude.startsWith("@")
              ? selectors(node.body)
              : node.prelude.split(",").map((selector) => selector.trim()),
        )
      expect(
        selectors(uncomment(read(file))).filter((selector) => !selector.startsWith(prefix)),
      ).toEqual([])
      expect(
        [...read(file).matchAll(/data-theme="([^"]*)"/g)]
          .map((match) => match[1])
          .filter((name) => name !== id),
      ).toEqual([])
    })

    it.each(theme.schemes.map((scheme, index) => [scheme, index] as const))(
      "defines every required token for its %s scheme",
      (scheme, index) => {
        const selector =
          index === 0 ? `[data-theme="${id}"]` : `[data-theme="${id}"][data-scheme="${scheme}"]`
        const block = cssNodes(uncomment(read(file))).find((node) => node.prelude === selector)
        expect(block?.body, `${file} has no ${selector} block`).toBeDefined()
        const tokens = declarations(block!.body!)

        expect(tokens.get("color-scheme")).toBe(scheme)
        expect(requiredTokens.filter((token) => !tokens.has(token))).toEqual([])
      },
    )
  })

  it("lists every theme file in the manifest", () => {
    const ids = new Set<string>(themes.map((theme) => theme.id))
    expect(
      stylesheets.filter(themeFile).filter((file) => !ids.has(posix.basename(file, ".css"))),
    ).toEqual([])
  })
})

// ---- (a) TSX arranges, recipes draw.

// Each string and template-literal text in a script, with the code just before it;
// strings end at a line break, so an apostrophe in JSX text cannot swallow the code
// after it.
type Literal = { readonly text: string; readonly before: string }

const literals = (code: string): Literal[] => {
  const found: Literal[] = []
  let plain = ""
  const take = (text: string): void => {
    found.push({ text, before: plain.slice(-120) })
  }
  for (let index = 0; index < code.length; index++) {
    const char = code[index]!
    const next = code[index + 1]
    if (char === "/" && next === "/") {
      index = code.indexOf("\n", index)
      if (index < 0) break
    } else if (char === "/" && next === "*") {
      index = code.indexOf("*/", index + 2) + 1
      if (index <= 0) break
    } else if (char === '"' || char === "'") {
      let end = index + 1
      while (end < code.length && code[end] !== char && code[end] !== "\n") {
        if (code[end] === "\\") end++
        end++
      }
      take(code.slice(index + 1, end))
      plain += " "
      index = end
    } else if (char === "`") {
      let end = index + 1
      let text = ""
      while (end < code.length && code[end] !== "`") {
        if (code[end] === "\\") {
          text += code.slice(end, end + 2)
          end += 2
        } else if (code[end] === "$" && code[end + 1] === "{") {
          let depth = 1
          end += 2
          while (end < code.length && depth > 0) {
            if (code[end] === "{") depth++
            else if (code[end] === "}") depth--
            end++
          }
          text += " "
        } else text += code[end++]
      }
      take(text)
      plain += " "
      index = end
    } else plain += char
  }
  return found
}

// A class string is a literal in a `className` attribute or `…ClassName` prop, in a
// constant named `…Class`, `…Classes` or `…ClassName`, or in an open `cn()` call.
const classContext = (before: string): boolean => {
  // Up to the end of the attribute or statement, and before the next JSX attribute.
  if (/(className|ClassName|Classes|Class)\s*[=:](?:(?![;>}])(?!\s[\w-]+=)[\s\S])*$/.test(before))
    return true
  const call = before.lastIndexOf("cn(")
  if (call < 0) return false
  const rest = before.slice(call)
  return rest.split("(").length > rest.split(")").length
}

// The utility a class token names: without its variants, `!` and a leading `-`.
const utilityOf = (token: string): string => {
  let depth = 0
  let start = 0
  for (let index = 0; index < token.length; index++) {
    const char = token[index]
    if (char === "[" || char === "(") depth++
    else if (char === "]" || char === ")") depth--
    else if (char === ":" && depth === 0) start = index + 1
  }
  return token
    .slice(start)
    .replace(/^!|!$/g, "")
    .replace(/^-(?=[a-z])/, "")
}

// Tailwind utilities that take a value (`p-2`, `bg-paper`, `rounded-[1px]`) by their
// prefix, and those that stand alone (`flex`, `border`). A token is checked only when
// it is one of these, so app classes such as `sidebar-item` or `grid-terminal` pass.
const valuePrefixes = (
  "accent align animate aspect auto-cols auto-rows backdrop basis bg bg-blend blur " +
  "border bottom break brightness caret clear col columns content contrast cursor " +
  "decoration delay divide drop-shadow duration ease end fill flex float font from gap " +
  "grayscale grid-cols grid-flow grid-rows grow h hue-rotate hyphens indent inset " +
  "inset-ring inset-shadow invert isolation items justify leading left line-clamp list " +
  "m mask max-h max-w mb me min-h min-w mix-blend ml mr ms mt mx my object opacity order " +
  "origin outline overflow overscroll p pb pe pl place placeholder pointer-events pr ps " +
  "pt px py right ring rotate rounded row saturate scale scheme scroll select self sepia " +
  "shadow shrink size skew snap space-x space-y start stroke table text to top touch " +
  "tracking transition translate underline-offset via w whitespace will-change wrap z"
).split(" ")
const standalone = new Set(
  (
    "absolute antialiased block blur border box-border box-content capitalize collapse " +
    "contents filter fixed flex flow-root grayscale grid grow hidden inline inline-block " +
    "inline-flex inline-grid inline-table invert invisible isolate italic line-through " +
    "list-item lowercase no-underline normal-case not-italic not-sr-only ordinal outline " +
    "overline relative resize ring rounded sepia shadow shrink slashed-zero sr-only " +
    "static sticky subpixel-antialiased table tabular-nums transform transition truncate " +
    "underline uppercase visible"
  ).split(" "),
)
// The value after a prefix: a word, a number, a fraction, or an arbitrary value, with
// an optional opacity or line-height modifier.
const valueShape = /^[a-z0-9.]+(-[a-z0-9.]+)*(\/\d+)?$|^(.*-)?(\[.+\]|\(.+\))(\/[\w.%[\]]+)?$/

const isUtility = (utility: string): boolean =>
  standalone.has(utility) ||
  valuePrefixes.some(
    (prefix) =>
      utility.startsWith(`${prefix}-`) && valueShape.test(utility.slice(prefix.length + 1)),
  )

// What TSX may use: how elements are arranged, and the size and flow of their type.
const layoutUtilities: readonly RegExp[] = [
  /^(block|inline|inline-block|inline-flex|inline-grid|flex|grid|hidden|contents|flow-root|list-item|table(-.+)?)$/,
  /^(sr-only|not-sr-only)$/,
  /^(flex-.+|grow(-.+)?|shrink(-.+)?|basis-.+|order-.+|col-.+|row-.+|auto-(cols|rows)-.+)$/,
  /^(grid-(cols|rows|flow)-.+|gap(-[xy])?-.+|justify-.+|items-.+|self-.+|place-.+)$/,
  /^content-(normal|center|start|end|between|around|evenly|baseline|stretch|\[.+\])$/,
  /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|space-[xy])-.+$/,
  /^(w|h|size|min-w|min-h|max-w|max-h)-.+$/,
  /^(static|fixed|absolute|relative|sticky|visible|invisible|collapse|isolate|isolation-auto)$/,
  /^(inset(-[xy])?|top|right|bottom|left|start|end|z)-(?!shadow|ring).+$/,
  /^(overflow|overscroll)(-[xy])?-.+$/,
  /^(box-(border|content)|(float|clear|object|aspect|columns)-.+)$/,
  /^((translate|scale|rotate|skew)(-[xyz])?-.+|transform(-.+)?|origin-.+)$/,
  /^(pointer-events|cursor|select|touch|resize|scroll|snap|will-change|appearance)(-.+)?$/,
  /^opacity-(0|100)$/,
  /^text-(xs|sm|base|lg|[2-9]?xl)(\/.+)?$/,
  /^text-\[(length:)?[\d.]+(px|rem|em)\](\/.+)?$/,
  /^text-\[length:.+\]$/,
  /^text-(left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/,
  /^(truncate|whitespace-.+|break-.+|wrap-.+|line-clamp-.+|hyphens-.+|leading-.+|align-.+)$/,
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])$/,
  /^(italic|not-italic|tabular-nums|indent-.+)$/,
]

// Arbitrary properties (`[overflow-wrap:anywhere]`) by what they set; a custom
// property is layout unless it names a token a theme owns.
const layoutProperty =
  /^(display|position|inset|top|right|bottom|left|z-index|order|(min-|max-)?(width|height)|margin.*|padding.*|gap|(row|column)-gap|flex.*|grid.*|justify-.+|align-.+|place-.+|overflow.*|overscroll-.+|visibility|transform|translate|scale|rotate|pointer-events|cursor|user-select|touch-action|scroll.*|scrollbar-gutter|overflow-wrap|white-space|word-break|text-align|line-height|font-size|font-weight|font-style|aspect-ratio|--(?!color|shadow|radius|font|transition|tw-).+)$/

const arbitraryProperty = (utility: string): string | undefined =>
  /^\[(-?-?[a-z][a-z-]*):.+\]$/.exec(utility)?.[1]

const lookUtilities = (text: string): string[] =>
  text.split(/\s+/).flatMap((token) => {
    const utility = utilityOf(token)
    const property = arbitraryProperty(utility)
    if (property) return layoutProperty.test(property) ? [] : [token]
    if (!isUtility(utility)) return []
    return layoutUtilities.some((pattern) => pattern.test(utility)) ? [] : [token]
  })

const classLooks = (file: string): string[] =>
  literals(read(file))
    .filter(({ before }) => classContext(before))
    .flatMap(({ text }) => lookUtilities(text))

// Files whose class strings still draw. Shrink only.
const scriptsWithLooks: readonly string[] = [
  "app/App.tsx",
  "app/BootFailure.tsx",
  "app/BootSplash.tsx",
  "app/WorkspaceStage.tsx",
  "backend/demo/AgentOutput.tsx",
  "backend/demo/DemoTerminal.tsx",
  "backend/demo/TerminalOutput.tsx",
  "backend/demo/showcase/agents.tsx",
  "backend/runner/DebugPanel.tsx",
  "backend/runner/RunnerTerminal.tsx",
  "layouts/canvas/Canvas.tsx",
  "layouts/focus/Focus.tsx",
  "preferences/AgentSwitches.tsx",
  "preferences/Preferences.tsx",
  "preferences/WelcomeDialog.tsx",
  "preferences/WelcomePreview.tsx",
  "preferences/settings.ts",
  "projects/WorkspaceSwitcher.tsx",
  "search/TerminalSearch.tsx",
  "shell/EmptyWorkspace.tsx",
  "shell/SidebarRail.tsx",
  "shell/WorkspaceFooter.tsx",
  "shell/WorkspaceHeader.tsx",
  "shell/WorkspacePanels.tsx",
  "shell/WorkspaceSidebar.tsx",
  "shell/ZenDock.tsx",
  "sidebar/SessionsPanel.tsx",
  "sidebar/SidebarItem.tsx",
  "sidebar/SidebarPanel.tsx",
  "terminals/MailCount.tsx",
  "terminals/TerminalSwitcher.tsx",
  "terminals/TerminalTab.tsx",
  "terminals/TerminalTabs.tsx",
  "terminals/WindowShell.tsx",
  "ui-toolkit/Checkbox.tsx",
  "ui-toolkit/ContextMenu.tsx",
  "ui-toolkit/SearchCombobox.tsx",
  "ui-toolkit/SegmentGroup.tsx",
  "ui-toolkit/Select.tsx",
  "ui-toolkit/Switch.tsx",
  "ui-toolkit/Tabs.tsx",
]

// ---- (b) No colour literals outside theme files.

const namedColours = (
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
  "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue " +
  "cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey " +
  "darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon " +
  "darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
  "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen " +
  "fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew " +
  "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon " +
  "lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey " +
  "lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey " +
  "lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine " +
  "mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
  "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose " +
  "moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
  "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink " +
  "plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon " +
  "sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow " +
  "springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke " +
  "yellow yellowgreen"
).split(" ")
const systemColours = (
  "AccentColor AccentColorText ActiveText ButtonBorder ButtonFace ButtonText Canvas " +
  "CanvasText Field FieldText GrayText Highlight HighlightText LinkText Mark MarkText " +
  "SelectedItem SelectedItemText VisitedText"
).split(" ")
const word = (names: readonly string[], flags: string): RegExp =>
  new RegExp(`(?<![\\w-])(${names.join("|")})(?![\\w-])`, flags)
const namedColour = word(namedColours, "gi")
const systemColour = word(systemColours, "g")
const colourFunction = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi
const hexColour = /#[0-9a-f]{3,8}(?![\w-])/gi
const paletteColour =
  /^(bg|text|border(-[xytrblse])?|ring|outline|fill|stroke|from|via|to|divide|shadow|decoration|accent|caret|placeholder)-(white|black|(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)(\/.+)?$/

const colourLiterals = (file: string): string[] =>
  statements(uncomment(read(file))).flatMap(({ text }) => {
    if (text.startsWith("@apply"))
      return text
        .split(/\s+/)
        .slice(1)
        .filter((token) => paletteColour.test(utilityOf(token)))
    const colon = text.indexOf(":")
    if (colon < 0) return []
    const value = text
      .slice(colon + 1)
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
      .replace(/url\([^)]*\)/g, "url()")
    return [
      ...value.matchAll(hexColour),
      ...value.matchAll(colourFunction),
      ...value.matchAll(namedColour),
      ...(file === "theme/accessibility.css" ? [] : value.matchAll(systemColour)),
    ].map((match) => match[0])
  })

// Stylesheets that still hold colour literals. Shrink only.
const stylesheetsWithColours: readonly string[] = [
  "preferences/WelcomeDialog.module.css",
  "preferences/WelcomePreview.module.css",
  "terminals/companion/companion.css",
  "theme/contract.css",
]

// ---- (c) No `!important` outside theme/base.css.

const importantDeclarations = (file: string): string[] =>
  statements(uncomment(read(file))).flatMap(({ text }) =>
    /!\s*important/i.test(text) ||
    (text.startsWith("@apply") && text.split(/\s+/).some((token) => /^!|!$/.test(token)))
      ? [text.replace(/\s+/g, " ").slice(0, 60)]
      : [],
  )

// Stylesheets that still use `!important`. Shrink only. runner.css overrides styles
// xterm sets inline, and accessibility.css stills motion that utilities in the TSX set.
const stylesheetsWithImportant: readonly string[] = [
  "app/BootSplash.module.css",
  "backend/runner/runner.css",
  "terminals/companion/companion.css",
  "theme/accessibility.css",
]

// ---- (d) Every stylesheet is layered.

// Holds only Tailwind's `@theme`, which Tailwind puts in its own layer.
const onlyTheme = (file: string): boolean =>
  cssNodes(uncomment(read(file))).every((node) => node.prelude === "@theme")

const imports = (css: string): { readonly target: string; readonly layered: boolean }[] =>
  cssNodes(css).flatMap((node) => {
    const match = /^@import\s+(?:url\()?["']([^"']+)["']\)?(.*)$/s.exec(node.prelude)
    return node.body === undefined && match
      ? [{ target: match[1]!, layered: /\blayer\(/.test(match[2]!) }]
      : []
  })

const resolveCss = (from: string, target: string): string | undefined =>
  target.startsWith(".") ? posix.normalize(posix.join(posix.dirname(from), target)) : undefined

const unlayered = (file: string): string[] => {
  const css = uncomment(read(file))
  const loose = cssNodes(css)
    .filter((node) => {
      if (node.body !== undefined) return !/^@layer\s+[\w.-]+$/.test(node.prelude)
      // `@reference` only lets Tailwind read another stylesheet; it emits nothing.
      if (/^@(layer|charset|reference)\s/.test(node.prelude)) return false
      return !node.prelude.startsWith("@import")
    })
    .map((node) => node.prelude.split("\n")[0]!.slice(0, 40))
  const looseImports = imports(css)
    .filter(({ target, layered }) => {
      if (layered || target === "tailwindcss") return false
      const local = resolveCss(file, target)
      return !(local && stylesheets.includes(local) && onlyTheme(local))
    })
    .map(({ target }) => `@import "${target}"`)
  return [...looseImports, ...loose]
}

const layeredFromStyles = new Set(
  imports(uncomment(read("styles.css"))).flatMap(({ target, layered }) => {
    const local = resolveCss("styles.css", target)
    return local && (layered || onlyTheme(local)) ? [local] : []
  }),
)

const cssImportPattern = /^import\s+(?:[\w{}\s,*]+from\s+)?["']([^"']+\.css)["']/gm

const unlayeredStylesheets = (): Map<string, string[]> =>
  byFile([
    ...stylesheets
      .filter((file) => !layeredFromStyles.has(file))
      .map((file) => [file, unlayered(file)] as const),
    // A package's CSS imported from a script can't be wrapped: the script answers for it.
    ...scripts.map(
      (file) =>
        [
          file,
          [...read(file).matchAll(cssImportPattern)]
            .map((match) => match[1]!)
            .filter((target) => !target.startsWith("."))
            .map((target) => `imports ${target}`),
        ] as const,
    ),
  ])

describe("theme ratchets", () => {
  it("keeps visual utilities out of TSX class strings", () => {
    const found = byFile(scripts.map((file) => [file, classLooks(file)] as const))
    expect(ratchet(found, scriptsWithLooks)).toEqual([])
  })

  it("keeps colour literals in theme files", () => {
    const found = byFile(
      stylesheets
        .filter((file) => !themeFile(file))
        .map((file) => [file, colourLiterals(file)] as const),
    )
    expect(ratchet(found, stylesheetsWithColours)).toEqual([])
  })

  it("keeps !important to the theme switch in theme/base.css", () => {
    const found = byFile(
      stylesheets
        .filter((file) => file !== "theme/base.css")
        .map((file) => [file, importantDeclarations(file)] as const),
    )
    expect(ratchet(found, stylesheetsWithImportant)).toEqual([])
  })

  it("puts every stylesheet in a layer", () => {
    expect(ratchet(unlayeredStylesheets(), [])).toEqual([])
  })
})
