import type { AnchorRef, RuntimeEdge, RuntimeNode } from "../src/atlas.ts"

type Curated<T> = Omit<T, "anchor" | "areas"> & { anchor: AnchorRef }

// What runs when Novadeck runs, and the channels between the pieces.
export const runtime: {
  nodes: Curated<RuntimeNode>[]
  edges: (Omit<RuntimeEdge, "anchor"> & { anchor: AnchorRef })[]
} = {
  nodes: [],
  edges: [],
}
