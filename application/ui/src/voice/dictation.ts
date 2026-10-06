import type { TerminalKey } from "../backend/port"
import { createStore, type MutableStore, type Store } from "../model/store"
import { maxClipSeconds, type Voice, type VoiceClip, type VoiceState } from "../model/voice"
import type { Capture, CaptureHandlers } from "./capture"
import type { Dictation } from "./dictation-control"
import {
  idle,
  minimumClipSeconds,
  stepDictation,
  type DictationEffect,
  type DictationEvent,
  type Dictating,
  type Readiness,
} from "./dictation-state"
import { voiceSampleRate } from "./resample"

const noticeMilliseconds = 4000

// Whether voice input is on and has the model it asks for.
export const voiceReady = (state: VoiceState): boolean =>
  state.enabled && state.installed.includes(state.model)

const readiness = (state: VoiceState): Readiness =>
  voiceReady(state)
    ? { ready: true }
    : {
        ready: false,
        hint: state.available
          ? "Voice input isn't set up. Turn it on in Preferences → Addons."
          : "Voice input isn't available on this machine. See Preferences → Addons.",
      }

export type DictationView = {
  readonly phase: Dictating["kind"]
  // The terminal being dictated into, while there is a clip.
  readonly target: TerminalKey | null
  readonly mode: "hold" | "toggle" | null
  readonly startedAt: number
  // A hint or a failure, which fades after a few seconds.
  readonly notice: { readonly text: string; readonly tone: "hint" | "error" } | null
}

const quiet: DictationView = {
  phase: "idle",
  target: null,
  mode: null,
  startedAt: 0,
  notice: null,
}

export type DictationDeps = {
  readonly voice: Voice
  readonly typeInto: (key: TerminalKey, text: string) => boolean
  readonly startCapture: (handlers: CaptureHandlers) => Promise<Capture>
  // A few words that help the engine spell what is said there.
  readonly promptFor: (key: TerminalKey) => string | undefined
  readonly now: () => number
  readonly after: (milliseconds: number, run: () => void) => () => void
}

export type DictationController = {
  readonly dictation: Dictation
  readonly view: Store<DictationView>
  // The microphone's loudness, apart from the view because it changes many times a second.
  readonly level: Store<number>
}

// Runs the state machine against the microphone and the backend's voice: starting a clip
// at once, so the engine warms up while the person speaks, streaming audio into it, and
// pasting what comes back into the terminal it began in.
export const createDictation = (deps: DictationDeps): DictationController => {
  const { voice, typeInto, startCapture, promptFor, now, after } = deps
  const view: MutableStore<DictationView> = createStore(quiet)
  const level: MutableStore<number> = createStore(0)
  let state: Dictating = idle
  let clip: VoiceClip | null = null
  let capture: Capture | null = null
  // Bumped for each clip, so a microphone that answers after its clip ended is let go.
  let generation = 0
  let appended = 0
  let cancelLimit: (() => void) | null = null
  let cancelNotice: (() => void) | null = null
  // Bumped for each transcription and again when one is dropped, so a transcript that
  // arrives for a clip the person cancelled is thrown away.
  let transcription = 0

  const notify = (text: string, tone: "hint" | "error"): void => {
    cancelNotice?.()
    view.update((current) => ({ ...current, notice: { text, tone } }))
    cancelNotice = after(noticeMilliseconds, () => {
      cancelNotice = null
      view.update((current) => ({ ...current, notice: null }))
    })
  }
  const clearNotice = (): void => {
    cancelNotice?.()
    cancelNotice = null
  }
  const publish = (): void => {
    const phase = state
    view.update((current) => ({
      phase: phase.kind,
      target: phase.kind === "idle" ? null : phase.target,
      mode: phase.kind === "recording" ? phase.mode : null,
      startedAt: phase.kind === "recording" ? phase.startedAt : 0,
      // A new clip clears what the last one left.
      notice: phase.kind === "recording" ? null : current.notice,
    }))
    if (phase.kind !== "recording") level.update(() => 0)
  }
  const endClip = (): void => {
    generation++
    cancelLimit?.()
    cancelLimit = null
    capture?.stop()
    capture = null
    clip = null
    appended = 0
  }

  const start = (): void => {
    clearNotice()
    const id = ++generation
    const current = voice.record()
    clip = current
    appended = 0
    cancelLimit = after(maxClipSeconds * 1000, () => dispatch({ type: "limit" }))
    startCapture({
      onSamples: (samples) => {
        if (id !== generation) return
        appended += samples.length
        current.append(samples)
      },
      onLevel: (next) => {
        if (id === generation) level.update(() => next)
      },
    }).then(
      (started) => {
        // The clip ended while the microphone was still asking: let it go at once.
        if (id !== generation) started.stop()
        else capture = started
      },
      (failure: unknown) => {
        const message =
          failure instanceof Error ? failure.message : "Couldn't start the microphone."
        // Said even when the clip ended first: a key let go while the system asked for the
        // microphone would otherwise fail without a word.
        if (id === generation) {
          current.discard()
          endClip()
          state = idle
          publish()
        }
        notify(message, "error")
      },
    )
  }

  const finish = (target: TerminalKey): void => {
    const current = clip
    // Stopping flushes the last samples into the clip, so count them after.
    capture?.stop()
    capture = null
    const heard = appended / voiceSampleRate
    const prompt = promptFor(target)
    endClip()
    if (!current) return dispatch({ type: "settled" })
    // A slip of the key, not speech.
    if (heard < minimumClipSeconds) {
      current.discard()
      return dispatch({ type: "settled" })
    }
    const mine = ++transcription
    // False once cancelled: the person has moved on, so neither text nor failure shows.
    const wanted = (): boolean => mine === transcription
    current
      .finish(prompt ? { prompt } : undefined)
      .then(({ text }) => {
        if (!wanted()) return
        const said = text.trim()
        if (!said) return notify("Didn't catch anything.", "hint")
        if (typeInto(target, said)) return
        // The terminal went while the engine worked. The words stay on the clipboard where
        // that is allowed, and in the message where it is not, so they aren't lost.
        const lost = "The terminal closed before the text arrived"
        const clipboard = navigator.clipboard?.writeText(said)
        if (!clipboard) return notify(`${lost}: ${said}`, "error")
        clipboard.then(
          () => notify(`${lost}. The text is on your clipboard.`, "error"),
          () => notify(`${lost}: ${said}`, "error"),
        )
      })
      .catch((failure: unknown) => {
        if (wanted())
          notify(failure instanceof Error ? failure.message : "Couldn't transcribe that.", "error")
      })
      .finally(() => {
        if (wanted()) dispatch({ type: "settled" })
      })
  }

  const run = (effect: DictationEffect): void => {
    switch (effect.kind) {
      case "start":
        return start()
      case "stop":
        return finish(effect.target)
      case "discard":
        clip?.discard()
        return endClip()
      case "drop":
        transcription++
        return
      case "hint":
        return notify(effect.text, "hint")
    }
  }

  const dispatch = (event: DictationEvent): void => {
    const step = stepDictation(state, event)
    state = step.state
    publish()
    step.effects.forEach(run)
  }

  const ready = (): Readiness => readiness(voice.state.getSnapshot())
  return {
    view,
    level,
    dictation: {
      recording: () => state.kind === "recording",
      active: () => state.kind !== "idle",
      press: (target, code) =>
        dispatch({ type: "press", code, target, now: now(), readiness: ready() }),
      release: (code) => dispatch({ type: "release", code, now: now() }),
      blur: () => dispatch({ type: "blur" }),
      cancel: () => dispatch({ type: "cancel" }),
      toggle: (target) => dispatch({ type: "toggle", target, now: now(), readiness: ready() }),
    },
  }
}

// Words that help the engine spell what is said in a terminal: the project and the
// folder it is in, which tend to be what names, paths and commands there are about. They
// make a sentence, capitalised and punctuated, since Whisper writes in its prompt's style:
// a bare list of names gets back lowercase text without punctuation.
export const dictationPrompt = (projectName: string, directory: string): string => {
  const project = projectName.trim()
  const folder = directory
    .split(/[\\/]/)
    .findLast((part) => part.trim())
    ?.trim()
  if (!project) return folder ? `Working in the ${folder} folder.` : ""
  return folder && folder !== project
    ? `Working on ${project}, in the ${folder} folder.`
    : `Working on ${project}.`
}
