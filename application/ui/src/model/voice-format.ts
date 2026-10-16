import type { VoiceState } from "./voice"

// How voice input's sizes and steps read, for the strip and the Addons card.

const megabyte = 1024 * 1024
const gigabyte = 1024 * megabyte

// A download size in whole megabytes, or gigabytes with a decimal from one up. Anything
// received reads as at least a megabyte; only nothing at all reads as none.
export const formatSize = (bytes: number): string =>
  bytes >= gigabyte
    ? `${(bytes / gigabyte).toFixed(1)} GB`
    : `${bytes <= 0 ? 0 : Math.max(1, Math.round(bytes / megabyte))} MB`

// What an install downloads: the model it aims for (turbo, or small where the computer is
// known not to suit turbo), and the engine too until one is there. A turbo that later turns
// out too slow for this computer costs small's download after, which isn't counted.
export const installSize = (state: VoiceState): number =>
  state.sizes[state.aim] + (state.installed.length ? 0 : state.sizes.engine)

export const stepLabels = {
  engine: "Downloading engine",
  model: "Downloading model",
  check: "Checking",
} as const
