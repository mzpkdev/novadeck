import type { SizePreset } from "../types"

type Dimensions = { width: number; height: number }

const ratioSize = (fallback: Dimensions, viewport?: Dimensions): Dimensions => {
  if (
    !viewport ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return fallback
  const area = fallback.width * fallback.height
  // Preserve the preset's area and respect the Canvas resize minimums.
  const ratio = Math.max(
    320 ** 2 / area,
    Math.min(area / 200 ** 2, viewport.width / viewport.height),
  )
  return {
    width: Math.round(Math.sqrt(area * ratio)),
    height: Math.round(Math.sqrt(area / ratio)),
  }
}

// A window new to Canvas opens in the viewport's ratio, as an enlarged one does, at the
// area it would have had.
export const canvasNewTerminalSize = (
  viewport: Dimensions | undefined,
  fallback: Dimensions = { width: 600, height: 400 },
): Dimensions => ratioSize(fallback, viewport)

export const canvasPresetSize = (preset: SizePreset, viewport?: Dimensions): Dimensions => {
  if (preset === "small") return { width: 600, height: 400 }
  return ratioSize({ width: 1200, height: 800 }, viewport)
}

export const gridPresetWidth = (columns: number, preset: SizePreset): number =>
  preset === "large" ? columns : Math.max(4, Math.floor(columns / 2))
