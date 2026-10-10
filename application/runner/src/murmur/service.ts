import { execFile } from "node:child_process"
import { freemem } from "node:os"
import { basename, dirname, join } from "node:path"

import type { MurmurCheck, MurmurInstall, MurmurSettings, MurmurState } from "@novadeck/protocol"

import type { Activity } from "../engines/activity.js"
import { DownloadError, download } from "../engines/download.js"
import { aborted, engineStatus, fetchEngine, removeContents } from "../engines/install.js"
import { readManifest, type Artifact, type Manifest } from "../engines/manifest.js"
import { Server, token, type Launch, type ServerSpec } from "../engines/server.js"
import { EngineError, engineFolder, exists, programFile } from "../engines/unpack.js"
import { Watchers } from "../engines/watchers.js"
import { DomainError } from "../errors.js"
import type { MurmurSettingsChange } from "../workspaces/store.js"
import type { Description, Describer, Digest } from "./describer.js"
import { parseDescription } from "./description.js"
import { candidates, parseDevices, type Device } from "./devices.js"
import { messages, responseFormat, type Message } from "./prompt.js"
import { redactDigest } from "./redact.js"

/** Where the runner keeps murmur's settings. */
export type MurmurSettingsStore = {
  murmurSettings(): MurmurSettings
  saveMurmurSettings(settings: MurmurSettingsChange): void
  murmurEnabledChoice(): boolean | undefined
  /** The last install's check, which outlives a restart; `null` when none passed. */
  murmurCheck(): MurmurCheck | null
  saveMurmurCheck(check: MurmurCheck | null): void
}

/** The one model murmur uses, pinned by the commit of its repository. */
export const pinnedModel: Artifact = {
  url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf",
  sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
  size: 1280835840,
}

export type MurmurOptions = {
  /** The engine's manifest, `engine.json`; without one murmur is unavailable. */
  readonly engine?: string | undefined
  /** Where the engine's archive is: an https URL ending in `/`, or a folder. Beside the manifest by default. */
  readonly source?: string | undefined
  /** Where the engine and the model are installed. */
  readonly directory: string
  /** The model to download; the one Novadeck ships unless a test brings its own. */
  readonly model?: Artifact
  /** What voice input is doing: murmur gives way while it is busy. */
  readonly voice?: Activity
  readonly launch?: Launch
  /** How long the model stays loaded once nothing needs it. */
  readonly idleMs?: number
  /** How long each device may take for the install check's test description. */
  readonly checkMs?: number
  /** How long a job waits before it looks again at voice and memory. */
  readonly retryMs?: number
  /** How long after a failed job the next is refused, and how it grows with each failure in a row. */
  readonly backoffMs?: number
  /** Memory below which jobs wait, in MiB. */
  readonly minFreeMiB?: number
  /** The computer's free memory in bytes. */
  readonly freeMemory?: () => number
  readonly now?: () => number
}

const unavailable = (message: string): DomainError => new DomainError("CONFLICT", message)

const explain = (error: unknown): string => {
  if (error instanceof DownloadError || error instanceof EngineError) return error.message
  if (error instanceof Error && "code" in error && error.code === "ENOSPC")
    return "There is not enough disk space to install murmur."
  return `Murmur could not be installed: ${error instanceof Error ? error.message : String(error)}`
}

// How long after a failed engine update the next look tries it again.
export const updateRetryMs = 60_000

// What the install check asks: a small, fixed session, the same on every machine.
const checkDigest: Digest = {
  kind: "agent",
  harness: "Claude Code",
  project: "shop",
  folder: "api",
  branch: "task/checkout-retries",
  plan: null,
  folders: ["src/checkout"],
  prompts: ["Add retries with backoff to the payment client, and cover them with tests."],
  reply: "I added the retries in src/checkout/payments.ts. The tests pass. Anything else?",
  previous: null,
}

type Config = {
  readonly folder: string
  readonly model: string
  /** What `--device` takes. */
  readonly device: string
}

type Facts = { readonly key: string }

const mebibyte = 1024 * 1024

/**
 * Murmur: the engine and model people install, the settings, and the describing of
 * terminals with them, on a GPU of this machine and nowhere else. It gives way to voice
 * input, to a computer short of memory, and to its own failures.
 */
export class Murmur implements Describer {
  private readonly directory: string
  private readonly source: string | undefined
  private readonly model: Artifact
  private readonly server: Server<Config, Facts>
  private manifest: Manifest | undefined
  private modelReady = false
  private engineReady = false
  // The engine folder jobs run with: the manifest's, or while that one is fetched an older
  // one that still runs.
  private engineDir: string | undefined
  private loading: Promise<void> = Promise.resolve()
  private updateFailedAt: number | undefined
  private uninstalling = false
  private installing: MurmurInstall | null = null
  private failure: string | null = null
  private running:
    | { readonly done: Promise<void>; readonly controller: AbortController }
    | undefined
  private readonly watchers = new Watchers<MurmurState>()
  private readonly usableListeners = new Set<(usable: boolean) => void>()
  private lastUsable = false
  private closed = false
  // Jobs run one after another: the tail of the line, and the request now in flight.
  private line: Promise<void> = Promise.resolve()
  private current: AbortController | undefined
  private readonly sleepers = new Set<() => void>()
  private readonly unwatchVoice: (() => void) | undefined
  // The key of the server being started: `prepare` makes it and `facts` keeps it, in one go.
  private fresh = ""
  private failures = 0
  private refusedUntil = 0
  // The device the running server was started with, so a warm job doesn't list them again.
  private cached: { readonly device: string } | undefined

  constructor(
    private readonly settings: MurmurSettingsStore,
    private readonly options: MurmurOptions,
  ) {
    this.directory = options.directory
    this.source =
      options.source ?? (options.engine === undefined ? undefined : dirname(options.engine))
    this.model = options.model ?? pinnedModel
    this.server = this.makeServer(options.idleMs)
    // Voice has priority: its work stops ours and wakes whatever waits for it to end.
    this.unwatchVoice = options.voice?.watch((busy) => {
      if (busy) this.current?.abort()
      this.wake()
    })
  }

  private makeServer(idleMs: number | undefined): Server<Config, Facts> {
    return new Server(this.spec(), {
      ...(this.options.launch && { launch: this.options.launch }),
      ...(idleMs !== undefined && { idleMs }),
      // A model on an iGPU loads in seconds; this is for a slow disk.
      startMs: 120_000,
    })
  }

  private spec(): ServerSpec<Config, Facts> {
    return {
      program: programFile("llama-server"),
      subject: "Murmur",
      health: "/health",
      key: (config) => `${config.device}\0${config.model}`,
      prepare: (config, port) => {
        this.fresh = token()
        return {
          args: [
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "-m",
            config.model,
            "--device",
            config.device,
            "-ngl",
            "999",
            "-c",
            "4096",
            "-np",
            "1",
            "--reasoning",
            "off",
            "--exit-with-stdin",
          ],
          // In the environment, where no one lists it as they would an argument.
          env: { LLAMA_API_KEY: this.fresh },
        }
      },
      facts: () => ({ key: this.fresh }),
    }
  }

  private clock(): number {
    return (this.options.now ?? Date.now)()
  }

  /** Reads the manifest and what is on disk again, as either may have changed. Writes nothing. */
  async refresh(): Promise<void> {
    const manifest = await readManifest(this.options.engine)
    const { ready, folder } = await engineStatus(
      this.directory,
      manifest,
      programFile("llama-server"),
    )
    this.modelReady = manifest !== undefined && (await exists(this.modelPath()))
    this.manifest = manifest
    this.engineReady = ready
    this.engineDir = folder
  }

  /** Loads the saved state at start; the first watch waits for it. */
  start(): void {
    this.loading = this.refresh()
      .catch(() => {})
      // Whoever waits for murmur to be usable hears it is, once the saved state is read.
      .then(() => this.changed())
  }

  ready(): Promise<void> {
    return this.loading
  }

  private installed(): boolean {
    return this.modelReady && this.engineDir !== undefined
  }

  state(): MurmurState {
    const installed = this.installed()
    return {
      available: this.manifest !== undefined,
      installed,
      enabled: this.settings.murmurSettings().enabled && installed,
      wanted: this.settings.murmurEnabledChoice() !== false,
      sizes: { engine: this.manifest?.size ?? 0, model: this.model.size },
      installing: this.installing,
      check: installed ? this.settings.murmurCheck() : null,
      failure: this.failure,
    }
  }

  /** The state now, then again after each change, until `signal` aborts or the owner is released. */
  async *watch(owner: string, signal?: AbortSignal): AsyncGenerator<MurmurState> {
    this.assertOpen()
    await this.ready()
    this.assertOpen()
    await this.refresh()
    this.updateEngine()
    yield* this.watchers.stream(owner, () => this.state(), signal)
  }

  release(owner: string): void {
    this.watchers.release(owner)
  }

  /** Whether jobs can run: installed, on, and checked on a GPU. */
  private usable(): boolean {
    return (
      !this.closed &&
      !this.uninstalling &&
      this.installed() &&
      this.settings.murmurSettings().enabled &&
      this.settings.murmurCheck() !== null
    )
  }

  watchUsable(listener: (usable: boolean) => void): () => void {
    this.usableListeners.add(listener)
    return () => void this.usableListeners.delete(listener)
  }

  private changed(): void {
    this.watchers.changed()
    const usable = this.usable()
    if (usable === this.lastUsable) return
    this.lastUsable = usable
    // What stops being usable must not hold the GPU.
    if (!usable) {
      this.current?.abort()
      void this.server.stop()
    }
    for (const listener of this.usableListeners) listener(usable)
    this.wake()
  }

  /** Starts installing the engine and the model, whichever is missing; `settled` waits for the end. */
  async install(): Promise<void> {
    this.assertOpen()
    if (this.running) throw new DomainError("CONFLICT", "Murmur is already installing.")
    if (this.uninstalling)
      throw new DomainError("CONFLICT", "Murmur is being removed. Install it afterwards.")
    await this.refresh()
    if (this.manifest === undefined) throw unavailable("Murmur is not available in this build.")
    // `refresh` yielded: another install may have started.
    if (this.running || this.uninstalling)
      throw new DomainError("CONFLICT", "Murmur is already installing.")
    const controller = new AbortController()
    this.updateFailedAt = undefined
    this.failure = null
    this.settings.saveMurmurCheck(null)
    // Installing it says the person wants it, whatever they chose before; an off from then
    // on, during the install too, still holds.
    if (!this.installed()) this.settings.saveMurmurSettings({ enabled: null })
    this.installing = { step: "engine", received: 0, total: this.manifest.size }
    this.changed()
    this.running = { controller, done: this.run(this.manifest, controller.signal) }
  }

  /**
   * Fetches the engine of this build alone when murmur is on with its model but the engine
   * is an older one or missing, as after an update of the app.
   */
  private updateEngine(): void {
    const { manifest } = this
    if (
      this.closed ||
      this.running ||
      this.uninstalling ||
      (this.updateFailedAt !== undefined && this.clock() - this.updateFailedAt < updateRetryMs) ||
      this.engineReady ||
      manifest === undefined ||
      !this.settings.murmurSettings().enabled ||
      !this.modelReady
    )
      return
    const controller = new AbortController()
    this.failure = null
    this.installing = { step: "engine", received: 0, total: manifest.size }
    this.changed()
    this.running = { controller, done: this.run(manifest, controller.signal, true) }
  }

  /** Stops an install, and answers once it has. */
  async cancel(): Promise<void> {
    this.running?.controller.abort()
    await this.settled()
  }

  async settled(): Promise<void> {
    await this.running?.done
  }

  /** Removes the engine and the model, and turns murmur off by choice. */
  async uninstall(): Promise<void> {
    this.assertOpen()
    if (this.uninstalling) throw new DomainError("CONFLICT", "Murmur is already being removed.")
    this.uninstalling = true
    try {
      await this.cancel()
      // Off first: a removal that fails halfway must not leave murmur on.
      this.settings.saveMurmurSettings({ enabled: false })
      this.changed()
      // The program is in use until it has exited, which Windows will not delete.
      await this.server.stop()
      try {
        await removeContents(this.directory)
      } catch (error) {
        throw new DomainError(
          "CONFLICT",
          `Murmur could not be removed: ${error instanceof Error ? error.message : String(error)}. Close anything using the files in ${this.directory} and try again.`,
        )
      } finally {
        await this.refresh()
      }
      this.settings.saveMurmurCheck(null)
      this.failure = null
    } finally {
      this.uninstalling = false
      this.changed()
    }
  }

  async set(change: MurmurSettingsChange): Promise<void> {
    this.assertOpen()
    await this.ready()
    this.assertOpen()
    if (this.uninstalling) throw new DomainError("CONFLICT", "Murmur is being removed.")
    // Turned on before any install, it is wanted, and the install that follows turns it on.
    if (change.enabled === true && !this.installed())
      this.settings.saveMurmurSettings({ ...change, enabled: null })
    else this.settings.saveMurmurSettings(change)
    this.changed()
  }

  /** Cancels an install and ends the engine, as the runner closes. */
  async close(): Promise<void> {
    this.closed = true
    this.unwatchVoice?.()
    this.current?.abort()
    this.running?.controller.abort()
    this.wake()
    await this.settled()
    await this.loading
    await this.server.close()
    this.watchers.finish()
  }

  private assertOpen(): void {
    if (this.closed) throw new DomainError("RUNTIME_CLOSING")
  }

  private modelPath(): string {
    return join(this.directory, "models", basename(this.model.url))
  }

  private progress(install: MurmurInstall, force = false): void {
    this.installing = install
    this.watchers.progress(force)
  }

  private async run(manifest: Manifest, signal: AbortSignal, engineOnly = false): Promise<void> {
    const program = programFile("llama-server")
    try {
      if (!(await exists(join(engineFolder(this.directory, manifest.sha256), program)))) {
        const total = manifest.size
        this.progress({ step: "engine", received: 0, total }, true)
        await fetchEngine({
          manifest,
          source: this.source,
          directory: this.directory,
          program,
          signal,
          progress: (received) => this.progress({ step: "engine", received, total }),
          // Unpacking removes the engines this one replaces; none may be running.
          replacing: async () => {
            this.engineDir = undefined
            this.changed()
            await this.server.stop()
          },
        })
        await this.refresh()
      }
      if (engineOnly) return
      await this.fetchModel(signal)
      this.progress({ step: "check", received: 0, total: 0 }, true)
      const check = await this.measure(signal)
      this.settings.saveMurmurCheck(check)
      // Checked, so on, unless the person turned it off themselves.
      this.settings.saveMurmurSettings({ enabled: this.settings.murmurEnabledChoice() !== false })
      await this.refresh()
    } catch (error) {
      // Cancelling is the person's choice, not a failure.
      if (!signal.aborted && !aborted(error)) {
        this.failure = explain(error).slice(0, 1024)
        this.updateFailedAt = engineOnly ? this.clock() : undefined
      }
      // What finished stays: a model that downloaded is not downloaded again.
      await this.refresh().catch(() => {})
    } finally {
      this.installing = null
      this.running = undefined
      this.changed()
    }
  }

  private async fetchModel(signal: AbortSignal): Promise<void> {
    const total = this.model.size
    this.progress({ step: "model", received: 0, total }, true)
    if (await exists(this.modelPath())) return
    await download({
      from: this.model.url,
      to: this.modelPath(),
      sha256: this.model.sha256,
      signal,
      progress: (received) => this.progress({ step: "model", received, total }),
    })
    await this.refresh()
  }

  /** The devices this engine sees; empty when it can't list them. */
  private listDevices(folder: string): Promise<Device[]> {
    const program = join(folder, programFile("llama-server"))
    const launch: Launch = this.options.launch ?? ((p, a) => ({ command: p, args: a }))
    const launched = launch(program, ["--list-devices"])
    return new Promise((resolve) => {
      execFile(
        launched.command,
        [...launched.args],
        {
          cwd: dirname(program),
          timeout: 30_000,
          windowsHide: true,
          env: { ...process.env, ...launched.env },
        },
        (_error, stdout, stderr) => resolve(parseDevices(`${stdout}\n${stderr}`)),
      )
    })
  }

  private async complete(
    config: Config,
    server: Server<Config, Facts>,
    chat: readonly Message[],
    signal: AbortSignal,
  ): Promise<Description> {
    const running = await server.acquire(config)
    const response = await server.request(running, "/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${running.facts.key}`,
      },
      body: JSON.stringify({
        messages: chat,
        temperature: 0,
        max_tokens: 200,
        stream: false,
        response_format: responseFormat,
      }),
      signal,
    })
    if (!response.ok)
      throw new EngineError(server.explain(running, `the engine answered ${response.status}`))
    server.touch(running)
    const body = (await response.json().catch(() => undefined)) as
      | { choices?: { message?: { content?: unknown } }[] }
      | undefined
    const content = body?.choices?.[0]?.message?.content
    const description = typeof content === "string" ? parseDescription(content) : undefined
    if (description === undefined)
      throw new EngineError("Murmur's model did not answer with a title and a summary.")
    return description
  }

  /**
   * Runs the check description on each GPU in order, integrated first, and keeps the first
   * that gives a valid one. None is a failure that says murmur needs a working GPU.
   */
  private async measure(signal: AbortSignal): Promise<MurmurCheck> {
    const folder = this.engineDir
    if (folder === undefined) throw new EngineError("The murmur engine is missing.")
    const devices = candidates(await this.listDevices(folder))
    signal.throwIfAborted()
    const needs = "Murmur needs a working GPU, and this computer has none it can use."
    if (devices.length === 0) throw new EngineError(needs)
    const chat = messages(checkDigest)
    for (const device of devices) {
      // Its own server, so a device that hangs or crashes ends with it.
      const server = this.makeServer(undefined)
      const timeoutMs = this.options.checkMs ?? 120_000
      const limit = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      const stop = () => void server.stop()
      limit.addEventListener("abort", stop, { once: true })
      try {
        const config = { folder, model: this.modelPath(), device: device.id }
        // The first run loads the model and warms up the GPU, which later jobs do not pay for.
        // eslint-disable-next-line no-await-in-loop -- One device at a time.
        await this.complete(config, server, chat, limit)
        const started = performance.now()
        // eslint-disable-next-line no-await-in-loop -- One device at a time.
        await this.complete(config, server, chat, limit)
        return {
          device: device.name.slice(0, 256),
          integrated: device.kind === "igpu",
          milliseconds: Math.round(performance.now() - started),
        }
      } catch {
        // Cancelling ends the check; any other failure is this device's, and the next is tried.
        signal.throwIfAborted()
      } finally {
        limit.removeEventListener("abort", stop)
        // eslint-disable-next-line no-await-in-loop -- One device at a time.
        await server.close()
      }
    }
    throw new EngineError(`${needs} None of its GPUs described a test terminal.`)
  }

  // Waiting between jobs' looks at voice and memory: ends at once on a wake.
  private pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.sleepers.delete(done)
        signal?.removeEventListener("abort", done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      timer.unref()
      this.sleepers.add(done)
      signal?.addEventListener("abort", done, { once: true })
    })
  }

  private wake(): void {
    for (const sleeper of this.sleepers) sleeper()
  }

  async describe(digest: Digest, signal?: AbortSignal): Promise<Description | undefined> {
    if (signal?.aborted || !this.usable()) return undefined
    const before = this.line
    let finish!: () => void
    this.line = new Promise<void>((resolve) => (finish = resolve))
    await before
    try {
      return await this.job(digest, signal)
    } finally {
      finish()
    }
  }

  private lowMemory(): boolean {
    const free = (this.options.freeMemory ?? freemem)() / mebibyte
    return free < (this.options.minFreeMiB ?? 2048)
  }

  private async job(
    digest: Digest,
    signal: AbortSignal | undefined,
  ): Promise<Description | undefined> {
    const chat = messages(redactDigest(digest))
    const retryMs = this.options.retryMs ?? 15_000
    for (;;) {
      if (signal?.aborted || !this.usable()) return undefined
      if (this.clock() < this.refusedUntil) return undefined
      // Waits for voice to finish and for memory to come back, then looks again.
      if (this.options.voice?.busy() || this.lowMemory()) {
        // eslint-disable-next-line no-await-in-loop -- One look at a time.
        await this.pause(retryMs, signal)
        continue
      }
      const controller = new AbortController()
      this.current = controller
      const onAbort = () => controller.abort()
      signal?.addEventListener("abort", onAbort, { once: true })
      try {
        // eslint-disable-next-line no-await-in-loop -- One job at a time.
        const config = await this.configuration()
        if (config === "wait") {
          // eslint-disable-next-line no-await-in-loop -- One look at a time.
          await this.pause(retryMs, signal)
          continue
        }
        if (config === undefined) return undefined
        // A voice that began while the server started stopped this job; try again after it.
        if (controller.signal.aborted) {
          if (signal?.aborted) return undefined
          continue
        }
        // eslint-disable-next-line no-await-in-loop -- One job at a time.
        const description = await this.complete(config, this.server, chat, controller.signal)
        this.failures = 0
        return description
      } catch {
        if (signal?.aborted || this.closed) return undefined
        // Stopped by voice, not by a failure: wait and run again.
        if (controller.signal.aborted) continue
        this.failures += 1
        this.refusedUntil =
          this.clock() + (this.options.backoffMs ?? 30_000) * 2 ** Math.min(this.failures - 1, 4)
        return undefined
      } finally {
        signal?.removeEventListener("abort", onAbort)
        if (this.current === controller) this.current = undefined
      }
    }
  }

  // What to run the server with: the checked GPU, found by name as indexes change; "wait"
  // when that GPU is short of memory to load the model into.
  private async configuration(): Promise<Config | "wait" | undefined> {
    const folder = this.engineDir
    const check = this.settings.murmurCheck()
    if (folder === undefined || check === null) return undefined
    const model = this.modelPath()
    if (this.server.facts !== undefined && this.cached !== undefined)
      return { ...this.cached, folder, model }
    const device = (await this.listDevices(folder)).find(
      (candidate) => candidate.name.slice(0, 256) === check.device,
    )
    if (device === undefined) return undefined
    if (device.freeMiB < (this.options.minFreeMiB ?? 2048)) return "wait"
    this.cached = { device: device.id }
    return { folder, model, device: device.id }
  }
}
