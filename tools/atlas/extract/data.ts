import type { Data } from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"

// The runner's SQLite tables, the settings it keeps, and the UI's browser storage.
export const extractData = (_repo: string, _anchors: Anchors): Data => ({
  tables: [],
  settings: [],
  local: [],
})
