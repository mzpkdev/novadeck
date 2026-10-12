import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Anchor, AnchorRef, BrokenAnchor } from "../src/atlas.ts"

export type Anchors = {
  // Resolve a curated pointer; `where` names who asked, for the broken list.
  resolve: (ref: AnchorRef, where: string) => Anchor
  // The line of the first match of `text` in `file`, or null.
  find: (file: string, text: string) => number | null
  read: (file: string) => string | null
  broken: () => BrokenAnchor[]
}

export const createAnchors = (repo: string): Anchors => {
  const files = new Map<string, string | null>()
  const broken: BrokenAnchor[] = []

  const read = (file: string): string | null => {
    if (!files.has(file)) {
      try {
        files.set(file, readFileSync(join(repo, file), "utf8"))
      } catch {
        files.set(file, null)
      }
    }
    return files.get(file) ?? null
  }

  const find = (file: string, text: string): number | null => {
    const source = read(file)
    if (source === null) return null
    const index = source.indexOf(text)
    if (index === -1) return null
    return source.slice(0, index).split("\n").length
  }

  const resolve = (ref: AnchorRef, where: string): Anchor => {
    const line =
      ref.text === undefined ? (read(ref.file) === null ? null : 1) : find(ref.file, ref.text)
    if (line === null) broken.push({ where, file: ref.file, text: ref.text ?? "" })
    return { file: ref.file, line }
  }

  return { resolve, find, read, broken: () => broken }
}
