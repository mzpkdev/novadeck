import { describe, expect, it } from "../test.js"
import { restoredDraft } from "./restore.js"

const echoed = ["header", "", "❯ Take your time", "", "✻ Working…", "", "────", "❯ ", "────"]
const restored = ["header", "", "", "", "", "", "────", "❯ Take your time", "────"]

describe("a restored draft", () => {
  it("is the turn's prompt back alone in the box, where only its echo was", () => {
    expect(restoredDraft(echoed, restored, "Take your time")).toBe(true)
  })

  it("is not the echo that stays above the box, as Codex and Antigravity leave it", () => {
    const interrupted = [...echoed]
    interrupted[4] = "■ Conversation interrupted"
    expect(restoredDraft(echoed, interrupted, "Take your time")).toBe(false)
  })

  it("holds a multi-line prompt on the rows it spans", () => {
    const before = ["header", "❯ one", "  two", "", "────", "❯ ", "────"]
    const after = ["header", "", "", "", "────", "❯ one", "  two"]
    expect(restoredDraft(before, after, "one\ntwo")).toBe(true)
  })

  it("is not a box holding more than the prompt, such as text the person added", () => {
    const typed = [...restored]
    typed[7] = "❯ Take your time and more"
    expect(restoredDraft(echoed, typed, "Take your time")).toBe(false)
    const merged = [...restored]
    merged[7] = "❯ their draft Take your time"
    expect(restoredDraft(echoed, merged, "Take your time")).toBe(false)
  })

  it("is not a prompt that already showed in the box before", () => {
    expect(restoredDraft(restored, restored, "Take your time")).toBe(false)
  })
})
