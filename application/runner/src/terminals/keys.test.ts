import { describe, expect, it } from "../test.js"
import { keysOf } from "./keys.js"

const kinds = (data: string, queueKey?: string) => keysOf(data, queueKey).map(({ kind }) => kind)

describe("the person's keys", () => {
  it("submit only with a bare Enter, or the harness's queue key", () => {
    expect(kinds("ok\r")).toEqual(["content", "content", "enter"])
    // Shift or Alt+Enter, as a TUI reads it, is a newline in the box.
    expect(kinds("\x1b\r")).toEqual(["content"])
    // A paste is one key, whatever it holds.
    expect(kinds("\x1b[200~one\rtwo\r\x1b[201~")).toEqual(["content"])
    expect(kinds("\n")).toEqual(["content"])
    // Codex queues with Tab; elsewhere Tab only moves.
    expect(kinds("\t", "\t")).toEqual(["queue"])
    expect(kinds("\t")).toEqual(["neutral"])
  })

  it("tell the keys that never change the box from those that may", () => {
    // Escape, Left, Right, Home and End.
    expect(kinds("\x1b\x1b[D\x1bOC\x1b[1;5C\x1b[H\x1b[F\x1b[4~")).toEqual(
      Array.from({ length: 7 }, () => "neutral"),
    )
    // Up and Down recall history; Delete and Backspace change it; so does a hotkey.
    expect(kinds("\x1b[A\x1bOB\x1b[3~\x7fy")).toEqual(Array.from({ length: 5 }, () => "content"))
    // Alt with a key types.
    expect(kinds("\x1bx")).toEqual(["content"])
  })

  it("leave out the mouse's scroll and motion and the focus, but take a click", () => {
    // A fullscreen TUI's scroll, as SGR, urxvt and X10 report it, and a move over it.
    expect(kinds("\x1b[<64;40;10M\x1b[<65;40;10M")).toEqual([])
    expect(kinds("\x1b[96;40;10M")).toEqual([])
    expect(kinds("\x1b[M`!!")).toEqual([])
    expect(kinds("\x1b[<35;12;7M")).toEqual([])
    // Focus out and in, among keys.
    expect(kinds("\x1b[Oa\x1b[I")).toEqual(["content"])
    // A click, pressed and released, may open a menu: input.
    expect(kinds("\x1b[<0;10;5M\x1b[<0;10;5m")).toEqual(["content", "content"])
    expect(kinds("\x1b[32;10;5M")).toEqual(["content"])
    expect(kinds("\x1b[M !!")).toEqual(["content"])
    // A key after a report is still a key.
    expect(kinds("\x1b[<65;10;5Mx\r")).toEqual(["content", "enter"])
  })
})
