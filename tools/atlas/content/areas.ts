import type { AnchorRef, Area } from "../src/atlas.ts"

export type CuratedArea = Pick<Area, "id" | "title" | "node" | "purpose" | "globs" | "docs"> & {
  entries: AnchorRef[]
}

// The slices of the code worth knowing by name. Globs are repository-relative.
export const areas: CuratedArea[] = []
