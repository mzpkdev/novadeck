import { mkdir, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "../test.js"
import { engineArchive, fakeLaunch, folder } from "../testing/voice.js"
import {
  Engine,
  EngineError,
  engineFolder,
  engineProgram,
  enginesIn,
  unpack,
  type EngineConfig,
} from "./engine.js"
import { languageCode } from "./languages.js"
import { wav } from "./wav.js"

const configured = async (
  resources: Parameters<typeof folder>[0],
  behaviour = "small",
): Promise<EngineConfig> => {
  const directory = await folder(resources)
  const model = join(directory, "model.bin")
  await writeFile(model, behaviour)
  return { folder: directory, model, vad: join(directory, "vad.bin"), language: "en" }
}

describe("unpacking the engine", () => {
  it("puts the archive's files in a folder named by its checksum, and removes older engines", async ({
    resources,
  }) => {
    const manifest = join(await engineArchive(resources))
    const archive = join(manifest, "..", "engine.tar.gz")
    const directory = await folder(resources)
    const older = join(enginesIn(directory), "0123456789ab")
    await mkdir(older, { recursive: true })

    const target = await unpack(archive, directory, "f".repeat(64))

    expect(target).toBe(engineFolder(directory, "f".repeat(64)))
    expect((await readdir(target)).toSorted()).toEqual(["LICENSE", "check.wav", engineProgram])
    expect(await readdir(enginesIn(directory))).toEqual(["ffffffffffff"])
  })

  it("fails in words for a file that is not an archive, leaving no folder behind", async ({
    resources,
  }) => {
    const directory = await folder(resources)
    const archive = join(directory, "engine.tar.gz")
    await writeFile(archive, "not an archive")

    await expect(unpack(archive, directory, "a".repeat(64))).rejects.toThrow(
      "Could not unpack the engine",
    )

    expect(await readdir(enginesIn(directory))).toEqual([])
  })
})

describe("the engine", () => {
  it("starts on first use, answers with the text and the language it was asked for, and keeps running", async ({
    resources,
  }) => {
    const engine = new Engine({ launch: fakeLaunch })
    resources.defer(() => engine.close())
    const config = await configured(resources)

    const first = await engine.transcribe(config, wav(Buffer.alloc(320)), {
      language: "pl",
      prompt: "README.md",
    })
    const second = await engine.transcribe(config, wav(Buffer.alloc(320)), { language: "pl" })

    expect(first.language).toBe("pl")
    expect(JSON.parse(first.text)).toEqual({
      asked: "pl",
      started: "en",
      prompt: "README.md",
      bytes: 364,
    })
    expect(JSON.parse(second.text)).toMatchObject({ prompt: null })
  })

  it("names the language it heard as a code when asked to detect it", async ({ resources }) => {
    const engine = new Engine({ launch: fakeLaunch })
    resources.defer(() => engine.close())

    const result = await engine.transcribe(await configured(resources), wav(Buffer.alloc(320)), {
      language: "auto",
    })

    expect(result.language).toBe("pl")
  })

  it("reports whether the model went onto a GPU, from its log", async ({ resources }) => {
    const engine = new Engine({ launch: fakeLaunch })
    resources.defer(() => engine.close())

    await engine.start(await configured(resources, "gpu"))
    expect(engine.gpu).toBe(true)
    await engine.start(await configured(resources, "small"))
    expect(engine.gpu).toBe(false)
  })

  it("starts once for clips that ask together", async ({ resources }) => {
    const engine = new Engine({ launch: fakeLaunch })
    resources.defer(() => engine.close())
    const config = await configured(resources)

    const [a, b] = await Promise.all([
      engine.transcribe(config, wav(Buffer.alloc(320)), { language: "en" }),
      engine.transcribe(config, wav(Buffer.alloc(640)), { language: "en" }),
    ])

    expect([JSON.parse(a.text).bytes, JSON.parse(b.text).bytes]).toEqual([364, 684])
    expect(engine.gpu).toBe(false)
  })

  it("starts again with another model", async ({ resources }) => {
    const engine = new Engine({ launch: fakeLaunch })
    resources.defer(() => engine.close())

    await engine.start(await configured(resources, "small"))
    expect(engine.gpu).toBe(false)
    await engine.start(await configured(resources, "turbo gpu"))

    expect(engine.gpu).toBe(true)
  })

  it("explains a crash with what the engine last said, and starts again for the next clip", async ({
    resources,
  }) => {
    const engine = new Engine({ launch: fakeLaunch })
    resources.defer(() => engine.close())
    const config = await configured(resources, "crash")

    await expect(
      engine.transcribe(config, wav(Buffer.alloc(320)), { language: "en" }),
    ).rejects.toThrow("GGML_ASSERT: out of memory")
    await writeFile(config.model, "small")

    await expect(
      engine.transcribe(config, wav(Buffer.alloc(320)), { language: "en" }),
    ).resolves.toMatchObject({ language: "en" })
  })

  it("explains a program that cannot run", async ({ resources }) => {
    const engine = new Engine({
      launch: () => ({ command: join(tmpdir(), "novadeck-no-such-engine"), args: [] }),
    })
    resources.defer(() => engine.close())

    await expect(engine.start(await configured(resources))).rejects.toThrow(EngineError)
  })

  it("stops when nothing has used it for a while", async ({ resources }) => {
    const engine = new Engine({ launch: fakeLaunch, idleMs: 100 })
    resources.defer(() => engine.close())

    await engine.start(await configured(resources, "gpu"))
    expect(engine.gpu).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(engine.gpu).toBeUndefined()
  })

  it("ends its process on close and starts no other", async ({ resources }) => {
    const engine = new Engine({ launch: fakeLaunch })
    const config = await configured(resources)
    await engine.start(config)

    await engine.close()

    expect(engine.gpu).toBeUndefined()
    await expect(engine.start(config)).rejects.toThrow("closing")
  })

  it("is given the engine's model and language as arguments", async ({ resources }) => {
    const engine = new Engine({ launch: fakeLaunch })
    resources.defer(() => engine.close())
    const config = { ...(await configured(resources)), language: "de" }

    const result = await engine.transcribe(config, wav(Buffer.alloc(320)), { language: "auto" })

    expect(JSON.parse(result.text)).toMatchObject({ started: "de", asked: "auto" })
  })
})

describe("language names", () => {
  it("become the codes the contract uses", () => {
    expect(languageCode("english")).toBe("en")
    expect(languageCode("Polish")).toBe("pl")
    expect(languageCode("haitian creole")).toBe("ht")
    expect(languageCode("klingon")).toBe("klingon")
  })
})
