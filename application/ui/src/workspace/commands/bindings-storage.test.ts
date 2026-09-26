import { afterEach, describe, expect, it } from "vitest"

import { shortcutBindings } from "../shortcuts"
import { loadCommandBindings, saveCommandBindings } from "./bindings-storage"

afterEach(() => localStorage.removeItem("novadeck.command-bindings.v1"))
describe("saved command bindings", () => {
  it("restores valid bindings and exposes them to shortcut help", () => {
    const binding = {
      key: "j",
      label: "New terminal",
      ctrl: true,
      meta: false,
      shift: true,
      display: ["Ctrl", "Shift", "J"],
    }
    saveCommandBindings({ newTerminal: [binding] })
    expect(loadCommandBindings()).toEqual({ newTerminal: [binding] })
    expect(shortcutBindings().newTerminal).toEqual(binding)
  })
  it("ignores corrupt and unknown bindings", () => {
    localStorage.setItem(
      "novadeck.command-bindings.v1",
      JSON.stringify({
        newTerminal: [{ key: "j" }],
        unknownCommand: [],
      }),
    )
    expect(loadCommandBindings()).toEqual({})
    localStorage.setItem("novadeck.command-bindings.v1", "[")
    expect(loadCommandBindings()).toEqual({})
  })
})
