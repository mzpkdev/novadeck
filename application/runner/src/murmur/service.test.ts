import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { MurmurState } from "@novadeck/protocol"

import { ActivityTracker } from "../engines/activity.js"
import { describe, expect, it } from "../test.js"
import {
  arc,
  fakeLaunch,
  folder,
  llamaArchive,
  modelFile,
  nvidia,
  processor,
  type FakeDevice,
} from "../testing/murmur.js"
import type { Resources } from "../testing/resources.js"
import { WorkspaceStore } from "../workspaces/store.js"
import type { AgentDigest, Digest } from "./describer.js"
import { Murmur } from "./service.js"

const digest: AgentDigest = {
  kind: "agent",
  harness: "Claude Code",
  project: "app",
  folder: null,
  branch: null,
  plan: null,
  folders: [],
  prompts: ["first thing", "fix the build, API_KEY=hunter2 is set"],
  reply: null,
  previous: null,
}

const setup = async (
  resources: Resources,
  options: {
    devices?: FakeDevice[]
    behaviour?: string
    engine?: false | string
    store?: WorkspaceStore
    directory?: string
    voice?: ConstructorParameters<typeof Murmur>[1]["voice"]
    freeMemory?: () => number
    idleMs?: number
    now?: () => number
  } = {},
) => {
  const store = options.store ?? new WorkspaceStore()
  if (!options.store) resources.defer(() => store.close())
  const directory = options.directory ?? (await folder(resources))
  const manifest =
    options.engine === false ? undefined : (options.engine ?? (await llamaArchive(resources)))
  const murmur = new Murmur(store, {
    engine: manifest,
    directory,
    model: await modelFile(resources, options.behaviour),
    launch: fakeLaunch(options.devices ?? [arc, nvidia, processor]),
    retryMs: 20,
    backoffMs: 60,
    ...(options.voice && { voice: options.voice }),
    ...(options.freeMemory && { freeMemory: options.freeMemory }),
    ...(options.idleMs !== undefined && { idleMs: options.idleMs }),
    ...(options.now && { now: options.now }),
  })
  resources.defer(() => murmur.close())
  await murmur.refresh()
  return { murmur, store, directory, manifest }
}

const installed = async (resources: Resources, options: Parameters<typeof setup>[1] = {}) => {
  const context = await setup(resources, options)
  await context.murmur.install()
  await context.murmur.settled()
  return context
}

const watchUntil = async (murmur: Murmur, done: (state: MurmurState) => boolean) => {
  const states: MurmurState[] = []
  const controller = new AbortController()
  for await (const state of murmur.watch("owner", controller.signal)) {
    states.push(state)
    if (done(state)) break
  }
  controller.abort()
  return states
}

// What the fake llama-server was sent, as the model file it ran from logged it.
const requests = async (
  directory: string,
): Promise<{ messages: { role: string; content: string }[] }[]> =>
  (await readFile(join(directory, "models", "model.gguf.requests"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("murmur without an engine", () => {
  it("is unavailable and refuses to install", async ({ resources }) => {
    const { murmur } = await setup(resources, { engine: false })

    expect(murmur.state()).toMatchObject({ available: false, installed: false, enabled: false })
    expect(murmur.state().sizes.engine).toBe(0)
    await expect(murmur.install()).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(murmur.describe(digest)).resolves.toBeUndefined()
  })
})

describe("installing murmur", () => {
  it("fetches the engine and the model, checks them on the integrated GPU, and turns murmur on", async ({
    resources,
  }) => {
    const { murmur, store } = await setup(resources)
    const watching = watchUntil(
      murmur,
      (state) => state.installing === null && state.check !== null,
    )
    await sleep(50)

    await murmur.install()
    const states = await watching

    const steps = states.flatMap((state) => (state.installing ? [state.installing.step] : []))
    expect([...new Set(steps)]).toEqual(["engine", "model", "check"])
    expect(states[0]).toMatchObject({ available: true, installed: false, enabled: false })
    expect(states.at(-1)).toMatchObject({
      installed: true,
      enabled: true,
      installing: null,
      failure: null,
      check: { device: arc.name, integrated: true },
    })
    expect(store.murmurSettings()).toEqual({ enabled: true })
    expect(store.murmurCheck()).toMatchObject({ device: arc.name })
  })

  it("fails over to the next GPU when the integrated one cannot run the model", async ({
    resources,
  }) => {
    const { murmur } = await installed(resources, { behaviour: "fail:Vulkan0" })

    expect(murmur.state()).toMatchObject({
      enabled: true,
      failure: null,
      check: { device: nvidia.name, integrated: false },
    })
    await expect(murmur.describe(digest)).resolves.toMatchObject({
      summary: "Described on Vulkan1.",
    })
  })

  it("fails in words when there is no GPU, keeping what it fetched", async ({ resources }) => {
    const { murmur, store } = await installed(resources, { devices: [processor] })

    expect(murmur.state()).toMatchObject({ installed: true, check: null })
    expect(murmur.state().failure).toMatch(/needs a working GPU/)
    expect(store.murmurCheck()).toBeNull()
    await expect(murmur.describe(digest)).resolves.toBeUndefined()
  })

  it("fails the same when every GPU fails", async ({ resources }) => {
    const { murmur } = await installed(resources, { behaviour: "fail:Vulkan0 fail:Vulkan1" })

    expect(murmur.state().check).toBeNull()
    expect(murmur.state().failure).toMatch(/needs a working GPU/)
  })

  it("rejects a GPU that answers with something else than a description", async ({ resources }) => {
    const { murmur } = await installed(resources, { behaviour: "garbage" })

    expect(murmur.state().check).toBeNull()
    expect(murmur.state().failure).toMatch(/needs a working GPU/)
  })

  it("refuses a second install while one runs, and stops on cancel without a failure", async ({
    resources,
  }) => {
    const { murmur } = await setup(resources)

    await murmur.install()
    await expect(murmur.install()).rejects.toMatchObject({ code: "CONFLICT" })
    await murmur.cancel()

    expect(murmur.state().installing).toBeNull()
    expect(murmur.state().failure).toBeNull()
  })

  it("is tried again with the engine and model it has, and turns on once checked", async ({
    resources,
  }) => {
    const store = new WorkspaceStore()
    resources.defer(() => store.close())
    const directory = await folder(resources)
    const manifest = await llamaArchive(resources)
    const first = await installed(resources, {
      devices: [processor],
      store,
      directory,
      engine: manifest,
    })
    // Unchecked, it is not turned on.
    expect(first.murmur.state()).toMatchObject({ installed: true, enabled: false, check: null })

    const second = await installed(resources, { store, directory, engine: manifest })

    expect(second.murmur.state()).toMatchObject({
      enabled: true,
      failure: null,
      check: { integrated: true },
    })
  })
})

describe("murmur's settings", () => {
  it("is wanted until turned off, installed or not, and stays off until turned on", async ({
    resources,
  }) => {
    const { murmur } = await setup(resources)
    expect(murmur.state()).toMatchObject({ wanted: true, enabled: false })

    await murmur.set({ enabled: false })
    expect(murmur.state()).toMatchObject({ wanted: false, enabled: false })

    // Turned on before an install, it is wanted, and the install turns it on.
    await murmur.set({ enabled: true })
    expect(murmur.state()).toMatchObject({ wanted: true, enabled: false })
  })

  it("keeps an off chosen during an install", async ({ resources }) => {
    const { murmur } = await setup(resources)
    await murmur.install()
    await murmur.set({ enabled: false })
    await murmur.settled()

    expect(murmur.state()).toMatchObject({ installed: true, enabled: false })
    expect(murmur.state().check).not.toBeNull()
  })

  it("turns off and on again", async ({ resources }) => {
    const { murmur } = await installed(resources)

    await murmur.set({ enabled: false })
    expect(murmur.state().enabled).toBe(false)
    await expect(murmur.describe(digest)).resolves.toBeUndefined()
    await murmur.set({ enabled: true })
    await expect(murmur.describe(digest)).resolves.toBeDefined()
  })

  it("survives the runner, with what is installed", async ({ resources }) => {
    const store = new WorkspaceStore()
    resources.defer(() => store.close())
    const directory = await folder(resources)
    const manifest = await llamaArchive(resources)
    const first = await installed(resources, { store, directory, engine: manifest })
    await first.murmur.close()

    const { murmur } = await setup(resources, { store, directory, engine: manifest })

    expect(murmur.state()).toMatchObject({
      installed: true,
      enabled: true,
      check: { integrated: true },
    })
    await expect(murmur.describe(digest)).resolves.toBeDefined()
  })

  it("tells those who watch usability when it changes", async ({ resources }) => {
    const { murmur } = await setup(resources)
    const heard: boolean[] = []
    murmur.watchUsable((usable) => heard.push(usable))

    await murmur.install()
    await murmur.settled()
    await murmur.set({ enabled: false })
    await murmur.set({ enabled: true })

    expect(heard).toEqual([true, false, true])
  })
})

describe("uninstalling murmur", () => {
  it("removes the engine and model and turns murmur off", async ({ resources }) => {
    const { murmur, store, directory } = await installed(resources)

    await murmur.uninstall()

    expect(murmur.state()).toMatchObject({
      installed: false,
      enabled: false,
      wanted: false,
      check: null,
    })
    expect(store.murmurCheck()).toBeNull()
    await expect(murmur.describe(digest)).resolves.toBeUndefined()
    await expect(import("node:fs/promises").then((fs) => fs.readdir(directory))).resolves.toEqual(
      [],
    )
  })
})

describe("murmur after the app brings a new engine", () => {
  it("keeps the model and murmur on, and fetches the engine alone", async ({ resources }) => {
    const store = new WorkspaceStore()
    resources.defer(() => store.close())
    const directory = await folder(resources)
    const first = await installed(resources, { store, directory })
    await first.murmur.close()

    const next = await setup(resources, {
      store,
      directory,
      engine: await llamaArchive(resources, "2"),
    })
    const states = await watchUntil(
      next.murmur,
      (state) => state.installing === null && state.installed && state.failure === null,
    )

    expect(states.some((state) => state.installing?.step === "engine")).toBe(true)
    expect(next.murmur.state()).toMatchObject({ enabled: true, check: { integrated: true } })
    await expect(next.murmur.describe(digest)).resolves.toBeDefined()
  })
})

describe("describing", () => {
  it("answers with the description, having read the digest without its secrets, the current prompt last", async ({
    resources,
  }) => {
    const { murmur, directory } = await installed(resources, { behaviour: "log" })

    const description = await murmur.describe(digest)

    expect(description).toMatchObject({ summary: "Described on Vulkan0." })
    const asked = (await requests(directory)).at(-1)
    expect(asked?.messages.map((message) => message.role)).toEqual(["system", "user"])
    const text = asked?.messages[1]?.content ?? ""
    expect(text).not.toContain("hunter2")
    expect(text).toContain("API_KEY=[redacted]")
    expect(text.indexOf("first thing")).toBeLessThan(text.indexOf("fix the build"))
    expect(text).toMatch(/CURRENT prompt[^]*fix the build/)
  })

  it("describes a shell, showing it the previous label", async ({ resources }) => {
    const { murmur, directory } = await installed(resources, { behaviour: "log" })
    const shell: Digest = {
      kind: "shell",
      project: null,
      folder: null,
      command: "tail -f app.log",
      screen: ["token=abc123", "line two"],
      previous: { title: "Tailing log", summary: "Following app.log." },
    }

    await murmur.describe(shell)

    const text = (await requests(directory)).at(-1)?.messages[1]?.content ?? ""
    expect(text).toContain("tail -f app.log")
    expect(text).not.toContain("abc123")
    expect(text).toContain("Tailing log")
  })

  it("does one job at a time", async ({ resources }) => {
    const { murmur } = await installed(resources, { behaviour: "slow" })

    const [first, second] = await Promise.all([murmur.describe(digest), murmur.describe(digest)])

    expect(first?.title).toBe("Fake title 1")
    expect(second?.title).toBe("Fake title 2")
  })

  it("drops a job whose signal aborted, before or while it waits", async ({ resources }) => {
    const { murmur } = await installed(resources, { behaviour: "slow" })
    const early = new AbortController()
    early.abort()
    expect(await murmur.describe(digest, early.signal)).toBeUndefined()

    const running = murmur.describe(digest)
    const waiting = new AbortController()
    const queued = murmur.describe(digest, waiting.signal)
    waiting.abort()

    expect(await queued).toBeUndefined()
    expect(await running).toBeDefined()
  })

  it("aborts a request in flight", async ({ resources }) => {
    const { murmur } = await installed(resources, { behaviour: "slow" })
    const controller = new AbortController()

    const job = murmur.describe(digest, controller.signal)
    await sleep(100)
    controller.abort()

    expect(await job).toBeUndefined()
    await expect(murmur.describe(digest)).resolves.toBeDefined()
  })

  it("unloads the model when idle and loads it again for the next job", async ({ resources }) => {
    const { murmur } = await installed(resources, { idleMs: 100 })

    expect((await murmur.describe(digest))?.title).toBe("Fake title 1")
    await sleep(400)

    // A new server counts from one again.
    expect((await murmur.describe(digest))?.title).toBe("Fake title 1")
  })

  it("keeps the model loaded while jobs come", async ({ resources }) => {
    const { murmur } = await installed(resources, { idleMs: 1000 })

    await murmur.describe(digest)

    expect((await murmur.describe(digest))?.title).toBe("Fake title 2")
  })
})

describe("giving way", () => {
  it("waits while voice input is busy and runs once it is not", async ({ resources }) => {
    let busy = true
    const tracker = new ActivityTracker(() => busy)
    const { murmur } = await installed(resources, { voice: tracker })
    let done = false

    const job = murmur.describe(digest).then((value) => {
      done = true
      return value
    })
    await sleep(150)
    expect(done).toBe(false)
    busy = false
    tracker.update()

    expect(await job).toBeDefined()
  })

  it("stops the request in flight when voice input begins, and runs it again after", async ({
    resources,
  }) => {
    let busy = false
    const tracker = new ActivityTracker(() => busy)
    const { murmur } = await installed(resources, { voice: tracker, behaviour: "slow" })
    let done = false

    const job = murmur.describe(digest).then((value) => {
      done = true
      return value
    })
    await sleep(150)
    busy = true
    tracker.update()
    await sleep(700)
    expect(done).toBe(false)
    busy = false
    tracker.update()

    expect(await job).toMatchObject({ summary: "Described on Vulkan0." })
  })

  it("waits while the computer is short of memory", async ({ resources }) => {
    let free = 512 * 1024 * 1024
    const { murmur } = await installed(resources, { freeMemory: () => free })
    let done = false

    const job = murmur.describe(digest).then((value) => {
      done = true
      return value
    })
    await sleep(150)
    expect(done).toBe(false)
    free = 16 * 1024 * 1024 * 1024

    expect(await job).toBeDefined()
  })

  it("can be dropped while it waits", async ({ resources }) => {
    const { murmur } = await installed(resources, { freeMemory: () => 0 })
    const controller = new AbortController()

    const job = murmur.describe(digest, controller.signal)
    await sleep(60)
    controller.abort()

    expect(await job).toBeUndefined()
  })

  it("backs off after a failure, and tries again later", async ({ resources }) => {
    let time = 1_000
    const context = await installed(resources, { now: () => time })
    // The model now crashes on the first job.
    await writeFile(join(context.directory, "models", "model.gguf"), "crash")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })

    expect(await context.murmur.describe(digest)).toBeUndefined()
    // Refused at once, while backing off.
    time += 10
    expect(await context.murmur.describe(digest)).toBeUndefined()

    await writeFile(join(context.directory, "models", "model.gguf"), "plain")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })
    expect(await context.murmur.describe(digest)).toBeUndefined()
    time += 10_000
    expect(await context.murmur.describe(digest)).toBeDefined()
  })
})

describe("closing murmur", () => {
  it("refuses what comes after, and describes nothing", async ({ resources }) => {
    const { murmur } = await installed(resources)

    await murmur.close()

    await expect(murmur.install()).rejects.toMatchObject({ code: "RUNTIME_CLOSING" })
    await expect(murmur.describe(digest)).resolves.toBeUndefined()
  })

  it("ends a watch when its owner is released", async ({ resources }) => {
    const { murmur } = await setup(resources)
    const states: MurmurState[] = []
    const watching = (async () => {
      for await (const state of murmur.watch("owner")) states.push(state)
    })()
    await sleep(50)

    murmur.release("owner")

    await watching
    expect(states.length).toBeGreaterThan(0)
  })
})
