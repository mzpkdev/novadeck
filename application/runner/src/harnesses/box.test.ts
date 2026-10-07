import { readFileSync } from "node:fs"
import { join } from "node:path"

import headless from "@xterm/headless"

import { screenText, type ScreenText } from "../terminals/doorbell.js"
import { describe, expect, it } from "../test.js"
import { box as agy } from "./agy/box.js"
import { compact, isEmpty, type BoxProfile } from "./box.js"
import { box as claude } from "./claude/box.js"
import { box as codex } from "./codex/box.js"

// Each harness's input box, read off the screens real runs drew (fixtures/input-box.probe.json,
// from e2e/probes/input-box.e2e.ts): the pinned version and the latest of 2026-10-07.
type State = {
  readonly height: number
  readonly cursor: { readonly row: number; readonly column: number }
  readonly rows: { readonly [row: string]: string }
  readonly bright: { readonly [row: string]: string }
}
type Fixture = {
  readonly versions: { readonly [version: string]: { readonly [name: string]: State } }
}

const fixture = (harness: string): Fixture =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, harness, "fixtures", "input-box.probe.json"), "utf8"),
  ) as Fixture

const screenOf = ({ height, cursor, rows, bright }: State): ScreenText => {
  const all = Array.from({ length: height }, (_, row) => rows[row] ?? "")
  return {
    rows: all,
    bright: all.map((row, index) => bright[index] ?? row),
    cursor,
    bracketedPaste: true,
  }
}

const hold = (...lines: string[]) => lines.join("\n")
const three = hold("one", "two", "three")
const wrapped = Array.from({ length: 30 }, () => "wrapping words").join(" ")
const ten = hold(...Array.from({ length: 10 }, (_, index) => `Short line ${index + 1}`))
const twentyFive = hold(...Array.from({ length: 25 }, (_, index) => `Short line ${index + 1}`))
const words = (count: number) => Array.from({ length: count }, (_, i) => `w${i % 10}`).join(" ")

/** What a state's box holds: nothing, exactly some text, or a collapsed paste. */
type Expect = "empty" | "collapsed" | { readonly text: string }

// The states every harness shows alike.
const alike: { readonly [name: string]: Expect } = {
  "1 ready empty": "empty",
  "2 ready first key": { text: "D" },
  "4 draft pasted": { text: "Draft of the person" },
  "5 draft typed": { text: "Typed draft" },
  "6 short pasted": { text: "go" },
  "7 three lines": { text: three },
  "8 wrapped line": { text: wrapped },
  "9 long collapsed": "collapsed",
  "12 after turn": "empty",
  "13 draft after turn": { text: "Draft after turn" },
  "14 mid-turn empty": "empty",
  "15 mid-turn short pasted": { text: "go" },
  "16 mid-turn three lines": { text: three },
  "17 mid-turn long collapsed": "collapsed",
  "size 700 chars": { text: words(240) },
  "size 1500 chars": "collapsed",
}

// Where a harness collapses a paste, which differs: Claude Code from ten lines, Antigravity
// from some number of lines between ten and twenty-five, Codex from about a thousand characters.
const harnesses: readonly {
  readonly name: string
  readonly profile: BoxProfile
  readonly versions: readonly string[]
  readonly states: { readonly [name: string]: Expect }
}[] = [
  {
    name: "Claude Code",
    profile: claude,
    versions: ["2.1.287", "2.1.292"],
    states: { ...alike, "size 10 lines": "collapsed", "size 25 lines": "collapsed" },
  },
  {
    name: "Codex",
    profile: codex,
    versions: ["0.159.3", "0.160.1"],
    states: { ...alike, "size 10 lines": { text: ten }, "size 25 lines": { text: twentyFive } },
  },
  {
    name: "Antigravity",
    profile: agy,
    versions: ["1.2.14", "1.3.1"],
    states: { ...alike, "size 10 lines": { text: ten }, "size 25 lines": "collapsed" },
  },
]

describe.each(harnesses)("the input box of $name", ({ name, profile, versions, states }) => {
  const key = name === "Claude Code" ? "claude" : name === "Codex" ? "codex" : "agy"
  const { versions: seen } = fixture(key)

  describe.each(versions)("as %s draws it", (version) => {
    const shown = seen[version]!

    it("is probed in every state the harness is checked in", () => {
      expect(Object.keys(shown)).toEqual(expect.arrayContaining(Object.keys(states)))
    })

    it.each(Object.entries(states))("reads %s", (state, expected) => {
      const read = profile.read(screenOf(shown[state]!))
      expect(read, "its box is found").toBeDefined()
      if (expected === "empty") expect(isEmpty(read!), `holds ${JSON.stringify(read)}`).toBe(true)
      else if (expected === "collapsed") expect(profile.collapsed(read!)).toBe(true)
      else {
        expect(isEmpty(read!)).toBe(false)
        expect(profile.collapsed(read!)).toBe(false)
        expect(compact(read!.text)).toBe(compact(expected.text))
      }
    })

    it("does not take a collapsed placeholder with more text for the placeholder alone", () => {
      const read = profile.read(screenOf(shown["10 collapsed then more"]!))
      expect(read).toBeDefined()
      expect(isEmpty(read!)).toBe(false)
      expect(profile.collapsed(read!)).toBe(false)
      expect(compact(read!.text)).toContain("andmore")
    })

    it("places the box where the cursor is, whatever is above it", () => {
      for (const [state, screen] of Object.entries(shown)) {
        const read = profile.read(screenOf(screen))
        if (!read) continue
        expect(screen.cursor.row, state).toBeGreaterThanOrEqual(read.first)
        expect(screen.cursor.row, state).toBeLessThanOrEqual(read.last)
      }
    })

    it("finds no box on a screen that shows none", () => {
      expect(profile.read({ rows: Array<string>(40).fill(""), bracketedPaste: true })).toBe(
        undefined,
      )
      const text = screenOf(shown["12 after turn"]!)
      const noCursor = { ...text, cursor: { row: 2, column: 4 } }
      expect(profile.read(noCursor)).toBe(undefined)
    })
  })
})

/** A screen as the terminal emulator draws what the TUI writes. */
const drawn = async (output: string, rows = 12): Promise<ScreenText> => {
  const screen = new headless.Terminal({ cols: 60, rows, allowProposedApi: true })
  await new Promise<void>((resolve) => screen.write(output, resolve))
  const text = screenText(screen)
  screen.dispose()
  return text
}
const dim = (text: string) => `\x1b[2m${text}\x1b[22m`

describe("a box whose placeholder is drawn dim", () => {
  const rule = "─".repeat(60)

  it("is empty in Codex though its row shows the suggestion", async () => {
    const screen = await drawn(`\x1b[11;1H› ${dim("Ask Codex to do anything")}\x1b[11;3H`)
    expect(screen.rows[10]).toContain("Ask Codex to do anything")
    expect(isEmpty(codex.read(screen)!)).toBe(true)
  })

  it("is empty in Claude Code though its row shows a suggestion", async () => {
    const screen = await drawn(
      `\x1b[8;1H${rule}\x1b[9;1H❯ ${dim('Try "fix lint errors"')}\x1b[10;1H${rule}\x1b[9;3H`,
    )
    expect(screen.rows[8]).toContain("fix lint errors")
    expect(isEmpty(claude.read(screen)!)).toBe(true)
  })

  it("is empty in Antigravity though its row shows a suggestion", async () => {
    const screen = await drawn(
      `\x1b[8;1H${rule}\x1b[9;1H> ${dim("Ask anything")}\x1b[10;1H${rule}\x1b[9;3H`,
    )
    expect(isEmpty(agy.read(screen)!)).toBe(true)
  })

  it("still holds a draft the person typed in the same words, as the cursor is past them", async () => {
    // Not drawn dim, so it is text; and drawn dim with the cursor past it, it is text still.
    const typed = await drawn(`\x1b[11;1H› Ask Codex to do anything\x1b[11;27H`)
    expect(compact(codex.read(typed)!.text)).toBe("AskCodextodoanything")
    const faint = await drawn(`\x1b[11;1H› ${dim("Ask Codex")}\x1b[11;12H`)
    expect(isEmpty(codex.read(faint)!)).toBe(false)
  })
})
