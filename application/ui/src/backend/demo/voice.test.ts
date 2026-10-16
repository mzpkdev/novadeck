import { afterEach, beforeEach, vi } from "vitest"

import { describe, expect, it } from "../../test"
import { createDemoVoice, demoTranscript } from "./voice"

describe("the demo's voice input", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const uninstalled = (step = 100) => createDemoVoice({ step, transcribe: 10 }, "uninstalled")

  it("starts installed and on, as the try demo shows it", () => {
    const voice = createDemoVoice()
    expect(voice.state.getSnapshot()).toMatchObject({
      installed: ["turbo"],
      enabled: true,
      wanted: true,
      check: { model: "turbo", gpu: true },
    })
  })

  it("installs through the engine, the model and a check, then turns on", async () => {
    const voice = uninstalled()
    expect(voice.state.getSnapshot()).toMatchObject({ installed: [], enabled: false })
    voice.install()
    await vi.advanceTimersByTimeAsync(50)
    expect(voice.state.getSnapshot().installing).toMatchObject({ model: "turbo", step: "engine" })
    await vi.advanceTimersByTimeAsync(100)
    expect(voice.state.getSnapshot().installing?.step).toBe("model")
    await vi.advanceTimersByTimeAsync(100)
    expect(voice.state.getSnapshot().installing?.step).toBe("check")
    await vi.advanceTimersByTimeAsync(100)
    expect(voice.state.getSnapshot()).toMatchObject({
      installing: null,
      installed: ["turbo"],
      enabled: true,
      check: { model: "turbo", gpu: true },
    })
  })

  it("stops an install on cancel, and forgets everything on uninstall", async () => {
    const voice = uninstalled()
    voice.install()
    await vi.advanceTimersByTimeAsync(150)
    voice.cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(voice.state.getSnapshot()).toMatchObject({ installing: null, installed: [] })
    voice.install()
    await vi.advanceTimersByTimeAsync(400)
    voice.uninstall()
    expect(voice.state.getSnapshot()).toMatchObject({
      installed: [],
      enabled: false,
      wanted: false,
    })
  })

  it("keeps an off chosen during a first install, as the runner", async () => {
    const voice = uninstalled(10)
    voice.install()
    voice.set({ enabled: false })
    await vi.advanceTimersByTimeAsync(100)
    expect(voice.state.getSnapshot()).toMatchObject({
      installed: ["turbo"],
      enabled: false,
      wanted: false,
    })
  })

  it("is wanted until turned off, and turned on before an install is wanted again", () => {
    const voice = uninstalled()
    expect(voice.state.getSnapshot()).toMatchObject({ enabled: false, wanted: true })
    voice.set({ enabled: false })
    expect(voice.state.getSnapshot()).toMatchObject({ enabled: false, wanted: false })
    voice.set({ enabled: true })
    expect(voice.state.getSnapshot()).toMatchObject({ enabled: false, wanted: true })
  })

  it("shows each state of the offer on demand", async () => {
    const voice = createDemoVoice({ step: 100, transcribe: 10 })
    voice.show("declined")
    expect(voice.state.getSnapshot()).toMatchObject({ installed: [], wanted: false })
    voice.show("network-failure")
    expect(voice.state.getSnapshot()).toMatchObject({
      installed: [],
      wanted: true,
      failure: expect.stringContaining("connection dropped"),
    })
    voice.show("installing")
    expect(voice.state.getSnapshot().installing).toMatchObject({ step: "model" })
    voice.show("install-and-finish")
    await vi.advanceTimersByTimeAsync(400)
    expect(voice.state.getSnapshot()).toMatchObject({ installed: ["turbo"], enabled: true })
    voice.show("uninstalled")
    expect(voice.state.getSnapshot()).toMatchObject({ installed: [], wanted: true })
  })

  it("answers a canned transcript shortly after a clip ends", async () => {
    const voice = createDemoVoice({ step: 100, transcribe: 10 })
    const clip = voice.record()
    clip.append(Int16Array.of(1))
    const done = clip.finish()
    await vi.advanceTimersByTimeAsync(10)
    await expect(done).resolves.toEqual({ text: demoTranscript, language: "en" })
  })
})
