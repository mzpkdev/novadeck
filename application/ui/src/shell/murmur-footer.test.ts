import type { MurmurState } from "../model/murmur"
import { describe, expect, it } from "../test"
import { footerPhase, footerText, installPercent, isSnapshot, stepText } from "./murmur-footer"

const idle: MurmurState = {
  available: true,
  installed: false,
  enabled: false,
  wanted: true,
  sizes: { engine: 100, model: 300 },
  installing: null,
  check: null,
  unsupported: null,
  recheck: false,
  unchecked: false,
  offers: 1,
  failure: null,
}
const installing = (step: "engine" | "model" | "check", received: number): MurmurState => ({
  ...idle,
  installing: {
    step,
    received,
    total: step === "engine" ? 100 : step === "model" ? 300 : 0,
    engineOnly: false,
  },
})
const checked: MurmurState = {
  ...idle,
  installed: true,
  enabled: true,
  check: { device: "Intel Arc Graphics", integrated: true, milliseconds: 900 },
}

describe("Murmur's footer item", () => {
  it("shows an install as it goes, whoever started it", () => {
    expect(footerPhase("idle", installing("engine", 10), null)).toBe("installing")
    expect(footerPhase("installing", installing("check", 0), null)).toBe("installing")
  })

  it("ends in done for an install that passed its check", () => {
    expect(footerPhase("installing", checked, null)).toBe("done")
  })

  it("ends in failed with the failure of an install that may pass, and in unavailable when it can't", () => {
    expect(footerPhase("installing", { ...idle, failure: "The download stopped." }, null)).toBe(
      "failed",
    )
    expect(footerPhase("installing", { ...idle, unsupported: "No device." }, null)).toBe(
      "unavailable",
    )
  })

  it("leaves when an install is cancelled, as the runner leaves it: files, a check owed, no failure", () => {
    // Cancelled in the check, once the model is down.
    const cancelled: MurmurState = { ...idle, installed: true, unchecked: true }
    expect(footerPhase("installing", cancelled, null)).toBe("idle")
    // Cancelled while downloading.
    expect(footerPhase("installing", idle, null)).toBe("idle")
  })

  it("shows a failure that arrived from a refused call, but not the one the app started with", () => {
    const failed = { ...idle, failure: "Couldn't install: refused." }
    expect(footerPhase("idle", failed, null)).toBe("failed")
    expect(footerPhase("idle", failed, failed.failure)).toBe("idle")
    // A failure of a murmur that works is Addons'.
    expect(footerPhase("idle", { ...checked, failure: "Murmur stopped." }, null)).toBe("idle")
  })

  it("judges nothing before the runner's first snapshot, so a past run's failure never shows", () => {
    const placeholder: MurmurState = { ...idle, sizes: { engine: 0, model: 0 }, offers: 0 }
    expect(isSnapshot(placeholder)).toBe(false)
    expect(isSnapshot(idle)).toBe(true)
    // Mounted before the snapshot: the baseline is unknown, and nothing is shown.
    expect(footerPhase("idle", placeholder, undefined)).toBe("idle")
    expect(footerPhase("idle", { ...idle, failure: "From a past run." }, undefined)).toBe("idle")
    // Once the snapshot gave the baseline, that failure is not an install's.
    expect(footerPhase("idle", { ...idle, failure: "From a past run." }, "From a past run.")).toBe(
      "idle",
    )
  })

  it("shows nothing for an engine update the runner says it runs, whatever the check holds", () => {
    const engine = { step: "engine" as const, received: 1, total: 100, engineOnly: true }
    // The check kept: the usual case.
    expect(footerPhase("idle", { ...checked, installing: engine }, null)).toBe("idle")
    // The check dropped, as when its device went away: still the engine's own update, so no
    // item, and no failure of it opens a sheet by itself.
    const dropped = { ...checked, check: null, installing: engine }
    expect(footerPhase("idle", dropped, null)).toBe("idle")
    // What the runner says of itself from rest is Addons': a device that went away, a failed
    // engine update (the check dropped, or the interface moved on and nothing is installed).
    for (const state of [
      { ...checked, check: null, unchecked: true, failure: "The graphics device went away." },
      { ...idle, failure: "The download stopped: the connection dropped." },
    ])
      expect(footerPhase("idle", state, null)).toBe("idle")
    // Ended, still no "done": it was never shown.
    expect(footerPhase("idle", checked, null)).toBe("idle")
  })

  it("shows an install the person started, even over files that are there", () => {
    const retry: MurmurState = {
      ...checked,
      check: null,
      installing: { step: "check", received: 0, total: 0, engineOnly: false },
    }
    expect(footerPhase("idle", retry, null)).toBe("installing")
  })

  it.each([
    "Couldn't change the setting: the runner is busy.",
    "Couldn't uninstall: Disk busy.",
    "Couldn't cancel the install: the runner is busy.",
  ])("leaves the refusal of another call to Addons: %s", (failure) => {
    const refused = { ...idle, failure }
    expect(footerPhase("idle", refused, null)).toBe("idle")
    expect(footerPhase("installing", refused, null)).toBe("idle")
    expect(footerPhase("failed", refused, null)).toBe("idle")
  })

  it("shows a refused install, and a failure of the install itself", () => {
    expect(footerPhase("idle", { ...idle, failure: "Couldn't install: refused." }, null)).toBe(
      "failed",
    )
    expect(footerPhase("installing", { ...idle, failure: "The download stopped." }, null)).toBe(
      "failed",
    )
  })

  it("keeps the failed label short, and says the failure once in the live summary", () => {
    const failed = { ...idle, failure: "The download stopped." }
    expect(footerText("failed", failed).label).toBe("Murmur \u00b7 failed")
    expect(footerText("failed", failed).summary).toBe(
      "Murmur couldn't turn on. The download stopped.",
    )
  })

  it("leaves a failed item once the failure is cleared", () => {
    expect(footerPhase("failed", idle, null)).toBe("idle")
    expect(footerPhase("failed", { ...idle, failure: "Still." }, null)).toBe("failed")
  })

  it("counts the download as one, the check as none", () => {
    expect(installPercent(installing("engine", 50))).toBe(13)
    expect(installPercent(installing("model", 150))).toBe(63)
    expect(installPercent(installing("check", 0))).toBeNull()
    expect(installPercent(idle)).toBeNull()
  })

  it("says one stable line to assistive technology, whatever the percent", () => {
    expect(footerText("installing", installing("engine", 10)).label).toBe("Murmur 3%")
    expect(footerText("installing", installing("model", 200)).summary).toBe("Setting up Murmur")
    expect(footerText("installing", installing("engine", 10)).summary).toBe(
      footerText("installing", installing("model", 200)).summary,
    )
    expect(footerText("installing", installing("check", 0)).label).toBe("Murmur")
    expect(footerText("done", checked).label).toBe("Terminals name themselves now")
  })

  it("says the step, never GPU", () => {
    expect(stepText(installing("check", 0))).toBe("Checking this computer")
    expect(stepText(installing("model", 1024 * 1024))).toMatch(/^Downloading model/)
    expect(stepText(idle)).toBe("Starting…")
  })
})
