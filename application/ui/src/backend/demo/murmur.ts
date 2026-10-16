import type { Murmur, MurmurState } from "../../model/murmur"
import { createStore } from "../../model/store"

// A pretend murmur addon for the browser demo and the specs. It starts installed and on,
// as the try demo shows it and never offers it; started uninstalled, nothing is installed
// until the person installs it, and the install walks through downloading the engine, then
// the model, then a check, ending with murmur on. `device: null` is a computer that can't
// run it: the check ends in Not available, with the downloads removed.

const megabyte = 1024 * 1024

const downloadSizes = { engine: 34 * megabyte, model: 1222 * megabyte }

// Murmur not on the computer, wanted until the person says otherwise.
export const demoMurmurState: MurmurState = {
  available: true,
  installed: false,
  enabled: false,
  wanted: true,
  sizes: downloadSizes,
  installing: null,
  check: null,
  unsupported: null,
  recheck: false,
  failure: null,
}

const sampleCheck = { device: "Intel Arc Graphics", integrated: true, milliseconds: 5200 }

const installedState: MurmurState = {
  ...demoMurmurState,
  installed: true,
  enabled: true,
  check: sampleCheck,
}

const softwareSample =
  "This computer reports only software rendering; no graphics hardware answered."

export const unsupportedSample =
  "No graphics device answered. On Linux, check that a Vulkan driver is installed."

// Where the demo starts: installed (the try demo's), not installed (the offer and the
// Addons card's Install), on a computer known not to run it, or not installed on a
// computer whose check will end in Not available.
export type DemoMurmurStart = "installed" | "uninstalled" | "unsupported" | "no-device"

// What a spec asks for in its address's hash: `&murmur=uninstalled`, `unsupported` or
// `no-device`.
export const requestedMurmur = (): DemoMurmurStart => {
  const asked =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("murmur")
  return asked === "uninstalled" || asked === "unsupported" || asked === "no-device"
    ? asked
    : "installed"
}

// What the debug panel puts murmur in.
export type DemoMurmurScenario =
  | DemoMurmurStart
  | "installing"
  | "network-failure"
  | "unsupported-after-install"
  | "unsupported-host"
  | "unsupported-with-files"

export type DemoMurmur = Murmur & { readonly show: (scenario: DemoMurmurScenario) => void }

export const isDemoMurmur = (murmur: Murmur | undefined): murmur is DemoMurmur =>
  murmur !== undefined && "show" in murmur

export type DemoMurmurTiming = {
  // How long each of an install's steps takes, in milliseconds.
  readonly step: number
  // The GPU the check passes on; null for a computer with none that works.
  readonly device: string | null
}

// Each step long enough to see.
const defaultTiming: DemoMurmurTiming = {
  step: 1200,
  device: "Intel Arc Graphics",
}

// How many times a download reports progress.
const ticks = 8

const steps = ["engine", "model", "check"] as const

export const createDemoMurmur = (
  initial: DemoMurmurTiming = defaultTiming,
  start: DemoMurmurStart = "installed",
): DemoMurmur => {
  let timing = start === "no-device" ? { ...initial, device: null } : initial
  const state = createStore<MurmurState>(
    start === "installed"
      ? installedState
      : start === "unsupported"
        ? { ...demoMurmurState, unsupported: unsupportedSample, recheck: true }
        : demoMurmurState,
  )
  let timers: ReturnType<typeof setTimeout>[] = []
  // As the runner, the person's choice, undefined until they make one: an install turns
  // murmur on unless they turned it off.
  let choice: boolean | undefined
  const stop = (): void => {
    timers.forEach(clearTimeout)
    timers = []
  }
  const later = (run: () => void, wait: number): void => {
    timers.push(setTimeout(run, wait))
  }

  const progress = (step: (typeof steps)[number], part: number): void => {
    const { sizes } = state.getSnapshot()
    const total = step === "engine" ? sizes.engine : step === "model" ? sizes.model : 1
    state.update((current) => ({
      ...current,
      installing: { step, received: Math.round((total * part) / ticks), total },
    }))
  }
  // With no device that works the check ends in Not available, as the runner's: the
  // downloads are removed and the verdict stays.
  const finish = (): void => {
    const { device } = timing
    if (device === null) {
      state.update(() => ({
        ...demoMurmurState,
        wanted: choice !== false,
        unsupported: unsupportedSample,
        recheck: true,
      }))
      return
    }
    state.update((current) => ({
      ...current,
      installing: null,
      installed: true,
      enabled: choice !== false,
      wanted: choice !== false,
      check: { device, integrated: true, milliseconds: 5200 },
      failure: null,
    }))
  }

  const install = (): void => {
    if (state.getSnapshot().installing) {
      state.update((current) => ({
        ...current,
        failure: "An install is already running.",
      }))
      return
    }
    // As the runner: a first install says murmur is wanted, whatever was chosen before.
    if (!state.getSnapshot().installed) choice = undefined
    state.update((current) => ({
      ...current,
      // Installing again asks the computer anew.
      unsupported: null,
      recheck: false,
      failure: null,
      check: null,
      wanted: choice !== false,
    }))
    // The files stay once downloaded, so another try only runs the check.
    const todo = state.getSnapshot().installed ? steps.slice(2) : steps
    todo.forEach((step, index) => {
      for (let part = 0; part <= ticks; part += 1)
        later(() => progress(step, part), (index + part / ticks) * timing.step)
    })
    later(finish, todo.length * timing.step)
  }

  const show = (scenario: DemoMurmurScenario): void => {
    stop()
    choice = undefined
    if (scenario === "installed") state.update(() => installedState)
    else if (scenario === "unsupported")
      state.update(() => ({
        ...demoMurmurState,
        unsupported: unsupportedSample,
        recheck: true,
      }))
    else if (scenario === "unsupported-host")
      // The host saw only software rendering: no Check again.
      state.update(() => ({
        ...demoMurmurState,
        unsupported: softwareSample,
      }))
    else if (scenario === "unsupported-with-files")
      // Removing the files for a verdict failed: they stay, unchecked, beside it.
      state.update(() => ({
        ...installedState,
        enabled: false,
        check: null,
        unsupported: unsupportedSample,
        recheck: true,
      }))
    else if (scenario === "installing")
      // Held at the model, half there, until cancelled.
      state.update(() => ({
        ...demoMurmurState,
        installing: {
          step: "model",
          received: downloadSizes.model / 2,
          total: downloadSizes.model,
        },
      }))
    else if (scenario === "network-failure")
      state.update(() => ({
        ...demoMurmurState,
        failure: "The download stopped: the connection dropped.",
      }))
    else {
      // The next install ends where the computer can't run it.
      state.update(() => demoMurmurState)
      timing = scenario === "unsupported-after-install" ? { ...initial, device: null } : initial
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
      state.update(() => ({ ...demoMurmurState, wanted: false }))
      return Promise.resolve()
    },
    set: (settings) =>
      state.update((current) => {
        // Turned on before an install, it is wanted, and the install will turn it on.
        if (settings.enabled === true && !current.installed) {
          choice = undefined
          return { ...current, enabled: false, wanted: true, failure: null }
        }
        if (settings.enabled !== undefined) choice = settings.enabled
        return {
          ...current,
          ...settings,
          wanted: choice !== false,
          failure: null,
        }
      }),
  }
}
