import type { AgentSurface, Api, Area, Data } from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"

export type Owned = { api: Api; data: Data; agents: AgentSurface }

// The curated areas from `content/areas.ts`, measured and given what they own.
export const extractAreas = (_repo: string, _anchors: Anchors, _owned: Owned): Area[] => []

// The area whose globs match a repository-relative file.
export const areaOf = (_areas: Area[], _file: string): string | null => null
