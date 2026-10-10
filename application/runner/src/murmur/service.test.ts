import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { MurmurState } from "@novadeck/protocol"

import { ActivityTracker } from "../engines/activity.js"
import type { Launch } from "../engines/server.js"
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
  summary: null,
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
    requestMs?: number
    startMs?: number
    launch?: Launch
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
    ...(options.requestMs !== undefined && { requestMs: options.requestMs }),
    ...(options.startMs !== undefined && { startMs: options.startMs }),
    ...(options.launch && { launch: options.launch }),
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
    const { murmur } = await installed(resources, { behaviour: "fail:Vulkan0 device" })

    expect(murmur.state()).toMatchObject({
      enabled: true,
      failure: null,
      check: { device: nvidia.name, integrated: false },
    })
    await expect(murmur.describe(digest)).resolves.toMatchObject({
      title: "Fake title on Vulkan1",
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

describe("installed murmur that never passed its check", () => {
  it("says a check is needed, to try again, after a cancelled check or a restart", async ({
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
    await first.murmur.close()

    const { murmur } = await setup(resources, {
      store,
      directory,
      engine: manifest,
      devices: [processor],
    })

    // No failure of its own was kept, yet the card must offer Try again.
    expect(murmur.state()).toMatchObject({ installed: true, check: null })
    expect(murmur.state().failure).toMatch(/Try again/)
    await murmur.install()
    await murmur.settled()
    expect(murmur.state().failure).toMatch(/needs a working GPU/)
  })

  it("does not say so while an install runs, or before anything is installed", async ({
    resources,
  }) => {
    const { murmur } = await setup(resources)
    expect(murmur.state().failure).toBeNull()

    await murmur.install()
    expect(murmur.state().failure).toBeNull()
    await murmur.settled()
    expect(murmur.state().failure).toBeNull()
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

    // It says how things are at once, then every change.
    expect(heard).toEqual([false, true, false, true])
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

describe("murmur after the app brings a new engine, while it is fetched", () => {
  it("runs the new engine afterwards, never the one it replaced", async ({ resources }) => {
    const store = new WorkspaceStore()
    resources.defer(() => store.close())
    const directory = await folder(resources)
    const programs: string[] = []
    const base = fakeLaunch([arc, nvidia])
    const launch: Launch = (program, args) => {
      if (!args.includes("--list-devices")) programs.push(program)
      return base(program, args)
    }
    const first = await installed(resources, { store, directory, launch })
    await first.murmur.describe(digest)
    const old = programs.at(-1) ?? ""
    await first.murmur.close()

    const next = await setup(resources, {
      store,
      directory,
      launch,
      engine: await llamaArchive(resources, "2"),
    })
    const watching = watchUntil(next.murmur, (state) => state.installing !== null)
    await watching
    // A second look at the disk, as another watcher makes, while the engine is replaced.
    await next.murmur.refresh()
    await next.murmur.settled()
    programs.length = 0
    await next.murmur.describe(digest)

    expect(programs).toHaveLength(1)
    expect(programs[0]).not.toBe(old)
    expect(programs[0]?.startsWith(directory)).toBe(true)
    expect(next.murmur.state()).toMatchObject({ enabled: true, failure: null })
  })
})

describe("describing", () => {
  it("answers with the description, having read the digest without its secrets, the current prompt last", async ({
    resources,
  }) => {
    const { murmur, directory } = await installed(resources, { behaviour: "log device" })

    const description = await murmur.describe(digest)

    expect(description).toMatchObject({ title: "Fake title on Vulkan0" })
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
      previous: { title: "Tailing log" },
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
    expect(await murmur.describe(digest, { signal: early.signal })).toBeUndefined()

    const running = murmur.describe(digest)
    const waiting = new AbortController()
    const queued = murmur.describe(digest, { signal: waiting.signal })
    waiting.abort()

    expect(await queued).toBeUndefined()
    expect(await running).toBeDefined()
  })

  it("aborts a request in flight", async ({ resources }) => {
    const { murmur } = await installed(resources, { behaviour: "slow" })
    const controller = new AbortController()

    const job = murmur.describe(digest, { signal: controller.signal })
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

describe("an engine that stops answering", () => {
  it("fails the job after the request's time, backs off, and lets the next jobs through", async ({
    resources,
  }) => {
    let time = 1_000
    const context = await installed(resources, { requestMs: 300, now: () => time })
    await writeFile(join(context.directory, "models", "model.gguf"), "hang")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })

    const hung = context.murmur.describe(digest)
    // Another terminal's job, dropped by its own signal, leaves the line at once.
    const other = context.murmur.describe(digest, { signal: AbortSignal.timeout(100) })

    expect(await other).toBeUndefined()
    expect(await hung).toBeUndefined()
    // Backing off now.
    expect(await context.murmur.describe(digest)).toBeUndefined()
    await writeFile(join(context.directory, "models", "model.gguf"), "plain")
    time += 10_000
    expect(await context.murmur.describe(digest)).toBeDefined()
  })
})

describe("a reply that is no title", () => {
  it("gives that job no title, without backing off", async ({ resources }) => {
    const context = await installed(resources, { now: () => 1_000 })
    await writeFile(join(context.directory, "models", "model.gguf"), "garbage")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })

    // The model ran and its reply was refused: null, not undefined.
    expect(await context.murmur.describe(digest)).toBeNull()

    await writeFile(join(context.directory, "models", "model.gguf"), "plain")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })
    // The clock didn't move, so a back-off would still refuse.
    expect(await context.murmur.describe(digest)).toBeDefined()
  })
})

const fix = async (context: { directory: string; murmur: Murmur }) => {
  await writeFile(join(context.directory, "models", "model.gguf"), "plain")
  await context.murmur.set({ enabled: false })
  await context.murmur.set({ enabled: true })
}

describe("titles that keep being refused", () => {
  const refuse = async (resources: Parameters<typeof setup>[0]) => {
    const context = await installed(resources, { now: () => 1_000 })
    await writeFile(join(context.directory, "models", "model.gguf"), "garbage")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })
    return context
  }
  it("leaves that terminal alone for a while, and no other", async ({ resources }) => {
    const context = await refuse(resources)

    expect(await context.murmur.describe(digest, { terminal: "a" })).toBeNull()
    expect(await context.murmur.describe(digest, { terminal: "a" })).toBeNull()
    await fix(context)

    // Two refusals in a row: held off though the model is fine now. That is undefined: it didn't run.
    expect(await context.murmur.describe(digest, { terminal: "a" })).toBeUndefined()
    // Another terminal is asked as ever, even of the same shape.
    expect(await context.murmur.describe(digest, { terminal: "b" })).toBeDefined()
    expect(await context.murmur.describe(digest, { terminal: "b" })).not.toBeNull()
  })

  it("counts a digest's shape when no terminal is named", async ({ resources }) => {
    const context = await refuse(resources)

    await context.murmur.describe(digest)
    await context.murmur.describe(digest)
    await fix(context)

    expect(await context.murmur.describe(digest)).toBeUndefined()
    expect(await context.murmur.describe({ ...digest, project: "other" })).toBeDefined()
  })
})

describe("a model that copies an example", () => {
  // The install check refuses a copy too, so the model starts copying after it.
  const copying = async (resources: Parameters<typeof setup>[0]) => {
    const context = await installed(resources)
    await writeFile(join(context.directory, "models", "model.gguf"), "copy")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })
    return context.murmur
  }

  it("is refused, as the digest says nothing of it", async ({ resources }) => {
    const murmur = await copying(resources)

    expect(await murmur.describe(digest)).toBeNull()
  })

  it("is not, when the digest is about that work", async ({ resources }) => {
    const murmur = await copying(resources)

    expect(
      await murmur.describe({ ...digest, prompts: ["rotating billing webhook keys, please"] }),
    ).toEqual({ title: "Rotating billing webhook keys" })
  })
})

describe("an engine that hangs while it loads", () => {
  it("drops the job after the start's time, and backs off", async ({ resources }) => {
    const context = await installed(resources, { startMs: 150, now: () => 1_000 })
    await writeFile(join(context.directory, "models", "model.gguf"), "late")
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })

    const started = Date.now()

    expect(await context.murmur.describe(digest)).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(2000)
    expect(await context.murmur.describe(digest)).toBeUndefined()
  })
})

describe("a GPU that went missing", () => {
  it("backs off instead of listing the devices for every job", async ({ resources }) => {
    let time = 1_000
    let listings = 0
    // The GPU is there for the install, and gone afterwards.
    let devices: FakeDevice[] = [arc]
    const context = await installed(resources, {
      now: () => time,
      launch: (program, args) => {
        if (args.includes("--list-devices")) listings += 1
        return fakeLaunch(args.includes("--list-devices") ? devices : [arc])(program, args)
      },
    })
    devices = []
    await context.murmur.set({ enabled: false })
    await context.murmur.set({ enabled: true })
    listings = 0

    expect(await context.murmur.describe(digest)).toBeUndefined()
    expect(await context.murmur.describe(digest)).toBeUndefined()
    expect(await context.murmur.describe(digest)).toBeUndefined()

    expect(listings).toBe(1)
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
    const { murmur } = await installed(resources, { voice: tracker, behaviour: "slow device" })
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

    expect(await job).toMatchObject({ title: "Fake title on Vulkan0" })
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

    const job = murmur.describe(digest, { signal: controller.signal })
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
  it("does not let an install that began just before it run on", async ({ resources }) => {
    const launches: string[] = []
    const base = fakeLaunch([arc, nvidia])
    const { murmur } = await setup(resources, {
      launch: (program, args) => {
        launches.push(args.join(" "))
        return base(program, args)
      },
    })

    const installing = murmur.install()
    await murmur.close()
    await installing.catch(() => {})
    const before = launches.length
    await sleep(500)
    await murmur.settled()

    expect(launches.length).toBe(before)
  })

  it("does not let an uninstall that waited for an install go on after it", async ({
    resources,
  }) => {
    const { murmur, directory } = await setup(resources)
    await murmur.install()

    const removing = murmur.uninstall()
    await murmur.close()

    await removing.catch(() => {})
    expect(murmur.state().enabled).toBe(false)
    void directory
  })

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
