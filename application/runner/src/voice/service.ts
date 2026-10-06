import { access, readdir, readFile, rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

import {
  voiceSampleRate,
  type VoiceCheck,
  type VoiceInstall,
  type VoiceModel,
  type VoiceSettings,
  type VoiceState,
  type VoiceTranscript,
} from "@novadeck/protocol"

import { DomainError } from "../errors.js"
import type { VoiceSettingsChange } from "../workspaces/store.js"
import {
  catalog as pinned,
  readManifest,
  recommend,
  type Catalog,
  type Manifest,
} from "./catalog.js"
import { Clips } from "./clips.js"
import { download, DownloadError, locate } from "./download.js"
import {
  Engine,
  EngineError,
  engineFolder,
  engineProgram,
  unpack,
  type EngineConfig,
  type Launch,
} from "./engine.js"
import { wav } from "./wav.js"

/** Where the runner keeps voice input's settings. */
export type VoiceSettingsStore = {
  voiceSettings(): VoiceSettings
  saveVoiceSettings(settings: VoiceSettingsChange): void
}

export type VoiceOptions = {
  /** The engine's manifest, `engine.json`; without one voice input is unavailable. */
  readonly engine?: string | undefined
  /** Where the engine's archive is: an https URL ending in `/`, or a folder. Beside the manifest by default. */
  readonly source?: string | undefined
  /** Where the engine and models are installed. */
  readonly directory: string
  /** The models to download; those Novadeck ships unless a test brings its own. */
  readonly catalog?: Catalog
  readonly launch?: Launch
  readonly idleMs?: number
  /** How long each of the check's transcriptions may take after an install. */
  readonly checkMs?: number
  readonly now?: () => number
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  )

const aborted = (error: unknown): boolean => error instanceof Error && error.name === "AbortError"

const explain = (error: unknown): string => {
  if (error instanceof DownloadError || error instanceof EngineError) return error.message
  if (error instanceof Error && "code" in error && error.code === "ENOSPC")
    return "There is not enough disk space to install voice input."
  return `Voice input could not be installed: ${error instanceof Error ? error.message : String(error)}`
}

type Watch = { readonly owner: string; finished: boolean; wake: (() => void) | undefined }

// How often progress reaches watchers, at most.
const progressMs = 100

/**
 * Voice input: the engine and models people install, the settings, the clips being
 * recorded, and the transcribing of them. Everything on this machine.
 */
export class Voice {
  private readonly directory: string
  private readonly source: string | undefined
  private readonly catalog: Catalog
  private readonly engine: Engine
  private readonly clips: Clips
  private manifest: Manifest | undefined
  private installed: VoiceModel[] = []
  // Whether the manifest's engine is unpacked; models alone still count as installed, as
  // an update of the app brings a new engine that is fetched without a reinstall.
  private engineReady = false
  // An engine update that failed is not tried again by every clip; installing retries it.
  private updateFailed = false
  private uninstalling = false
  private installing: VoiceInstall | null = null
  private check: VoiceCheck | null = null
  private failure: string | null = null
  private running:
    | { readonly done: Promise<void>; readonly controller: AbortController }
    | undefined
  private readonly watchers = new Set<Watch>()
  private version = 0
  private closed = false

  constructor(
    private readonly settings: VoiceSettingsStore,
    private readonly options: VoiceOptions,
  ) {
    this.directory = options.directory
    this.source =
      options.source ?? (options.engine === undefined ? undefined : dirname(options.engine))
    this.catalog = options.catalog ?? pinned
    this.engine = new Engine({
      ...(options.launch && { launch: options.launch }),
      ...(options.idleMs !== undefined && { idleMs: options.idleMs }),
    })
    this.clips = new Clips(options.now)
  }

  /** Reads the manifest and what is on disk again, as either may have changed. */
  async refresh(): Promise<void> {
    this.manifest = await readManifest(this.options.engine)
    const manifest = this.manifest
    const models: VoiceModel[] = []
    if (manifest)
      for (const model of ["turbo", "small"] as const)
        if ((await exists(this.modelPath(model))) && (await exists(this.vadPath())))
          models.push(model)
    this.engineReady =
      manifest !== undefined &&
      (await exists(join(engineFolder(this.directory, manifest.sha256), engineProgram)))
    this.installed = models
  }

  state(): VoiceState {
    const settings = this.settings.voiceSettings()
    return {
      available: this.manifest !== undefined,
      installed: this.installed,
      // Models that went missing cannot be used, whatever the person once chose.
      enabled: settings.enabled && this.installed.includes(settings.model),
      model: settings.model,
      language: settings.language,
      sizes: {
        engine: this.manifest?.size ?? 0,
        turbo: this.catalog.models.turbo.size + this.catalog.vad.size,
        small: this.catalog.models.small.size + this.catalog.vad.size,
      },
      installing: this.installing,
      check: this.check,
      failure: this.failure,
    }
  }

  /** The state now, then again after each change, until `signal` aborts or the owner is released. */
  async *watch(owner: string, signal?: AbortSignal): AsyncGenerator<VoiceState> {
    this.assertOpen()
    await this.refresh()
    this.updateEngine()
    const watch: Watch = { owner, finished: false, wake: undefined }
    this.watchers.add(watch)
    const stop = () => {
      watch.finished = true
      watch.wake?.()
    }
    signal?.addEventListener("abort", stop, { once: true })
    if (signal?.aborted) stop()
    try {
      let seen = -1
      while (!watch.finished) {
        if (seen !== this.version) {
          seen = this.version
          yield this.state()
          continue
        }
        // eslint-disable-next-line no-await-in-loop -- Wait for the next change.
        await new Promise<void>((resolve) => {
          watch.wake = resolve
        })
      }
    } finally {
      signal?.removeEventListener("abort", stop)
      this.watchers.delete(watch)
    }
  }

  /** Ends an owner's watch streams, as its connection goes. */
  release(owner: string): void {
    this.clips.release(owner)
    for (const watch of this.watchers)
      if (watch.owner === owner) {
        watch.finished = true
        watch.wake?.()
      }
  }

  /** Starts installing `model`, with the engine if it is missing; `settled` waits for the end. */
  async install(model: VoiceModel): Promise<void> {
    this.assertOpen()
    if (this.running) throw new DomainError("CONFLICT", "Voice input is already installing.")
    if (this.uninstalling)
      throw new DomainError("CONFLICT", "Voice input is being removed. Install it afterwards.")
    await this.refresh()
    if (this.manifest === undefined)
      throw new DomainError("VOICE_UNAVAILABLE", "Voice input is not available in this build.")
    // `refresh` yielded: another install may have started.
    if (this.running || this.uninstalling)
      throw new DomainError("CONFLICT", "Voice input is already installing.")
    const controller = new AbortController()
    this.updateFailed = false
    this.failure = null
    this.check = null
    this.installing = { model, step: "engine", received: 0, total: this.manifest.size }
    this.changed()
    this.running = { controller, done: this.run(model, this.manifest, controller.signal) }
  }

  /**
   * Fetches the engine of this build alone when voice input is on with its models but
   * the engine is an older one or missing, as after an update of the app. It shows as an
   * install at the engine step, and a failure lands in `failure`.
   */
  private updateEngine(): void {
    const { manifest } = this
    const settings = this.settings.voiceSettings()
    if (
      this.closed ||
      this.running ||
      this.uninstalling ||
      this.updateFailed ||
      this.engineReady ||
      manifest === undefined ||
      !settings.enabled ||
      !this.installed.includes(settings.model)
    )
      return
    const controller = new AbortController()
    this.failure = null
    this.installing = { model: settings.model, step: "engine", received: 0, total: manifest.size }
    this.changed()
    this.running = {
      controller,
      done: this.run(settings.model, manifest, controller.signal, true),
    }
  }

  /** Stops an install, and answers once it has. */
  async cancel(): Promise<void> {
    this.running?.controller.abort()
    await this.settled()
  }

  /** Answers when no install is running. */
  async settled(): Promise<void> {
    await this.running?.done
  }

  /** Removes the engine and the models, and turns voice input off. */
  async uninstall(): Promise<void> {
    this.assertOpen()
    if (this.uninstalling)
      throw new DomainError("CONFLICT", "Voice input is already being removed.")
    // Held until the end, so nothing installs, records or starts the engine from files
    // that are going.
    this.uninstalling = true
    try {
      await this.cancel()
      // Off first: a removal that fails halfway must not leave voice input on.
      this.settings.saveVoiceSettings({ enabled: false })
      this.changed()
      // The engine's program is in use until it has exited, which Windows will not delete.
      await this.engine.stop()
      // The folder itself may be one the person chose, so only what is in it goes.
      const entries = await readdir(this.directory).catch(() => [])
      try {
        await Promise.all(
          entries.map((entry) => rm(join(this.directory, entry), { recursive: true, force: true })),
        )
      } catch (error) {
        throw new DomainError(
          "VOICE_FAILED",
          `Voice input could not be removed: ${error instanceof Error ? error.message : String(error)}. Close anything using the files in ${this.directory} and try again.`,
        )
      } finally {
        await this.refresh()
      }
      this.check = null
      this.failure = null
    } finally {
      this.uninstalling = false
      this.changed()
    }
  }

  set(change: VoiceSettingsChange): void {
    this.assertOpen()
    if (this.uninstalling) throw new DomainError("CONFLICT", "Voice input is being removed.")
    const model = change.model ?? this.settings.voiceSettings().model
    if (change.model !== undefined && !this.installed.includes(change.model))
      throw new DomainError("CONFLICT", `The ${change.model} model is not installed.`)
    if (change.enabled === true && !this.installed.includes(model))
      throw new DomainError("CONFLICT", "Install voice input before turning it on.")
    this.settings.saveVoiceSettings(change)
    // The engine holds one model, so the next clip starts it with the new one.
    if (change.model !== undefined) void this.engine.stop()
    this.changed()
  }

  /** Adds audio to a clip. The first part of a clip starts the engine, to have it ready by its end. */
  record(owner: string, clipId: string, offset: number, data: string): void {
    this.assertOpen()
    const config = this.configuration()
    if (this.clips.write(owner, clipId, offset, Buffer.from(data, "base64")))
      this.engine.start(config).catch(() => {
        // `transcribe` starts it again and reports why it cannot.
      })
  }

  discard(owner: string, clipId: string): void {
    this.clips.discard(owner, clipId)
  }

  async transcribe(owner: string, clipId: string, prompt?: string): Promise<VoiceTranscript> {
    this.assertOpen()
    const config = this.configuration()
    const pcm = this.clips.get(owner, clipId)
    if (pcm === undefined) throw new DomainError("NOT_FOUND", "That recording is gone.")
    const { language } = this.settings.voiceSettings()
    // Less than a hundredth of a second holds no word, and the engine rejects an empty file.
    if (pcm.length < voiceSampleRate / 50) {
      this.clips.discard(owner, clipId)
      return { text: "", language: language === "auto" ? "" : language }
    }
    try {
      const result = await this.engine.transcribe(config, wav(pcm), { language, prompt })
      this.clips.discard(owner, clipId)
      if (this.failure !== null && this.installing === null) {
        this.failure = null
        this.changed()
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // The engine may be what went wrong with a first clip; keep the clip for another try.
      this.failure = message.slice(0, 1024)
      this.changed()
      throw new DomainError("VOICE_FAILED", this.failure)
    }
  }

  /** Cancels an install and ends the engine, as the runner closes. */
  async close(): Promise<void> {
    this.closed = true
    this.running?.controller.abort()
    await this.settled()
    await this.engine.close()
    for (const watch of this.watchers) {
      watch.finished = true
      watch.wake?.()
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new DomainError("RUNTIME_CLOSING")
  }

  /** The engine's files, for voice input that is on and installed; VOICE_UNAVAILABLE otherwise. */
  private configuration(): EngineConfig {
    const settings = this.settings.voiceSettings()
    if (this.uninstalling)
      throw new DomainError("VOICE_UNAVAILABLE", "Voice input is being removed.")
    if (!settings.enabled || !this.manifest || !this.installed.includes(settings.model))
      throw new DomainError("VOICE_UNAVAILABLE", "Voice input is not turned on.")
    if (!this.engineReady) {
      this.updateEngine()
      // A dictation does not wait for the download, which takes minutes: it is told, and
      // the install in the state shows how far the engine is.
      throw new DomainError(
        "VOICE_UNAVAILABLE",
        this.running
          ? "Updating the voice engine. Try again when it is done."
          : (this.failure ?? "The voice engine is missing. Install voice input again."),
      )
    }
    return this.engineConfig(this.manifest, settings.model, settings.language)
  }

  private engineConfig(manifest: Manifest, model: VoiceModel, language: string): EngineConfig {
    return {
      folder: engineFolder(this.directory, manifest.sha256),
      model: this.modelPath(model),
      vad: this.vadPath(),
      language,
    }
  }

  private modelPath(model: VoiceModel): string {
    return join(this.directory, "models", basename(this.catalog.models[model].url))
  }

  private vadPath(): string {
    return join(this.directory, "models", basename(this.catalog.vad.url))
  }

  private changed(): void {
    this.version += 1
    for (const watch of this.watchers) watch.wake?.()
  }

  /** Updates the install's step, telling watchers at most ten times a second unless `force`. */
  private progress(install: VoiceInstall, force = false): void {
    this.installing = install
    const now = Date.now()
    if (!force && now - this.lastProgress < progressMs) return
    this.lastProgress = now
    this.changed()
  }

  private lastProgress = 0

  private async run(
    model: VoiceModel,
    manifest: Manifest,
    signal: AbortSignal,
    engineOnly = false,
  ): Promise<void> {
    try {
      const folder = engineFolder(this.directory, manifest.sha256)
      if (!(await exists(join(folder, engineProgram)))) {
        const total = manifest.size
        this.progress({ model, step: "engine", received: 0, total }, true)
        if (this.source === undefined)
          throw new DownloadError("This build has nowhere to download the engine from.")
        const archive = join(this.directory, "downloads", manifest.file)
        await download({
          from: locate(this.source, manifest.file),
          to: archive,
          sha256: manifest.sha256,
          signal,
          progress: (received) => this.progress({ model, step: "engine", received, total }),
        })
        // Unpacking removes the engines this one replaces; none may be running.
        await this.engine.stop()
        await unpack(archive, this.directory, manifest.sha256, signal)
        await rm(archive, { force: true })
      }
      if (engineOnly) {
        await this.refresh()
        return
      }
      await this.fetchModel(model, signal)
      this.progress({ model, step: "check", received: 0, total: 0 }, true)
      const check = await this.measure(model, manifest, signal)
      this.settings.saveVoiceSettings({ model, enabled: true })
      await this.refresh()
      this.check = check
    } catch (error) {
      // Cancelling is the person's choice, not a failure.
      if (!signal.aborted && !aborted(error)) {
        this.failure = explain(error).slice(0, 1024)
        this.updateFailed = engineOnly
      }
      // What finished stays: a model that downloaded shows as installed, to turn on or
      // check again, rather than looking as if it had to download again.
      await this.refresh().catch(() => {})
      // The model the person asked for, off until they turn it on.
      if (!engineOnly && this.installed.includes(model)) this.settings.saveVoiceSettings({ model })
    } finally {
      this.installing = null
      this.running = undefined
      this.changed()
    }
  }

  /** Downloads the model and the voice activity model beside it, those not already there. */
  private async fetchModel(model: VoiceModel, signal: AbortSignal): Promise<void> {
    const parts = [
      { artifact: this.catalog.models[model], path: this.modelPath(model) },
      { artifact: this.catalog.vad, path: this.vadPath() },
    ]
    const total = parts.reduce((sum, part) => sum + part.artifact.size, 0)
    this.progress({ model, step: "model", received: 0, total }, true)
    let done = 0
    for (const { artifact, path } of parts) {
      // One file after the other, so the bytes received add up.
      // eslint-disable-next-line no-await-in-loop -- Sequential on purpose.
      if (!(await exists(path)))
        // eslint-disable-next-line no-await-in-loop -- Sequential on purpose.
        await download({
          from: artifact.url,
          to: path,
          sha256: artifact.sha256,
          signal,
          progress: (received) =>
            this.progress({ model, step: "model", received: done + received, total }),
        })
      done += artifact.size
    }
  }

  /** Transcribes the engine's test clip with `model`, to see how this machine does. */
  private async measure(
    model: VoiceModel,
    manifest: Manifest,
    signal: AbortSignal,
  ): Promise<VoiceCheck> {
    const config = this.engineConfig(manifest, model, "en")
    // Its own engine, so a dictation's model is neither swapped out for this one nor
    // ended by the check, and a check never fails because a clip came in.
    const engine = new Engine({ ...(this.options.launch && { launch: this.options.launch }) })
    const stop = () => void engine.stop()
    signal.addEventListener("abort", stop, { once: true })
    try {
      await engine.start(config)
      // Cancelling may come while the engine starts, which nothing interrupts.
      signal.throwIfAborted()
      const clip = await readFile(join(config.folder, "check.wav")).catch(() => {
        throw new EngineError("The engine's archive has no test clip.")
      })
      // A check that never ends would hold the install; one this slow means the model
      // is too much for this computer anyway.
      const timeoutMs = this.options.checkMs ?? 60_000
      const run = () =>
        engine.transcribe(config, clip, { language: "en", timeoutMs }).catch((error) => {
          throw new EngineError(
            `The ${model} model did not transcribe a short test clip within ` +
              `${Math.round(timeoutMs / 1000)} s. ${model === "turbo" ? "Try Small, which is faster, or " : ""}` +
              `turn voice input on to try dictating anyway. (${explain(error)})`,
          )
        })
      // The first run loads the voice model and warms up the GPU, which later clips do not pay for.
      await run()
      signal.throwIfAborted()
      const started = performance.now()
      const result = await run()
      const milliseconds = Math.round(performance.now() - started)
      if (result.text === "")
        throw new EngineError("The engine ran but heard nothing in its test clip.")
      const gpu = engine.gpu ?? false
      return { model, milliseconds, gpu, recommended: recommend({ gpu, milliseconds }) }
    } finally {
      signal.removeEventListener("abort", stop)
      await engine.close()
    }
  }
}
