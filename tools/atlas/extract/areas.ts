import { execFileSync } from "node:child_process"
import { matchesGlob } from "node:path"

import { areas as curated } from "../content/areas.ts"
import type { AgentSurface, Api, Area, Data } from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"

export type Owned = { api: Api; data: Data; agents: AgentSurface }

const sourceFile = /\.(?:ts|tsx|js|mjs|cjs|rs|css)$/
const testFile = /\.(?:test|spec)\.tsx?$|\.e2e\.ts$/
const generated = /(?:^|\/)(?:node_modules|dist|target)\//

// The area whose globs match a repository-relative file; the first one wins.
export const areaOf = (areas: Area[], file: string): string | null =>
  areas.find((area) => area.globs.some((glob) => matchesGlob(file, glob)))?.id ?? null

// The curated areas from `content/areas.ts`, measured and given what they own.
export const extractAreas = (repo: string, anchors: Anchors, owned: Owned): Area[] => {
  const files = execFileSync("git", ["ls-files"], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  })
    .split("\n")
    .filter((file) => sourceFile.test(file) && !generated.test(file))

  const areas: Area[] = curated.map((area) => ({
    id: area.id,
    title: area.title,
    node: area.node,
    purpose: area.purpose,
    globs: area.globs,
    files: 0,
    lines: 0,
    tests: 0,
    entries: area.entries.map((entry) => anchors.resolve(entry, `area ${area.id} entry`)),
    docs: area.docs,
    procedures: [],
    tables: [],
    tools: [],
  }))

  const byId = new Map(areas.map((area) => [area.id, area]))
  for (const file of files) {
    const area = byId.get(areaOf(areas, file) ?? "")
    if (area === undefined) continue
    area.files += 1
    if (testFile.test(file)) area.tests += 1
    const source = anchors.read(file)
    if (source !== null) area.lines += source.split("\n").length - (source.endsWith("\n") ? 1 : 0)
  }

  const own = (file: string | undefined, id: string, into: "procedures" | "tables" | "tools") => {
    if (file === undefined) return
    const area = byId.get(areaOf(areas, file) ?? "")
    if (area !== undefined && !area[into].includes(id)) area[into].push(id)
  }
  for (const procedure of owned.api.procedures)
    own(procedure.handler?.file, procedure.id, "procedures")
  for (const table of owned.data.tables) own(table.anchor.file, table.name, "tables")
  for (const tool of owned.agents.tools) {
    own(tool.handler?.file, tool.name, "tools")
    own(tool.anchor.file, tool.name, "tools")
  }
  return areas
}
