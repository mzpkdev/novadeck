import { readFileSync } from "node:fs"
import { join } from "node:path"

import { doorbellLine } from "../harnesses/harness.js"
import { describe, expect, it } from "../test.js"
import { checkPaste, findLine, freshNonce, gate } from "./ring.js"

type Pair = {
  readonly name: string
  readonly expected: "accept" | "reject" | "draft"
  readonly before: readonly string[]
  readonly after: readonly string[]
}

const pairs = (harness: string): readonly Pair[] =>
  (
    JSON.parse(
      readFileSync(join(import.meta.dirname, "fixtures", `doorbell-${harness}.json`), "utf8"),
    ) as { pairs: Pair[] }
  ).pairs

// The probes pasted the line with this nonce.
const line = doorbellLine("n7Q2")

describe("the doorbell's test paste", () => {
  for (const harness of ["claude", "codex", "agy"])
    for (const pair of pairs(harness))
      it(`${pair.expected === "reject" ? "rejects" : "accepts"} ${harness}: ${pair.name}`, () => {
        const check = checkPaste(pair.before, pair.after, line)
        // A draft only exists if the person typed, so the gate stops it before any paste;
        // alone, the check accepts it, as the line appends to the draft.
        expect(check.accepted).toBe(pair.expected !== "reject")
      })

  it("rejects a line that was there before, or appears twice", () => {
    const before = ["> ", "", "footer"]
    const after = [`> ${line}`, "", "footer"]
    expect(checkPaste(after, after, line)).toEqual({ accepted: false, reason: "before" })
    expect(checkPaste(before, [`> ${line}`, line, "footer"], line)).toEqual({
      accepted: false,
      reason: "repeated",
    })
    expect(checkPaste(before, before, line)).toEqual({ accepted: false, reason: "absent" })
    expect(checkPaste(before, after, line)).toEqual({ accepted: true, first: 0, last: 0 })
  })

  it("rejects a change more than three rows from the line, as a closing popup", () => {
    const before = ["menu item", "b", "c", "d", "e", "> "]
    expect(checkPaste(before, ["", "b", "c", "d", "e", `> ${line}`], line)).toMatchObject({
      accepted: false,
      reason: "elsewhere",
    })
    expect(checkPaste(before, ["menu item", "b", "x", "d", "e", `> ${line}`], line)).toMatchObject({
      accepted: true,
    })
    // The box grew a row: everything above it moved up one.
    expect(
      checkPaste(
        before,
        ["b", "c", "d", "e", "> [NovaDeck: automatic notice,", "agent messages waiting, n7Q2]"],
        line,
      ),
    ).toMatchObject({
      accepted: true,
    })
  })

  it("finds the line wrapped across rows, indented or not", () => {
    expect(
      findLine(["> [NovaDeck: automatic notice, agent messages", "  waiting, n7Q2]"], line),
    ).toEqual([{ first: 0, last: 1, column: 2 }])
    expect(
      findLine(["[NovaDeck: automatic notice, agent mess", "ages waiting, n7Q2]"], line),
    ).toEqual([{ first: 0, last: 1, column: 0 }])
  })
})

// A 40-row screen, blank but for the rows given.
const screen = (rows: Record<number, string>): string[] =>
  Array.from({ length: 40 }, (_, index) => rows[index] ?? "")

describe("the doorbell's test paste where text vanished far from the line", () => {
  const [head, tail] = [line.slice(0, 40), line.slice(40)]
  const firstScreen = pairs("codex").find((pair) => pair.name.startsWith("first screen"))!
  const logo = firstScreen.before.flatMap((row, index) => (/[⣀-⣿]/.test(row) ? [index] : []))

  it("rejects a list filtered down to its top item", () => {
    const list = { 20: "› Session one", 21: "  Session two", 22: "  Session three", 38: "footer" }
    const before = screen({ ...list, 36: "› Type to search" })
    const after = screen({ ...list, 21: "", 22: "", 36: `› ${line}` })
    expect(checkPaste(before, after, line)).toEqual({ accepted: false, reason: "elsewhere" })
  })

  it("rejects a logo partly kept, or gone while a row appeared far away", () => {
    expect(logo.length).toBeGreaterThan(10)
    const partly = firstScreen.after.with(logo[4]!, firstScreen.before[logo[4]!]!)
    expect(checkPaste(firstScreen.before, partly, line)).toEqual({
      accepted: false,
      reason: "elsewhere",
    })
    const added = firstScreen.after.with(5, "  New dialog")
    expect(checkPaste(firstScreen.before, added, line)).toEqual({
      accepted: false,
      reason: "elsewhere",
    })
  })

  it("rejects a line appended to a draft as the box grows down, though a far block vanished", () => {
    const before = screen({ 5: "LOGO", 6: "LOGO", 30: "────", 31: "> /", 32: "────", 33: "footer" })
    const after = screen({ 30: "────", 31: `> /${head}`, 32: tail, 33: "────", 34: "footer" })
    expect(checkPaste(before, after, line)).toEqual({ accepted: false, reason: "elsewhere" })
  })

  it("accepts a line replacing a placeholder as the box grows down and a far block vanishes", () => {
    const before = screen({
      5: "LOGO",
      6: "LOGO",
      30: "────",
      31: "> Type a message",
      32: "────",
      33: "footer",
    })
    const after = screen({ 30: "────", 31: `> ${head}`, 32: tail, 33: "────", 34: "footer" })
    expect(checkPaste(before, after, line)).toEqual({ accepted: true, first: 31, last: 32 })
  })

  it("accepts a box growing up at a narrow width as the logo vanishes", () => {
    const footer = { 38: "  model", 39: "  ? for shortcuts" }
    const before = screen({
      1: "  >_ OpenAI Codex",
      11: "LOGO",
      12: "LOGO",
      36: "› Ask Codex to do anything",
      ...footer,
    })
    const after = screen({
      0: "  >_ OpenAI Codex",
      35: `› ${head}`,
      36: `  ${tail}`,
      38: "  model",
    })
    expect(checkPaste(before, after, line)).toEqual({ accepted: true, first: 35, last: 36 })
  })
})

describe("the doorbell's gate", () => {
  const open = { ringable: true, calmMs: 750, bracketedPaste: true, foreground: true }

  it("opens only on a ringable terminal whose screen is calm, pasting bracketed, in the foreground", () => {
    expect(gate(open)).toBe("open")
    expect(gate({ ...open, foreground: undefined })).toBe("open")
    expect(gate({ ...open, ringable: false })).toBe("not-ringable")
    expect(gate({ ...open, calmMs: 749 })).toBe("restless")
    expect(gate({ ...open, bracketedPaste: false })).toBe("no-bracketed-paste")
    expect(gate({ ...open, foreground: false })).toBe("not-foreground")
  })

  it("rings with a fresh nonce each time, of letters and digits only", () => {
    const nonce = freshNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9]{6}$/)
    expect(freshNonce()).not.toBe(nonce)
  })
})
