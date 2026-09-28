import { describe, expect, it } from "../test"
import { resumableProgram, resumeCommand } from "./resume"

const session = "0c8d6f2e-5b1a-4a7e-9d3c-2f4b6a8e1c0d"

describe("resuming a program", () => {
  it("knows Claude Code and Codex", () => {
    expect(resumableProgram("claude")).toBe("claude")
    expect(resumableProgram("codex")).toBe("codex")
    expect(["vim", "node", "zsh", "", "toString", undefined].map(resumableProgram)).toEqual(
      Array(6).fill(undefined),
    )
  })

  it("builds each one's plain resume command for a session", () => {
    expect(resumeCommand("claude", session)).toBe(`claude --resume ${session}`)
    expect(resumeCommand("codex", session)).toBe(`codex resume ${session}`)
  })

  it("builds nothing for another program", () => {
    expect(resumeCommand("vim", session)).toBeUndefined()
  })

  it("refuses a session id that could not be typed as a plain word", () => {
    for (const unsafe of [
      "",
      "a b",
      "-rf",
      "x;rm -rf ~",
      "$(id)",
      "'quoted'",
      "../../etc",
      "line\r",
      "tab\t",
      "a".repeat(129),
    ])
      expect(resumeCommand("claude", unsafe)).toBeUndefined()
  })
})
