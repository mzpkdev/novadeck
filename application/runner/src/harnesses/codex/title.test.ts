import { describe, expect, it } from "../../test.js"
import { title, titleSetting } from "./title.js"

describe("Codex's terminal title", () => {
  it("shows its prompt once it says Ready, with the start of its thread's id", () => {
    expect(title("Ready | 01a0f932-a824-7c30-b713-b59ed...", 9)).toEqual({
      type: "prompt-shown",
      agent: "codex",
      instance: null,
      startedAt: 9,
      sessionPrefix: "01a0f932-a824-7c30-b713-b59ed",
    })
    // Its state alone, as it first sets it; or a whole id, which it doesn't cut short.
    expect(title("Ready", 9)).not.toHaveProperty("sessionPrefix")
    expect(title("Ready | 01a0f932-a824-7c30-b713-b59ed562f00b", 9)).toMatchObject({
      sessionPrefix: "01a0f932-a824-7c30-b713-b59ed562f00b",
    })
  })

  it("says nothing while it works, nor for any other title", () => {
    for (const text of [
      "Working | 01a0f932-a824-7c30-b713-b59ed...",
      "w",
      "codex | Ready",
      "Ready | ls",
      "",
    ])
      expect(title(text, 9)).toBeUndefined()
  })

  it("is the title NovaDeck's shim asks for: its state, then its thread's id", () => {
    expect(titleSetting).toBe("tui.terminal_title=['status','thread-id']")
  })
})
