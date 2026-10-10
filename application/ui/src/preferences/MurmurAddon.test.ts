import { createElement } from "react"
import { vi } from "vitest"

import type { MurmurState } from "../model/murmur"
import { describe, expect, it } from "../test"
import { render } from "../test/render"
import { MurmurAddon } from "./MurmurAddon"

const unchecked: MurmurState = {
  available: true,
  installed: true,
  enabled: false,
  wanted: true,
  sizes: { engine: 34 * 1024 * 1024, model: 1222 * 1024 * 1024 },
  installing: null,
  check: null,
  failure:
    "Murmur is installed but has not passed its check on this computer's GPU yet. Try again.",
}

const actions = () => ({
  install: vi.fn<() => void>(),
  cancel: vi.fn<() => void>(),
  uninstall: vi.fn<() => void>(),
  set: vi.fn<(settings: { enabled?: boolean }) => void>(),
})

describe("murmur's card when it is installed but has not passed its check", () => {
  it("shows the switch and the failure with Try again, and no device", () => {
    const calls = actions()
    const { container, unmount } = render(
      createElement(MurmurAddon, { murmur: { state: unchecked, actions: calls } }),
    )
    expect(container.querySelector("[role=switch]")?.getAttribute("aria-checked")).toBe("false")
    expect(container.querySelector("[role=alert]")?.textContent).toMatch(/has not passed its check/)
    expect(container.textContent).not.toMatch(/Runs on/)
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    )
    retry?.click()
    expect(calls.install).toHaveBeenCalledOnce()
    unmount()
  })
})
