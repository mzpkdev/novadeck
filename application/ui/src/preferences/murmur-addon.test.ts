import { describe, expect, it } from "vitest"

import type { MurmurState } from "../model/murmur"
import { deviceText, murmurDownloadNote, murmurInstallSize, murmurStepTitles } from "./murmur-addon"

const state: MurmurState = {
  available: true,
  installed: false,
  enabled: false,
  wanted: true,
  sizes: { engine: 34 * 1024 * 1024, model: 1222 * 1024 * 1024 },
  installing: null,
  check: null,
  unsupported: null,
  recheck: false,
  unchecked: false,
  offers: 0,
  failure: null,
}

describe("murmur's card", () => {
  it("counts the engine and the model in what an install downloads", () => {
    expect(murmurInstallSize(state)).toBe(1256 * 1024 * 1024)
  })

  it("says what an install downloads, and that it then works offline", () => {
    expect(murmurDownloadNote(state)).toBe("Downloads 1.2 GB once, then works offline.")
  })

  it("never says GPU to the person", () => {
    expect(murmurDownloadNote(state)).not.toMatch(/GPU/)
    expect(Object.values(murmurStepTitles).join(" ")).not.toMatch(/GPU/)
    expect(murmurStepTitles.check).toBe("Checking this computer")
  })

  it("names the device it runs on", () => {
    expect(
      deviceText({
        device: "Intel Arc Graphics",
        integrated: true,
        milliseconds: 5000,
      }),
    ).toBe("Runs on Intel Arc Graphics.")
  })
})
