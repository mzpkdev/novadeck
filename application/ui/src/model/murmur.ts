import type { Store } from "./store"

// Murmur, as a backend offers it: a small model that runs on the backend's machine, on its
// graphics, and names the terminals from what they are doing. The person turns it on from
// the one-time offer or from Preferences; it has no model or language to choose. Nothing
// downloads without that click.

// What the person is told it is called. The name isn't final, so every text that says it
// reads it from here.
export const MURMUR_NAME = "Murmur"

export type MurmurState = {
  // Whether the backend has an engine for its platform; without one nothing installs.
  readonly available: boolean
  // Whether the engine and the model are on disk.
  readonly installed: boolean
  // Whether the person turned murmur on; it needs to be installed.
  readonly enabled: boolean
  // Whether the person wants murmur, installed or not: until they turn it off, an install
  // turns it on.
  readonly wanted: boolean
  // Download sizes in bytes.
  readonly sizes: { readonly engine: number; readonly model: number }
  // What an install is doing, with the bytes received of the step's total.
  readonly installing: {
    readonly step: "engine" | "model" | "check"
    readonly received: number
    readonly total: number
    // The engine's own update, which the app starts for a murmur that is on, not an install the
    // person asked for.
    readonly engineOnly: boolean
  } | null
  // The device that passed the check after an install; null until one does.
  readonly check: {
    readonly device: string
    readonly integrated: boolean
    readonly milliseconds: number
  } | null
  // Why the last install failed for a reason that may pass (network, disk), or why a change
  // was refused, until the next snapshot or try.
  readonly failure: string | null
  // Why this computer can't run murmur, technical, for a details view: set before any
  // download when the host knows, or by an install that found out (its downloads are then
  // removed). Not a failure to retry: there is nothing to install, and no offer.
  readonly unsupported: string | null
  // Whether that came from an install and "Check again" (an install) asks anew; the host's
  // word is not, and an engine of another build forgets an install's by itself.
  readonly recheck: boolean
  // Installed, with no check passed and no install running: a check that was cancelled, or
  // dropped because its device went away. Not a failure in itself: `failure` is null unless
  // something else went wrong, and then it takes precedence. Installing again runs the check.
  readonly unchecked: boolean
  // In how many sessions of the app the one-time offer was shown; it stops after three.
  readonly offers: number
}

// What a backend's call is called in the failure it shows in the state, `Couldn't ${name}: why`.
export const changeNames = {
  install: "install",
  cancel: "cancel the install",
  uninstall: "uninstall",
  set: "change the setting",
} as const

// Whether a failure in the state is the refusal of the install call itself, as the runner
// turned it away.
export const isRefusedInstall = (failure: string): boolean =>
  failure.startsWith(`Couldn't ${changeNames.install}`)

// Whether a failure in the state is an install's, or the refusal of another call.
export const isInstallFailure = (failure: string): boolean =>
  ![changeNames.cancel, changeNames.uninstall, changeNames.set].some((name) =>
    failure.startsWith(`Couldn't ${name}`),
  )

// What each step of an install is called.
export const murmurStepTitles = {
  engine: "Downloading engine",
  model: "Downloading model",
  check: "Checking this computer",
} as const

export type MurmurSettings = {
  readonly enabled: boolean
}

// What a backend is told of murmur: its on or off, or that the one-time offer was shown.
export type MurmurChange = Partial<MurmurSettings> & { readonly offered?: true }

export type Murmur = {
  readonly state: Store<MurmurState>
  // Each of these starts the change; `state` shows it as it goes, and its end or failure.
  readonly install: () => void
  readonly cancel: () => void
  // Settles when the removal ended, whether it worked or failed (`state` shows which).
  readonly uninstall: () => Promise<void>
  readonly set: (settings: MurmurChange) => void
  // A backend may ask the app to offer murmur now, on the selected terminal, where the demo's
  // debug panel does: each bump is a request.
  readonly offer?: Store<number>
  // Asks for the gist of the reply that ended the terminal's turn at `at`, which the person
  // hasn't seen; it arrives with the terminal's agent status. Fire and forget.
  readonly gist?: (terminalId: string, at: number) => void
}
