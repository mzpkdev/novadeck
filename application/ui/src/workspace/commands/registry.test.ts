import { describe, expect, it } from "vitest"

import { commandDefinitions } from "./definitions"
import { createCommandRegistry } from "./registry"

const fixture = () => {
  const calls: string[] = []
  const errors: unknown[] = []
  let available = true
  const context = { dialog: false, editor: false, workspace: true, overlay: false }
  const registry = createCommandRegistry({
    definitions: commandDefinitions(false),
    handlers: {
      newTerminal: () => calls.push("add"),
      terminals: () => calls.push("sidebar"),
      find: () => calls.push("find"),
      recent: () => calls.push("recent"),
    },
    available: () => available,
    context: () => context,
    onError: (error) => errors.push(error),
  })
  return {
    registry,
    calls,
    errors,
    context,
    disable: () => {
      available = false
    },
  }
}
const key = (value: string, options: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key: value, cancelable: true, ...options })

describe("workspace command policy", () => {
  it("uses physical digit keys when Shift changes their character", () => {
    const { registry, calls } = fixture()
    expect(registry.handleKey(key("!", { code: "Digit1", ctrlKey: true, shiftKey: true }))).toBe(
      true,
    )
    expect(calls).toEqual(["sidebar"])
  })
  it("runs a terminal shortcut only once when xterm and the document share its event", () => {
    const { registry, calls, context } = fixture()
    context.workspace = false
    const event = key("T", { ctrlKey: true, shiftKey: true })
    expect(registry.handleKey(event)).toBe(true)
    expect(registry.handleKey(event)).toBe(true)
    expect(calls).toEqual(["add"])
    expect(event.defaultPrevented).toBe(true)
  })
  it("lets terminal text, rename editors and IME retain their keys", () => {
    const { registry, calls, context } = fixture()
    context.workspace = false
    expect(registry.handleKey(key("t"))).toBe(false)
    context.editor = true
    expect(registry.handleKey(key("T", { ctrlKey: true, shiftKey: true }))).toBe(false)
    context.editor = false
    expect(registry.handleKey(key("T", { ctrlKey: true, shiftKey: true, isComposing: true }))).toBe(
      false,
    )
    expect(calls).toEqual([])
  })
  it("reserves dialog input but permits the app's search shortcut", () => {
    const { registry, calls, context } = fixture()
    context.dialog = true
    expect(registry.handleKey(key("T", { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(registry.handleKey(key("K", { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(calls).toEqual(["find"])
  })
  it("consumes repeated creation without repeating it, while recent cycling repeats", () => {
    const { registry, calls } = fixture()
    expect(registry.handleKey(key("T", { ctrlKey: true, shiftKey: true, repeat: true }))).toBe(true)
    expect(registry.handleKey(key("Tab", { ctrlKey: true, repeat: true }))).toBe(true)
    expect(calls).toEqual(["recent"])
  })
  it("does not consume unavailable commands", () => {
    const { registry, calls, disable } = fixture()
    disable()
    expect(registry.execute("newTerminal")).toBe(false)
    expect(registry.handleKey(key("t"))).toBe(false)
    expect(calls).toEqual([])
  })
  it("reports rejected asynchronous mutations without retrying", async () => {
    const error = new Error("Could not create terminal")
    const errors: unknown[] = []
    let attempts = 0
    const registry = createCommandRegistry({
      definitions: commandDefinitions(false),
      handlers: {
        newTerminal: async () => {
          attempts++
          throw error
        },
      },
      available: () => true,
      context: () => ({ editor: false, dialog: false, workspace: true, overlay: false }),
      onError: (value) => errors.push(value),
    })
    expect(registry.execute("newTerminal")).toBe(true)
    await Promise.resolve()
    expect(attempts).toBe(1)
    expect(errors).toEqual([error])
  })
  it("permits caller-supplied bindings without retaining the replaced default", () => {
    const calls: string[] = []
    const registry = createCommandRegistry({
      definitions: commandDefinitions(false),
      handlers: { newTerminal: () => calls.push("add") },
      available: () => true,
      context: () => ({ editor: false, dialog: false, workspace: true, overlay: false }),
      onError: () => {},
      overrides: {
        newTerminal: [
          {
            label: "New terminal",
            key: "j",
            ctrl: false,
            meta: false,
            shift: false,
            display: ["J"],
          },
        ],
      },
    })
    expect(registry.handleKey(key("t"))).toBe(false)
    expect(registry.handleKey(key("j"))).toBe(true)
    expect(calls).toEqual(["add"])
  })
})
