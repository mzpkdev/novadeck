import { createStore } from "../../model/store"
import type { Voice, VoiceModel, VoiceState } from "../../model/voice"

// A pretend voice input addon for the browser demo and the specs. It starts installed and
// on, as the try demo shows it and never offers it; started uninstalled, nothing is
// installed until the person installs it, and the install walks through downloading the
// engine, then the model, then a check, ending with voice input on. As the runner's on a
// computer with a GPU, it installs turbo and nothing more. Dictating answers a canned
// transcript a moment after the clip ends.

const megabyte = 1024 * 1024

// Voice input not on the computer, wanted until the person says otherwise.
export const demoVoiceState: VoiceState = {
  available: true,
  installed: [],
  enabled: false,
  wanted: true,
  model: "turbo",
  aim: "turbo",
  engineInstalled: false,
  language: "auto",
  sizes: { engine: 28 * megabyte, turbo: 574 * megabyte, small: 190 * megabyte },
  installing: null,
  check: null,
  failure: null,
}

const installedState: VoiceState = {
  ...demoVoiceState,
  installed: ["turbo"],
  engineInstalled: true,
  enabled: true,
  check: { model: "turbo", milliseconds: 2300, gpu: true, recommended: "turbo" },
}

// Where the demo starts: installed (the try demo's), or not (the offer, and the Addons
// card's Install), or not, and its first install fails.
export type DemoVoiceStart = "installed" | "uninstalled" | "failing"

// What a spec asks for in its address's hash: `&voice=uninstalled`, or `&voice=failing`, not
// installed with an install that fails.
export const requestedVoice = (): DemoVoiceStart => {
  const asked =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("voice")
  return asked === "uninstalled" || asked === "failing" ? asked : "installed"
}

// What the debug panel puts voice input in.
export type DemoVoiceScenario =
  | DemoVoiceStart
  | "declined"
  | "installing"
  | "install-and-finish"
  | "install-fallback"
  | "software-graphics"
  | "network-failure"

export type DemoVoice = Voice & { readonly show: (scenario: DemoVoiceScenario) => void }

export const isDemoVoice = (voice: Voice | undefined): voice is DemoVoice =>
  voice !== undefined && "show" in voice

export const demoTranscript = "Add a retry to the checkout request and run the tests."

export type DemoVoiceTiming = {
  // How long each of an install's steps takes, in milliseconds.
  readonly step: number
  // How long a transcription takes, in milliseconds.
  readonly transcribe: number
}

// Each step long enough to see, and for a check that runs on a busy machine to catch.
const defaultTiming: DemoVoiceTiming = { step: 1200, transcribe: 600 }

// How many times a download reports progress.
const ticks = 8

export const createDemoVoice = (
  timing: DemoVoiceTiming = defaultTiming,
  start: DemoVoiceStart = "installed",
): DemoVoice => {
  const state = createStore<VoiceState>(start === "installed" ? installedState : demoVoiceState)
  let timers: ReturnType<typeof setTimeout>[] = []
  // As the runner, the person's choice, undefined until they make one: a first install
  // turns voice input on, another unless they turned it off.
  let choice: boolean | undefined
  const stop = (): void => {
    timers.forEach(clearTimeout)
    timers = []
  }
  const later = (run: () => void, wait: number): void => {
    timers.push(setTimeout(run, wait))
  }

  const sizeOf = (model: VoiceModel, step: "engine" | "model" | "check"): number => {
    const { sizes } = state.getSnapshot()
    if (step === "engine") return sizes.engine
    return step === "model" ? sizes[model] : 1
  }
  const progress = (model: VoiceModel, step: "engine" | "model" | "check", part: number): void => {
    const total = sizeOf(model, step)
    state.update((current) => ({
      ...current,
      installing: { model, step, received: Math.round((total * part) / ticks), total },
    }))
  }
  const finish = (model: VoiceModel): void => {
    const gpu = model === "turbo"
    state.update((current) => ({
      ...current,
      installing: null,
      installed: [model],
      engineInstalled: true,
      aim: model,
      enabled: choice !== false,
      wanted: choice !== false,
      model,
      check: { model, milliseconds: gpu ? 2300 : 3800, gpu, recommended: model },
    }))
  }

  // Whether the next install finds turbo too slow, as the runner's does on a computer
  // without a GPU: it goes on to small, and turbo goes.
  let slowTurbo = false
  // How the next install ends instead of finishing: held at the model, half there, until
  // cancelled, or failing as a connection that drops.
  let endsIn: "hold" | "failure" | undefined = start === "failing" ? "failure" : undefined

  const install = (): void => {
    if (state.getSnapshot().installing) {
      state.update((current) => ({ ...current, failure: "An install is already running." }))
      return
    }
    const { installed, aim } = state.getSnapshot()
    // The engine stays once downloaded, so another install skips it.
    const steps: { model: VoiceModel; step: "engine" | "model" | "check" }[] = [
      ...(state.getSnapshot().engineInstalled ? [] : [{ model: aim, step: "engine" as const }]),
      { model: aim, step: "model" },
      { model: aim, step: "check" },
      ...(aim === "turbo" && slowTurbo
        ? [
            { model: "small" as const, step: "model" as const },
            { model: "small" as const, step: "check" as const },
          ]
        : []),
    ]
    // As the runner: a new install forgets the last check until its own passes, and a
    // first one says voice input is wanted, whatever was chosen before.
    if (installed.length === 0) choice = undefined
    state.update((current) => ({
      ...current,
      failure: null,
      check: null,
      wanted: choice !== false,
      // At once, as the first step of the install is begun by the call itself.
      installing: {
        model: aim,
        step: steps[0]!.step,
        received: 0,
        total: sizeOf(aim, steps[0]!.step),
      },
    }))
    const held = endsIn === "hold" ? steps.findIndex(({ step }) => step === "model") : -1
    const failing = endsIn === "failure" ? steps.findIndex(({ step }) => step === "model") : -1
    steps.forEach(({ model, step }, index) => {
      // Held: the model's download stops half way, and nothing follows.
      const last = index === held || index === failing ? ticks / 2 : ticks
      if ((held >= 0 && index > held) || (failing >= 0 && index > failing)) return
      for (let part = 0; part <= last; part += 1)
        later(() => progress(model, step, part), (index + part / ticks) * timing.step)
    })
    if (held >= 0) return
    if (failing >= 0) {
      endsIn = undefined
      later(
        () =>
          state.update((current) => ({
            ...current,
            installing: null,
            failure: "The download stopped: the connection dropped.",
          })),
        (failing + 0.5) * timing.step,
      )
      return
    }
    later(() => finish(aim === "turbo" && slowTurbo ? "small" : aim), steps.length * timing.step)
  }

  const show = (scenario: DemoVoiceScenario): void => {
    stop()
    choice = undefined
    slowTurbo = false
    endsIn = undefined
    if (scenario === "installed") state.update(() => installedState)
    else if (scenario === "uninstalled") state.update(() => demoVoiceState)
    else if (scenario === "declined") {
      // As the runner after No thanks: off by choice, nothing installed.
      choice = false
      state.update(() => ({ ...demoVoiceState, wanted: false }))
    } else if (scenario === "installing") {
      // The next install is held at the model, half there, until cancelled.
      state.update(() => demoVoiceState)
      endsIn = "hold"
    } else if (scenario === "install-and-finish") state.update(() => demoVoiceState)
    else if (scenario === "install-fallback") {
      // Turbo downloads and checks, and is too slow here: small follows, and turbo goes.
      state.update(() => demoVoiceState)
      slowTurbo = true
    } else if (scenario === "software-graphics")
      // As the runner where the host saw only software rendering: small is what installs,
      // and what the offer quotes.
      state.update(() => ({ ...demoVoiceState, aim: "small" }))
    else {
      // The next install fails as a connection that drops.
      state.update(() => demoVoiceState)
      endsIn = "failure"
    }
  }

  return {
    state,
    show,
    install,
    cancel: () => {
      stop()
      state.update((current) => ({ ...current, installing: null }))
    },
    uninstall: () => {
      stop()
      // Removing it says the person doesn't want it.
      choice = false
      state.update(() => ({ ...demoVoiceState, wanted: false }))
    },
    set: (settings) =>
      state.update((current) => {
        const next = { ...current, ...settings }
        // Turned on before an install, it is wanted, and the install will turn it on.
        if (settings.enabled === true && !next.installed.includes(next.model)) {
          choice = undefined
          return { ...next, enabled: false, wanted: true, failure: null }
        }
        if (settings.enabled !== undefined) choice = settings.enabled
        return { ...next, wanted: choice !== false, failure: null }
      }),
    record: () => ({
      append: () => {},
      finish: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ text: demoTranscript, language: "en" }), timing.transcribe),
        ),
      discard: () => {},
    }),
  }
}
