import { describe, expect, it } from "../test.js"
import { afterKeys, emptyLine, type Line } from "./line.js"

// The line after each piece of input is sent, and whether any Enter entered a line.
const send = (...pieces: string[]) => {
  let line: Line = emptyLine
  let entered = false
  for (const piece of pieces) {
    const next = afterKeys(line, piece)
    line = next.line
    entered ||= next.entered
  }
  return { line, entered }
}

describe("the line typed at a prompt", () => {
  it("is entered by an Enter after characters, in one input or in several", () => {
    expect(send("ls\r").entered).toBe(true)
    expect(send("l", "s", "\r").entered).toBe(true)
    expect(send("ls\n").line).toEqual(emptyLine)
  })

  it("is not entered by an Enter on an empty prompt, however many", () => {
    expect(send("\r").entered).toBe(false)
    expect(send("\r", "\r", "\r").entered).toBe(false)
  })

  it("is empty after a line typed and erased, or cleared by Ctrl+U, Ctrl+C or Ctrl+W", () => {
    expect(send("ls", "\u007f\u007f", "\r").entered).toBe(false)
    expect(send("ls", "\b\b\b\b", "\r").entered).toBe(false)
    for (const key of ["\u0015", "\u0003", "\u0017"])
      expect(send("some words", key, "\r").entered).toBe(false)
  })

  it("keeps its length through Ctrl+L, arrows left and right and unknown escape sequences", () => {
    expect(send("ls", "\u000c", "\r").entered).toBe(true)
    expect(send("\u000c", "\r").entered).toBe(false)
    expect(send("ls", "\u001b[D\u001b[C", "\r").entered).toBe(true)
    expect(send("\u001b[1;5C\u001b[H", "\r").entered).toBe(false)
  })

  it("is unknown, and so entered, after history, search, completion or a paste", () => {
    for (const keys of ["\u001b[A", "\u001b[B", "\u001bOA", "\u0012", "\t", "\u001b[200~"])
      expect(send(keys, "\r").entered).toBe(true)
    // Unknown ends with the line.
    expect(send("\u001b[A", "\r", "\r").line).toEqual(emptyLine)
    expect(send("\u001b[A", "\r", "\r").entered).toBe(true)
    expect(send("\u001b[A", "\u0015", "\r").entered).toBe(false)
  })

  it("counts a character that arrives in the same input as the Enter", () => {
    expect(send("\u007f", "x\r").entered).toBe(true)
  })
})
