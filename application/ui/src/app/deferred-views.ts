import { lazy } from "react"

export const Grid = lazy(() =>
  import("../layouts/grid/Grid").then((module) => ({ default: module.Grid })),
)
export const Canvas = lazy(() =>
  import("../layouts/canvas/Canvas").then((module) => ({ default: module.Canvas })),
)
