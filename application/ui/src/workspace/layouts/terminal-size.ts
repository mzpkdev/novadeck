import type { SizePreset } from "../model/types"

type Dimensions = { width: number; height: number }

export const canvasPresetSize = (preset: SizePreset, viewport?: Dimensions): Dimensions => {
  if (preset === "small") return { width: 600, height: 400 }
  if (
    !viewport ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return { width: 1200, height: 800 }
  const area = 1200 * 800
  // Preserve the large preset's area and respect the Canvas resize minimums.
  const ratio = Math.max(
    320 ** 2 / area,
    Math.min(area / 200 ** 2, viewport.width / viewport.height),
  )
  return {
    width: Math.round(Math.sqrt(area * ratio)),
    height: Math.round(Math.sqrt(area / ratio)),
  }
}

export const gridPresetWidth = (columns: number, preset: SizePreset): number =>
  preset === "large" ? columns : Math.max(4, Math.floor(columns / 2))
