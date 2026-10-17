import type { ScreenText } from "@novadeck/emulator/headless"
import { describe, expect, it } from "vitest"

import {
  agreeing,
  endsText,
  footerRows,
  isEmpty,
  markedBox,
  ruledBox,
  sameText,
  wrappedRows,
  type Markers,
} from "./box.js"

const markers: Markers = { prompt: "❯", shell: "!" }
const line = "─".repeat(20)

/** A screen of `rows`, the cursor at `row` and `column`, with nothing dim. */
const screen = (rows: readonly string[], row: number, column: number): ScreenText => ({
  rows,
  bright: rows,
  bracketedPaste: true,
  alternate: false,
  columns: 40,
  cursor: { row, column },
})

describe("sameText and endsText", () => {
  it("ignore whitespace the program wrapped or indented anywhere", () => {
    expect(sameText("one two\n  three", "one two three")).toBe(true)
    expect(sameText("one two", "one two three")).toBe(false)
    expect(endsText("two three", "one two three")).toBe(true)
    expect(endsText("one", "one two three")).toBe(false)
  })

  it("ignore emoji a screen drew differently, but not a text of nothing else", () => {
    const family = "\u{1f468}‍\u{1f469}‍\u{1f467}"
    expect(sameText("hi ", `hi ${family}`)).toBe(true)
    expect(sameText("", family)).toBe(false)
    expect(sameText(family, family)).toBe(true)
  })
})

describe("wrappedRows", () => {
  it("wraps at word boundaries, a marker and indent aside", () => {
    expect(wrappedRows("aaaa bbbb", 8)).toBe(2)
    expect(wrappedRows("aaaa\nbbbb", 40)).toBe(2)
    expect(wrappedRows("a".repeat(13), 8)).toBe(3)
  })
})

describe("ruledBox", () => {
  const rows = ["history", line, "❯ hello", "  world", line, "footer"]

  it("reads the text between the lowest pair of rules, the cursor inside", () => {
    const box = ruledBox(screen(rows, 3, 7), markers)
    expect(box).toEqual({ text: "hello\nworld", mode: "prompt", first: 2, last: 3 })
    expect(box && isEmpty(box)).toBe(false)
  })

  it("reads no box with the cursor outside the rules", () => {
    expect(ruledBox(screen(rows, 5, 0), markers)).toBeUndefined()
  })

  it("reads a faint suggestion as an empty box", () => {
    const faint = { ...screen([line, "❯ try this", line], 1, 2), bright: [line, "❯", line] }
    const box = ruledBox(faint, markers)
    expect(box?.text).toBe("")
  })
})

describe("markedBox", () => {
  it("reads rows indented under the marker, up from the cursor", () => {
    const box = markedBox(screen(["old", "› hi", "  there"], 2, 7), { prompt: "›", shell: "!" })
    expect(box).toEqual({ text: "hi\nthere", mode: "prompt", first: 1, last: 2 })
  })

  it("reads no box where history sits between the cursor and a marker", () => {
    expect(markedBox(screen(["› hi", "output", "$ "], 2, 2), markers)).toBeUndefined()
  })
})

describe("agreeing", () => {
  it("refuses a prompt-marked box under a footer that says shell mode", () => {
    const box = { text: "", mode: "prompt", first: 0, last: 0 } as const
    expect(agreeing(box, true)).toBeUndefined()
    expect(agreeing(box, false)).toBe(box)
  })
})

describe("footerRows", () => {
  it("gives the rows from the cursor down, at least the last few", () => {
    const rows = ["a", "b", "c", "", "d", "e", "f"]
    expect(footerRows(screen(rows, 1, 0), 2)).toEqual(["b", "c", "d", "e", "f"])
    expect(footerRows(screen(rows, 6, 0), 2)).toEqual(["e", "f"])
  })
})
