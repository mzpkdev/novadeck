import type { SizePreset } from "../model/types"

export const canvasPresetSize = (preset: SizePreset): { width: number; height: number } =>
  preset === "large" ? { width: 1200, height: 800 } : { width: 600, height: 400 }

export const gridPresetWidth = (columns: number, preset: SizePreset): number =>
  preset === "large" ? columns : Math.max(4, Math.floor(columns / 2))
