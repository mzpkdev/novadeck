import { currentPlatform, shortcutBindings, type Shortcut } from "../interaction/shortcuts"
import type { VoiceState } from "../model/voice"

// What the voice input card says, as plain functions of the addon's state.

// The keys the person holds to dictate, when the shortcut list names them.
export const dictationKeys = (): readonly string[] | undefined => {
  const bindings: Partial<Record<string, Shortcut>> = shortcutBindings(currentPlatform())
  return bindings["voice"]?.display
}

export const languages = [
  { label: "Auto-detect", value: "auto" },
  { label: "English", value: "en" },
  { label: "Polish", value: "pl" },
  { label: "German", value: "de" },
  { label: "French", value: "fr" },
  { label: "Spanish", value: "es" },
  { label: "Italian", value: "it" },
  { label: "Portuguese", value: "pt" },
  { label: "Dutch", value: "nl" },
  { label: "Ukrainian", value: "uk" },
  { label: "Russian", value: "ru" },
  { label: "Czech", value: "cs" },
  { label: "Swedish", value: "sv" },
  { label: "Turkish", value: "tr" },
  { label: "Japanese", value: "ja" },
  { label: "Chinese", value: "zh" },
  { label: "Korean", value: "ko" },
  { label: "Hindi", value: "hi" },
  { label: "Arabic", value: "ar" },
]

const megabyte = 1024 * 1024
const gigabyte = 1024 * megabyte

// A download size in whole megabytes, or gigabytes with a decimal from one up. Anything
// received reads as at least a megabyte; only nothing at all reads as none.
export const formatSize = (bytes: number): string =>
  bytes >= gigabyte
    ? `${(bytes / gigabyte).toFixed(1)} GB`
    : `${bytes <= 0 ? 0 : Math.max(1, Math.round(bytes / megabyte))} MB`

// Whether voice input is set up: its model is installed and either passed its check or was
// turned on despite a failed one. Otherwise Addons offers the install, whatever is on disk.
export const voiceSetUp = (state: VoiceState): boolean =>
  state.installed.includes(state.model) && (state.check !== null || state.enabled)

// What an install downloads: the model it aims for (turbo, or small where the computer is
// known not to suit turbo), and the engine too until one is there. A turbo that later turns
// out too slow for this computer costs small's download after, which isn't counted.
export const installSize = (state: VoiceState): number =>
  state.sizes[state.aim] + (state.installed.length ? 0 : state.sizes.engine)

// What an uninstall frees: the engine and every model on disk, with the shared
// speech-detection model counted once per model for the same reason.
export const installedSize = (state: VoiceState): number =>
  state.sizes.engine + state.installed.reduce((sum, model) => sum + state.sizes[model], 0)

export const stepLabels = {
  engine: "Downloading engine",
  model: "Downloading model",
  check: "Checking",
} as const

export const checkText = ({ milliseconds }: NonNullable<VoiceState["check"]>): string =>
  `Checked: a test clip took ${(milliseconds / 1000).toFixed(1)} s.`
