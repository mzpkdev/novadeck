import { createElement, createRef } from "react"

import type { Voice, VoiceState } from "../model/voice"
import { describe, expect, it } from "../test"
import { render } from "../test/render"
import { VoiceInput } from "./VoiceInput"

const base: VoiceState = {
  available: true,
  installed: [],
  enabled: false,
  wanted: true,
  model: "small",
  aim: "turbo",
  language: "auto",
  sizes: { engine: 28, turbo: 574, small: 190 },
  installing: null,
  check: null,
  failure: null,
}

const actions: Pick<Voice, "install" | "cancel" | "uninstall" | "set"> = {
  install: () => {},
  cancel: () => {},
  uninstall: () => {},
  set: () => {},
}

const card = (state: VoiceState) =>
  createElement(VoiceInput, {
    voice: { state, actions },
    open: true,
    portalContainer: createRef<HTMLElement>(),
  })

const labels = (container: HTMLElement): string[] =>
  [...container.querySelectorAll("button, [role=switch]")].map(
    (each) => each.textContent || each.getAttribute("aria-labelledby") || "",
  )

describe("voice input's card in Addons", () => {
  it("offers Install, not a bare switch, for a model a cancel left on disk unchecked", () => {
    const view = render(card({ ...base, installed: ["small"] }))
    expect(labels(view.container)).toContain("Install")
    expect(labels(view.container)).not.toContain("Uninstall")
    view.unmount()
  })

  it("offers Uninstall once the model passed its check", () => {
    const check = { model: "small", milliseconds: 3000, gpu: false, recommended: "small" } as const
    const view = render(card({ ...base, installed: ["small"], enabled: true, check }))
    expect(labels(view.container)).toContain("Uninstall")
    expect(labels(view.container)).not.toContain("Install")
    view.unmount()
  })
})
