import { describe, expect, it } from "../test.js"
import { inputParts, keysOf } from "./keys.js"

const submits = (data: string, queueKey?: string) =>
  inputParts(keysOf(data, queueKey), false).map(({ submits: enter }) => enter)

describe("the person's keys", () => {
  it("submit only with a bare Enter", () => {
    expect(submits("fix it\r")).toEqual([false, false, false, false, false, false, true])
    // Shift or Alt+Enter, as a TUI reads it, is a newline in the box.
    expect(submits("\x1b\r")).toEqual([false])
    // A paste is one key, whatever it holds.
    expect(submits("\x1b[200~one\rtwo\r\x1b[201~")).toEqual([false])
    expect(submits("\n")).toEqual([false])
    // Codex queues with Tab; elsewhere Tab only moves.
    expect(submits("\t", "\t")).toEqual([true])
    expect(keysOf("\t")).toEqual([{ kind: "navigation", text: "\t" }])
  })

  it("tell moves from typing", () => {
    expect(keysOf("\x1b[A\x1bOB\x1b[1;5C\x1b[H\x1b[3~a")).toEqual([
      { kind: "navigation", text: "\x1b[A" },
      { kind: "navigation", text: "\x1bOB" },
      { kind: "navigation", text: "\x1b[1;5C" },
      { kind: "navigation", text: "\x1b[H" },
      // Delete changes the box.
      { kind: "other", text: "\x1b[3~" },
      { kind: "other", text: "a" },
    ])
    expect(keysOf("\x1b")).toEqual([{ kind: "other", text: "\x1b" }])
  })

  it("answer a request up to its first answering key; what follows is a draft", () => {
    // Moves, then Enter picks: all of it answers.
    expect(inputParts(keysOf("\x1b[B\x1b[B\r"), true)).toEqual([
      { submits: false, answers: true },
      { submits: false, answers: true },
      { submits: false, answers: true },
    ])
    // One hotkey answers; the rest is typed into the box.
    expect(inputParts(keysOf("ynext\r"), true)).toEqual([
      { submits: false, answers: true },
      { submits: false, answers: false },
      { submits: false, answers: false },
      { submits: false, answers: false },
      { submits: false, answers: false },
      { submits: true, answers: false },
    ])
    expect(inputParts(keysOf("\x1bx"), true)).toEqual([{ submits: false, answers: true }])
  })
})
