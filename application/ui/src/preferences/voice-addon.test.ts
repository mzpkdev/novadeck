import { describe, expect, it } from "vitest"

import type { VoiceState } from "../model/voice"
import { formatSize, installedSize, installSize, voiceSetUp } from "./voice-addon"

const megabyte = 1024 * 1024
const state: VoiceState = {
  available: true,
  installed: [],
  enabled: false,
  wanted: true,
  model: "turbo",
  aim: "turbo",
  language: "auto",
  sizes: { engine: 28 * megabyte, turbo: 1600 * megabyte, small: 190 * megabyte },
  installing: null,
  check: null,
  failure: null,
}

describe("whether voice input is set up", () => {
  const check = { model: "small", milliseconds: 3000, gpu: false, recommended: "small" } as const
  it("needs its model installed and either checked or turned on", () => {
    expect(voiceSetUp(state)).toBe(false)
    // A cancel left the model on disk, never checked: Addons offers the install.
    expect(voiceSetUp({ ...state, installed: ["small"], model: "small" })).toBe(false)
    expect(voiceSetUp({ ...state, installed: ["small"], model: "small", check })).toBe(true)
    expect(voiceSetUp({ ...state, installed: ["small"], model: "small", enabled: true })).toBe(true)
  })

  it("quotes the model an install aims for", () => {
    expect(installSize({ ...state, aim: "small" })).toBe(218 * megabyte)
  })
})

describe("voice input sizes", () => {
  it("name megabytes, and gigabytes from one up", () => {
    expect(formatSize(190 * megabyte)).toBe("190 MB")
    expect(formatSize(1600 * megabyte)).toBe("1.6 GB")
    expect(formatSize(10)).toBe("1 MB")
    expect(formatSize(0)).toBe("0 MB")
  })

  it("count the engine in an install only until it is there", () => {
    expect(installSize(state)).toBe(1628 * megabyte)
    expect(installSize({ ...state, installed: ["small"] })).toBe(1600 * megabyte)
  })

  it("count the engine and every installed model in what an uninstall frees", () => {
    expect(installedSize({ ...state, installed: ["turbo", "small"] })).toBe(1818 * megabyte)
  })
})
