import type { MurmurState } from "../model/murmur"
import { formatSize } from "./voice-addon"

// What the murmur card says, as plain functions of the addon's state.

export const murmurDescription = "Names your terminals from what they're doing, on this computer."

// What an install downloads: the engine and the model.
export const murmurInstallSize = ({ sizes }: MurmurState): number => sizes.engine + sizes.model

// The note under Install, and in the one-time offer.
export const murmurDownloadNote = (state: MurmurState): string =>
  `Downloads ${formatSize(murmurInstallSize(state))} once, then works offline.`

export const murmurStepTitles = {
  engine: "Downloading engine",
  model: "Downloading model",
  check: "Checking this computer",
} as const

// Where murmur runs, once a check has passed.
export const deviceText = ({ device }: NonNullable<MurmurState["check"]>): string =>
  `Runs on ${device}.`
