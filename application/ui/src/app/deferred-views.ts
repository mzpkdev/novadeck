import { lazy } from "react"

export const Grid = lazy(() =>
  import("../workspace/layouts/grid/Grid").then((module) => ({ default: module.Grid })),
)
export const Canvas = lazy(() =>
  import("../workspace/layouts/canvas/Canvas").then((module) => ({ default: module.Canvas })),
)
