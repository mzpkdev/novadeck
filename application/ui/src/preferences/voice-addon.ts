import { dictationKeys } from "../interaction/shortcuts"
import type { VoiceState } from "../model/voice"
import { formatSize, installSize, stepLabels } from "../model/voice-format"

export { dictationKeys, formatSize, installSize, stepLabels }

// What the voice input card says, as plain functions of the addon's state.

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

// Whether voice input is set up: its model is installed and either passed its check or was
// turned on despite a failed one. Otherwise Addons offers the install, whatever is on disk.
export const voiceSetUp = (state: VoiceState): boolean =>
  state.installed.includes(state.model) && (state.check !== null || state.enabled)

// What an uninstall frees: the engine and every model on disk, with the shared
// speech-detection model counted once per model for the same reason.
export const installedSize = (state: VoiceState): number =>
  state.sizes.engine + state.installed.reduce((sum, model) => sum + state.sizes[model], 0)

export const checkText = ({ milliseconds }: NonNullable<VoiceState["check"]>): string =>
  `Checked: a test clip took ${(milliseconds / 1000).toFixed(1)} s.`
