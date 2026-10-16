import type { MurmurState } from "../model/murmur"
import { describe, expect, it } from "../test"
import { footerPhase, footerText, installPercent, stepText } from "./murmur-footer"

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
  offers: 1,
  failure: null,
}
const installing = (step: "engine" | "model" | "check", received: number): MurmurState => ({
  ...idle,
  installing: { step, received, total: step === "engine" ? 100 : step === "model" ? 300 : 0 },
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

  it("leaves when an install is cancelled", () => {
    expect(footerPhase("installing", idle, null)).toBe("idle")
  })

  it("shows a failure that arrived from a refused call, but not the one the app started with", () => {
    const failed = { ...idle, failure: "Couldn't install: refused." }
    expect(footerPhase("idle", failed, null)).toBe("failed")
    expect(footerPhase("idle", failed, failed.failure)).toBe("idle")
    // A failure of a murmur that works is Addons'.
    expect(footerPhase("idle", { ...checked, failure: "Murmur stopped." }, null)).toBe("idle")
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
