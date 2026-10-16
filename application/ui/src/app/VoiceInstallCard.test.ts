import { createElement, act } from "react"
import { afterEach, beforeEach, vi } from "vitest"

import { changeFailurePrefix, type VoiceState } from "../model/voice"
import { describe, expect, it } from "../test"
import { render } from "../test/render"
import { readyCardMilliseconds, VoiceInstallCard } from "./VoiceInstallCard"

const none: VoiceState = {
  available: true,
  installed: [],
  enabled: false,
  wanted: true,
  model: "turbo",
  aim: "turbo",
  language: "auto",
  sizes: { engine: 28, turbo: 574, small: 190 },
  installing: null,
  check: null,
  failure: null,
}
const installing: VoiceState = {
  ...none,
  installing: { model: "turbo", step: "model", received: 100, total: 574 },
}
const ready: VoiceState = { ...none, installed: ["turbo"], enabled: true }

const card = (state: VoiceState, calls: string[] = []) =>
  createElement(VoiceInstallCard, {
    state,
    keys: ["Ctrl", "Shift", "M"],
    onInstall: () => void calls.push("install"),
    onCancel: () => void calls.push("cancel"),
  })

const text = (view: { container: HTMLElement }): string => view.container.textContent ?? ""
const button = (view: { container: HTMLElement }, name: string): HTMLButtonElement | undefined =>
  [...view.container.querySelectorAll("button")].find((each) => each.textContent === name)

describe("voice input's install card", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("shows nothing before an install, or for an engine update of voice that is ready", () => {
    const view = render(card(none))
    expect(text(view)).toBe("")
    view.rerender(card({ ...ready, installing: installing.installing }))
    expect(text(view)).toBe("")
    view.unmount()
  })

  it("shows the install's progress with Cancel, then says it is ready and goes by itself", () => {
    const calls: string[] = []
    const view = render(card(installing, calls))
    expect(text(view)).toContain("Setting up voice input")
    expect(text(view)).toContain("Downloading model")
    expect(view.container.querySelector('[role="progressbar"]')).not.toBeNull()
    act(() => button(view, "Cancel")?.click())
    expect(calls).toEqual(["cancel"])

    view.rerender(card(ready, calls))
    expect(text(view)).toContain("Voice input ready")
    expect(text(view)).toContain("Hold CtrlShiftM to talk.")
    act(() => void vi.advanceTimersByTime(readyCardMilliseconds))
    expect(text(view)).toBe("")
    view.unmount()
  })

  it("goes away on its close button once ready", () => {
    const view = render(card(installing))
    view.rerender(card(ready))
    act(() => view.container.querySelector<HTMLButtonElement>("[aria-label=Close]")?.click())
    expect(text(view)).toBe("")
    view.unmount()
  })

  it("hides on its close button while the install goes on, without cancelling", () => {
    const calls: string[] = []
    const view = render(card(installing, calls))
    act(() => view.container.querySelector<HTMLButtonElement>("[aria-label=Close]")?.click())
    expect(text(view)).toBe("")
    expect(calls).toEqual([])
    view.rerender(card(ready, calls))
    expect(text(view)).toContain("Voice input ready")
    view.unmount()
  })

  it("shows nothing after a cancel", () => {
    const view = render(card(installing))
    view.rerender(card(none))
    expect(text(view)).toBe("")
    view.unmount()
  })

  it("shows nothing once the person said no thanks, nor for a setting that was refused", () => {
    const view = render(card({ ...none, wanted: false, failure: "The download stopped." }))
    expect(text(view)).toBe("")
    view.rerender(card({ ...none, failure: `${changeFailurePrefix}: Not installed.` }))
    expect(text(view)).toBe("")
    view.rerender(card(installing))
    view.rerender(card({ ...installing, wanted: false }))
    expect(text(view)).toBe("")
    view.unmount()
  })

  it("does not say ready for an install it did not follow, or one that failed or was cancelled", () => {
    const view = render(card(installing))
    view.rerender(card({ ...none, failure: "Out of space." }))
    // A later toggle in Addons turns it on without this card following an install.
    view.rerender(card(ready))
    expect(text(view)).toBe("")
    view.rerender(card(none))
    view.unmount()
  })

  it("shows a failure with Try again, which installs again, and a close that hides it", () => {
    const calls: string[] = []
    const failed = { ...none, failure: "The download stopped." }
    const view = render(card(installing, calls))
    view.rerender(card(failed, calls))
    expect(text(view)).toContain("The download stopped.")
    act(() => button(view, "Try again")?.click())
    expect(calls).toEqual(["install"])

    act(() => view.container.querySelector<HTMLButtonElement>("[aria-label=Close]")?.click())
    expect(text(view)).toBe("")
    view.unmount()
  })
})
