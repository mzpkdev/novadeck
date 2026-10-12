import type { Api, Area, AreaLink, Data } from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"

// How areas depend on each other: imports between their files, procedures one calls and
// another serves, and tables one queries and another owns.
export const extractLinks = (
  _repo: string,
  _anchors: Anchors,
  _areas: Area[],
  _owned: { api: Api; data: Data },
): AreaLink[] => []
