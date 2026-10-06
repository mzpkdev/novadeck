// A small Markdown reader for what an agent writes in a chat: paragraphs, headings,
// lists, quotes, fenced code, tables, emphasis, inline code and links. It returns a tree
// the view draws element by element, so nothing the agent writes is ever read as HTML.
// It is forgiving rather than exact: text it doesn't understand stays text, and an
// unclosed fence (a reply still arriving) runs to the end.

export type Inline =
  | { readonly t: "text"; readonly text: string }
  | { readonly t: "code"; readonly text: string }
  | {
      readonly t: "strong" | "em" | "del"
      readonly children: readonly Inline[]
    }
  | {
      readonly t: "link"
      readonly href: string
      readonly children: readonly Inline[]
    }
  | { readonly t: "br" }

export type Align = "left" | "center" | "right" | null

export type MarkdownBlock =
  | { readonly t: "p"; readonly inline: readonly Inline[] }
  | {
      readonly t: "h"
      readonly level: 1 | 2 | 3 | 4 | 5 | 6
      readonly inline: readonly Inline[]
    }
  | { readonly t: "code"; readonly lang: string; readonly text: string }
  | {
      readonly t: "list"
      readonly ordered: boolean
      readonly start: number
      // No blank lines between its items or inside them: its text isn't set as paragraphs.
      readonly tight: boolean
      readonly items: readonly (readonly MarkdownBlock[])[]
    }
  | { readonly t: "quote"; readonly blocks: readonly MarkdownBlock[] }
  | { readonly t: "hr" }
  | {
      readonly t: "table"
      readonly align: readonly Align[]
      readonly head: readonly (readonly Inline[])[]
      readonly rows: readonly (readonly (readonly Inline[])[])[]
    }

// ---- Inline

// Only web pages and mail addresses leave the app, and not an address that carries a
// login, whose real host is named after it.
export const safeHref = (href: string): string | undefined => {
  try {
    const url = new URL(href)
    if (url.protocol === "mailto:") return url.href
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.username || url.password ? undefined : url.href
  } catch {
    return undefined
  }
}

const punctuation = /[!-/:-@[-`{-~]/
const space = /\s/

// The end of a bare address: it stops at white space, and gives back the punctuation
// that closes a sentence or a parenthesis around it.
const bareLink = /^https?:\/\/[^\s<>]+/

const trimmedAddress = (text: string): string => {
  let address = text
  for (;;) {
    const last = address.at(-1)!
    if (/[.,;:!?'"*_~]/.test(last)) address = address.slice(0, -1)
    else if (last === ")" && !address.includes("(")) address = address.slice(0, -1)
    else return address
  }
}

// The index of `close` in `text` from `from`, skipping what a backslash escapes and the
// inside of code spans; -1 when absent.
const closer = (text: string, close: string, from: number): number => {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") i++
    else if (text[i] === "`") {
      const run = /^`+/.exec(text.slice(i))![0]
      const end = text.indexOf(run, i + run.length)
      if (end < 0) i += run.length - 1
      else i = end + run.length - 1
    } else if (text.startsWith(close, i)) return i
  }
  return -1
}

// The text of `[label](address "title")` at `from`, or undefined where it isn't one.
const linkAt = (
  text: string,
  from: number,
): { readonly label: string; readonly href: string; readonly end: number } | undefined => {
  let depth = 0
  let i = from
  for (; i < text.length; i++) {
    if (text[i] === "\\") i++
    else if (text[i] === "[") depth++
    else if (text[i] === "]" && --depth === 0) break
  }
  if (i >= text.length || text[i + 1] !== "(") return undefined
  let parens = 0
  let j = i + 2
  for (; j < text.length; j++) {
    if (text[j] === "\\") j++
    else if (text[j] === "(") parens++
    else if (text[j] === ")" && parens-- === 0) break
  }
  if (j >= text.length) return undefined
  const target = text.slice(i + 2, j).trim()
  const href = /^<([^>]*)>/.exec(target)?.[1] ?? /^\S+/.exec(target)?.[0] ?? ""
  return { label: text.slice(from + 1, i), href, end: j + 1 }
}

export const parseInline = (text: string): readonly Inline[] => {
  const out: Inline[] = []
  let plain = ""
  const flush = (): void => {
    if (plain) out.push({ t: "text", text: plain })
    plain = ""
  }
  const wrap = (t: "strong" | "em" | "del", inner: string): void => {
    flush()
    out.push({ t, children: parseInline(inner) })
  }
  let i = 0
  while (i < text.length) {
    const char = text[i]!
    const rest = text.slice(i)
    if (char === "\\" && i + 1 < text.length) {
      if (text[i + 1] === "\n") {
        flush()
        out.push({ t: "br" })
      } else if (punctuation.test(text[i + 1]!)) plain += text[i + 1]
      else plain += char + text[i + 1]
      i += 2
      continue
    }
    if (char === "`") {
      const run = /^`+/.exec(rest)![0]
      const end = text.indexOf(run, i + run.length)
      if (end > 0) {
        flush()
        const code = text.slice(i + run.length, end).replace(/\n/g, " ")
        out.push({
          t: "code",
          text:
            code.length > 2 && code.startsWith(" ") && code.endsWith(" ")
              ? code.slice(1, -1)
              : code,
        })
        i = end + run.length
        continue
      }
      plain += run
      i += run.length
      continue
    }
    if (char === "[") {
      const link = linkAt(text, i)
      const href = link && safeHref(link.href)
      if (link && href) {
        flush()
        out.push({ t: "link", href, children: parseInline(link.label) })
        i = link.end
        continue
      }
    }
    if (char === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(rest)
      const href = auto && safeHref(auto[1]!)
      if (auto && href) {
        flush()
        out.push({
          t: "link",
          href,
          children: [{ t: "text", text: auto[1]! }],
        })
        i += auto[0].length
        continue
      }
    }
    if (char === "h" && (i === 0 || !/\w/.test(text[i - 1]!))) {
      const match = bareLink.exec(rest)
      const address = match && trimmedAddress(match[0])
      const href = address && safeHref(address)
      if (address && href) {
        flush()
        out.push({ t: "link", href, children: [{ t: "text", text: address }] })
        i += address.length
        continue
      }
    }
    const emphasis = emphasisAt(text, i)
    if (emphasis) {
      wrap(emphasis.kind, emphasis.inner)
      i = emphasis.end
      continue
    }
    plain += char
    i++
  }
  flush()
  return out
}

const marks = [
  ["**", "strong"],
  ["__", "strong"],
  ["~~", "del"],
  ["*", "em"],
  ["_", "em"],
] as const

// The emphasis that opens at `from`: its kind, what it holds and where it ends. A mark
// opens before text, closes after text, and an underscore inside a word is part of it
// (snake_case).
const emphasisAt = (
  text: string,
  from: number,
):
  | {
      readonly kind: "strong" | "em" | "del"
      readonly inner: string
      readonly end: number
    }
  | undefined => {
  for (const [mark, kind] of marks) {
    if (!text.startsWith(mark, from) || space.test(text[from + mark.length] ?? " ")) continue
    const underscore = mark[0] === "_"
    if (underscore && from > 0 && /\w/.test(text[from - 1]!)) continue
    // A single mark does not open on the first character of its double.
    if (mark.length === 1 && text[from + 1] === mark) continue
    let end = closer(text, mark, from + mark.length)
    while (end >= 0 && space.test(text[end - 1]!)) end = closer(text, mark, end + mark.length)
    if (end < 0 || end === from + mark.length) continue
    if (underscore && /\w/.test(text[end + mark.length] ?? " ")) continue
    return {
      kind,
      inner: text.slice(from + mark.length, end),
      end: end + mark.length,
    }
  }
  return undefined
}

// ---- Blocks

const fence = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/
const heading = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const rule = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const quoteLine = /^ {0,3}>\s?/
const bullet = /^( {0,3})([-*+]|\d{1,9}[.)])(\s+|$)/
const tableDivider = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

const isBlank = (line: string): boolean => line.trim() === ""

const cells = (line: string): string[] => {
  const trimmed = line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
  const found: string[] = []
  let current = ""
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      current += "|"
      i++
    } else if (trimmed[i] === "`") {
      const end = trimmed.indexOf("`", i + 1)
      const stop = end < 0 ? trimmed.length - 1 : end
      current += trimmed.slice(i, stop + 1)
      i = stop
    } else if (trimmed[i] === "|") {
      found.push(current.trim())
      current = ""
    } else current += trimmed[i]
  }
  found.push(current.trim())
  return found
}

const alignOf = (cell: string): Align => {
  const left = cell.startsWith(":")
  const right = cell.endsWith(":")
  return left && right ? "center" : right ? "right" : left ? "left" : null
}

// Whether a line, in the middle of a paragraph, starts something else.
const interrupts = (line: string, next: string | undefined): boolean => {
  if (fence.test(line) || heading.test(line) || rule.test(line) || quoteLine.test(line)) return true
  const item = bullet.exec(line)
  if (item && !isBlank(line.slice(item[0].length)))
    return !/^\d/.test(item[2]!) || /^1[.)]$/.test(item[2]!)
  return line.includes("|") && next !== undefined && tableDivider.test(next) && next.includes("-")
}

const indentOf = (line: string): number => /^ */.exec(line)![0].length

const parseList = (
  lines: readonly string[],
  from: number,
): { readonly block: MarkdownBlock; readonly next: number } => {
  const first = bullet.exec(lines[from]!)!
  const ordered = /^\d/.test(first[2]!)
  const kind = ordered ? first[2]!.slice(-1) : first[2]!
  const sameList = (line: string): boolean => {
    const head = bullet.exec(line)
    if (!head) return false
    return ordered ? /^\d/.test(head[2]!) && head[2]!.slice(-1) === kind : head[2] === kind
  }
  const items: (readonly MarkdownBlock[])[] = []
  let tight = true
  let i = from
  while (i < lines.length && sameList(lines[i]!)) {
    // The item's text starts after its mark; what follows is indented under it.
    const indent = bullet.exec(lines[i]!)![0].length
    const body = [lines[i]!.slice(indent)]
    i++
    while (i < lines.length) {
      const line = lines[i]!
      if (isBlank(line)) {
        // A blank line ends the item unless more of it follows, indented.
        const after = lines.slice(i + 1).find((each) => !isBlank(each))
        if (after === undefined || indentOf(after) < 2) break
        tight = false
        body.push("")
      } else if (indentOf(line) >= 2) body.push(line.slice(Math.min(indentOf(line), indent)))
      else if (!bullet.test(line) && !interrupts(line, lines[i + 1]) && !isBlank(body.at(-1)!))
        // A lazy continuation of the item's paragraph.
        body.push(line)
      else break
      i++
    }
    items.push(parseBlocks(body))
    // Blank lines between items don't end the list.
    let ahead = i
    while (ahead < lines.length && isBlank(lines[ahead]!)) ahead++
    if (ahead < lines.length && sameList(lines[ahead]!)) {
      if (ahead > i) tight = false
      i = ahead
    }
  }
  return {
    block: {
      t: "list",
      ordered,
      start: ordered ? Number.parseInt(first[2]!, 10) : 1,
      tight,
      items,
    },
    next: i,
  }
}

const parseBlocks = (lines: readonly string[]): readonly MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (isBlank(line)) {
      i++
      continue
    }
    const open = fence.exec(line)
    if (open) {
      const marker = open[1]!
      const body: string[] = []
      i++
      while (
        i < lines.length &&
        !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i]!)
      )
        body.push(lines[i++]!)
      i++
      blocks.push({ t: "code", lang: open[2]!, text: body.join("\n") })
      continue
    }
    const title = heading.exec(line)
    if (title) {
      blocks.push({
        t: "h",
        level: title[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        inline: parseInline(title[2]!),
      })
      i++
      continue
    }
    if (rule.test(line)) {
      blocks.push({ t: "hr" })
      i++
      continue
    }
    if (quoteLine.test(line)) {
      const body: string[] = []
      while (
        i < lines.length &&
        !isBlank(lines[i]!) &&
        (quoteLine.test(lines[i]!) || body.length > 0)
      ) {
        if (!quoteLine.test(lines[i]!) && interrupts(lines[i]!, lines[i + 1])) break
        body.push(lines[i]!.replace(quoteLine, ""))
        i++
      }
      blocks.push({ t: "quote", blocks: parseBlocks(body) })
      continue
    }
    if (bullet.test(line) && !isBlank(line.replace(bullet, ""))) {
      const { block, next } = parseList(lines, i)
      blocks.push(block)
      i = next
      continue
    }
    const divider = lines[i + 1]
    if (
      line.includes("|") &&
      divider !== undefined &&
      tableDivider.test(divider) &&
      divider.includes("-")
    ) {
      const head = cells(line)
      const align = cells(divider).map(alignOf)
      if (head.length === align.length) {
        const rows: string[][] = []
        i += 2
        while (i < lines.length && !isBlank(lines[i]!) && lines[i]!.includes("|"))
          rows.push(cells(lines[i++]!))
        blocks.push({
          t: "table",
          align,
          head: head.map(parseInline),
          rows: rows.map((row) => head.map((_, column) => parseInline(row[column] ?? ""))),
        })
        continue
      }
    }
    const paragraph = [line]
    i++
    while (i < lines.length && !isBlank(lines[i]!) && !interrupts(lines[i]!, lines[i + 1]))
      paragraph.push(lines[i++]!)
    // Two spaces at a line's end break the line.
    blocks.push({
      t: "p",
      inline: parseInline(
        paragraph
          .map((each, index) =>
            index < paragraph.length - 1 ? each.replace(/ {2,}$/, "\\") : each.trimEnd(),
          )
          .join("\n"),
      ),
    })
  }
  return blocks
}

export const parseMarkdown = (text: string): readonly MarkdownBlock[] =>
  parseBlocks(text.replace(/\r\n?/g, "\n").split("\n"))
