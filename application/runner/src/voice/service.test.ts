import { readdir, writeFile } from "node:fs/promises"

import type { VoiceState } from "@novadeck/protocol"
import { maxVoiceSeconds, voiceSampleRate } from "@novadeck/protocol"

import { describe, expect, it } from "../test.js"
import type { Resources } from "../testing/resources.js"
import { engineArchive, fakeLaunch, folder, modelCatalog } from "../testing/voice.js"
import { WorkspaceStore } from "../workspaces/store.js"
import type { Catalog } from "./catalog.js"
import { Voice } from "./service.js"

const pcm = (bytes: number) => Buffer.alloc(bytes).toString("base64")

const setup = async (
  resources: Resources,
  options: {
    catalog?: Catalog
    // The manifest of an engine an earlier setup made; a fresh archive would differ from
    // it by its files' times, and so would be another engine.
    engine?: false | string
    store?: WorkspaceStore
    directory?: string
  } = {},
) => {
  const store = options.store ?? new WorkspaceStore()
  if (!options.store) resources.defer(() => store.close())
  const directory = options.directory ?? (await folder(resources))
  const manifest =
    options.engine === false ? undefined : (options.engine ?? (await engineArchive(resources)))
  const voice = new Voice(store, {
    engine: manifest,
    directory,
    catalog: options.catalog ?? (await modelCatalog(resources)),
    launch: fakeLaunch,
  })
  resources.defer(() => voice.close())
  await voice.refresh()
  return { voice, store, directory, manifest }
}

/** The states a watch shows, up to the first the test is waiting for. */
const watchUntil = async (voice: Voice, done: (state: VoiceState) => boolean) => {
  const states: VoiceState[] = []
  const controller = new AbortController()
  for await (const state of voice.watch("owner", controller.signal)) {
    states.push(state)
    if (done(state)) break
  }
  controller.abort()
  return states
}

const installed = async (resources: Resources, model: "small" | "turbo" = "small") => {
  const context = await setup(resources)
  await context.voice.install(model)
  await context.voice.settled()
  return context
}

describe("voice input without an engine", () => {
  it("is unavailable and refuses to install", async ({ resources }) => {
    const { voice } = await setup(resources, { engine: false })

    expect(voice.state()).toMatchObject({ available: false, installed: [], enabled: false })
    expect(voice.state().sizes.engine).toBe(0)
    await expect(voice.install("small")).rejects.toMatchObject({ code: "VOICE_UNAVAILABLE" })
  })
})

describe("installing voice input", () => {
  it("fetches the engine and the model, checks them, and turns voice input on", async ({
    resources,
  }) => {
    const { voice, store } = await setup(resources)
    const watching = watchUntil(voice, (state) => state.installing === null && state.check !== null)
    // Let the watch show the state before the install begins.
    await new Promise((resolve) => setTimeout(resolve, 50))

    await voice.install("small")
    const states = await watching

    const steps = states.flatMap((state) => (state.installing ? [state.installing.step] : []))
    expect([...new Set(steps)]).toEqual(["engine", "model", "check"])
    expect(states[0]).toMatchObject({ available: true, installed: [], enabled: false })
    expect(states.at(-1)).toMatchObject({
      installed: ["small"],
      enabled: true,
      model: "small",
      installing: null,
      failure: null,
      check: { model: "small", gpu: false, recommended: "small" },
    })
    expect(store.voiceSettings()).toMatchObject({ enabled: true, model: "small" })
  })

  it("recommends turbo when a GPU does the test clip quickly", async ({ resources }) => {
    const { voice } = await installed(resources, "turbo")

    expect(voice.state().check).toMatchObject({ model: "turbo", gpu: true, recommended: "turbo" })
    expect(voice.state().model).toBe("turbo")
  })

  it("sizes the downloads", async ({ resources }) => {
    const catalog = await modelCatalog(resources)
    const { voice } = await setup(resources, { catalog })

    expect(voice.state().sizes).toEqual({
      engine: expect.any(Number),
      turbo: catalog.models.turbo.size + catalog.vad.size,
      small: catalog.models.small.size + catalog.vad.size,
    })
    expect(voice.state().sizes.engine).toBeGreaterThan(0)
  })

  it("refuses a second install while one runs", async ({ resources }) => {
    const { voice } = await setup(resources)

    await voice.install("small")

    await expect(voice.install("turbo")).rejects.toMatchObject({ code: "CONFLICT" })
    await voice.settled()
  })

  it("fails in words for a damaged model, keeping the engine it fetched", async ({ resources }) => {
    const catalog = await modelCatalog(resources)
    const { voice, directory } = await setup(resources, {
      catalog: {
        ...catalog,
        models: { ...catalog.models, small: { ...catalog.models.small, sha256: "0".repeat(64) } },
      },
    })

    await voice.install("small")
    await voice.settled()

    expect(voice.state()).toMatchObject({ installing: null, enabled: false, installed: [] })
    expect(voice.state().failure).toContain("damaged")
    expect(await readdir(`${directory}/engine`)).toHaveLength(1)
    expect(await readdir(`${directory}/models`)).toEqual([])
  })

  it("fails when the engine says nothing of the test clip", async ({ resources }) => {
    const { voice } = await setup(resources, {
      catalog: await modelCatalog(resources, { small: "small mute" }),
    })

    await voice.install("small")
    await voice.settled()

    expect(voice.state().failure).toContain("heard nothing")
    expect(voice.state().enabled).toBe(false)
  })

  it("stops on cancel without a failure, keeping what it fetched", async ({ resources }) => {
    const { voice, directory } = await setup(resources, {
      catalog: await modelCatalog(resources, { small: "small slow" }),
    })
    const checking = watchUntil(voice, (state) => state.installing?.step === "check")
    await new Promise((resolve) => setTimeout(resolve, 50))
    await voice.install("small")
    await checking

    await voice.cancel()

    expect(voice.state()).toMatchObject({ installing: null, failure: null, enabled: false })
    expect(await readdir(`${directory}/models`)).toHaveLength(2)
  })

  it("is quick to finish when its engine and model are there already", async ({ resources }) => {
    const { voice } = await installed(resources)

    await voice.install("small")
    await voice.settled()

    expect(voice.state()).toMatchObject({ installed: ["small"], failure: null })
  })
})

describe("voice input settings", () => {
  it("refuses a model, or turning on, that is not installed", async ({ resources }) => {
    const { voice } = await setup(resources)

    expect(() => voice.set({ model: "turbo" })).toThrowError(
      expect.objectContaining({ code: "CONFLICT" }),
    )
    expect(() => voice.set({ enabled: true })).toThrowError(
      expect.objectContaining({ code: "CONFLICT" }),
    )
    expect(() => voice.set({ language: "pl" })).not.toThrow()
    expect(voice.state()).toMatchObject({ language: "pl", enabled: false })
  })

  it("turns off and on, and chooses among installed models", async ({ resources }) => {
    const { voice } = await installed(resources)

    voice.set({ enabled: false })
    expect(voice.state().enabled).toBe(false)
    voice.set({ enabled: true, language: "de" })
    expect(voice.state()).toMatchObject({ enabled: true, language: "de", model: "small" })
    expect(() => voice.set({ model: "small" })).not.toThrow()
  })

  it("survive the runner, with what is installed", async ({ resources }) => {
    const first = await installed(resources)
    first.voice.set({ language: "pl" })

    const second = await setup(resources, {
      store: first.store,
      directory: first.directory,
      ...(first.manifest && { engine: first.manifest }),
      catalog: await modelCatalog(resources),
    })

    expect(second.voice.state()).toMatchObject({
      installed: ["small"],
      enabled: true,
      language: "pl",
    })
  })
})

describe("transcribing a recording", () => {
  it("returns what the engine heard of the clip, after the prompt", async ({ resources }) => {
    const { voice } = await installed(resources)
    voice.record("clip", 0, pcm(32_000))
    voice.record("clip", 32_000, pcm(32_000))

    const transcript = await voice.transcribe("clip", "README.md")

    expect(transcript.language).toBe("pl")
    expect(JSON.parse(transcript.text)).toMatchObject({ prompt: "README.md", bytes: 44 + 64_000 })
    await expect(voice.transcribe("clip")).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("has the engine in the language chosen", async ({ resources }) => {
    const { voice } = await installed(resources)
    voice.set({ language: "pl" })
    voice.record("clip", 0, pcm(3200))

    const transcript = await voice.transcribe("clip")

    expect(transcript.language).toBe("pl")
  })

  it("names the language the engine heard when detecting it", async ({ resources }) => {
    const { voice } = await installed(resources)
    voice.set({ language: "auto" })
    voice.record("clip", 0, pcm(3200))

    await expect(voice.transcribe("clip")).resolves.toMatchObject({ language: "pl" })
  })

  it("is empty for a clip with no audio, without the engine", async ({ resources }) => {
    const { voice } = await installed(resources)
    voice.record("clip", 0, "")

    await expect(voice.transcribe("clip")).resolves.toEqual({ text: "", language: "" })
  })

  it("refuses audio past the longest clip", async ({ resources }) => {
    const { voice } = await installed(resources)
    const whole = maxVoiceSeconds * voiceSampleRate * 2
    voice.record("clip", whole - 2, pcm(2))

    expect(() => voice.record("clip", whole - 1, pcm(2))).toThrowError(
      expect.objectContaining({ code: "UPLOAD_TOO_LARGE" }),
    )
  })

  it("forgets a discarded clip", async ({ resources }) => {
    const { voice } = await installed(resources)
    voice.record("clip", 0, pcm(3200))
    voice.discard("clip")
    voice.discard("never-recorded")

    await expect(voice.transcribe("clip")).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("is unavailable while voice input is off, or not installed", async ({ resources }) => {
    const bare = await setup(resources)
    const { voice } = await installed(resources)
    voice.set({ enabled: false })

    expect(() => bare.voice.record("clip", 0, pcm(2))).toThrowError(
      expect.objectContaining({ code: "VOICE_UNAVAILABLE" }),
    )
    expect(() => voice.record("clip", 0, pcm(2))).toThrowError(
      expect.objectContaining({ code: "VOICE_UNAVAILABLE" }),
    )
    await expect(voice.transcribe("clip")).rejects.toMatchObject({ code: "VOICE_UNAVAILABLE" })
  })

  it("fails with the reason when the engine does, and recovers on the next clip", async ({
    resources,
  }) => {
    const { voice, directory } = await installed(resources)
    const model = `${directory}/models/ggml-small.bin`
    await writeFile(model, "small crash")
    // Choosing a model ends the engine, which the next clip starts again from the file.
    voice.set({ model: "small" })
    voice.record("clip", 0, pcm(3200))

    await expect(voice.transcribe("clip")).rejects.toMatchObject({
      code: "VOICE_FAILED",
      message: expect.stringContaining("out of memory"),
    })
    expect(voice.state().failure).toContain("out of memory")

    await writeFile(model, "small")
    voice.record("clip", 0, pcm(3200))
    await expect(voice.transcribe("clip")).resolves.toMatchObject({ language: "pl" })
    expect(voice.state().failure).toBeNull()
  })
})

describe("uninstalling voice input", () => {
  it("removes the engine and models and turns voice input off", async ({ resources }) => {
    const { voice, directory } = await installed(resources)

    await voice.uninstall()

    expect(voice.state()).toMatchObject({ installed: [], enabled: false, check: null })
    expect(await readdir(directory)).toEqual([])
  })
})

describe("closing voice input", () => {
  it("refuses what comes after, as the runner is closing", async ({ resources }) => {
    const { voice } = await installed(resources)

    await voice.close()

    await expect(voice.install("small")).rejects.toMatchObject({ code: "RUNTIME_CLOSING" })
    expect(() => voice.set({ language: "de" })).toThrowError(
      expect.objectContaining({ code: "RUNTIME_CLOSING" }),
    )
    expect(() => voice.record("clip", 0, pcm(2))).toThrowError(
      expect.objectContaining({ code: "RUNTIME_CLOSING" }),
    )
    await expect(voice.transcribe("clip")).rejects.toMatchObject({ code: "RUNTIME_CLOSING" })
  })

  it("ends a watch when its owner is released", async ({ resources }) => {
    const { voice } = await setup(resources)
    const states: VoiceState[] = []
    const watching = (async () => {
      for await (const state of voice.watch("owner")) states.push(state)
    })()
    await new Promise((resolve) => setTimeout(resolve, 50))

    voice.release("owner")
    await watching

    expect(states).toHaveLength(1)
  })
})
