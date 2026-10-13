import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import type { Atlas } from "../src/atlas.ts"
import {
  renderAction,
  renderAgents,
  renderApi,
  renderArea,
  renderData,
  renderFlow,
  renderFlows,
  renderIndex,
  renderProcedure,
  renderState,
  renderTable,
  renderTool,
} from "./render.ts"

// `pnpm -s atlas:brief [subject]`: a short Markdown brief of a part of the code, read
// fresh from the source on every call. See atlas/AGENTS.md.

const repo = resolve(import.meta.dirname, "../..")
const protocol = join(repo, "application/protocol")

const newest = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
    const path = join(dir, entry.name)
    return Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs)
  }, 0)

// The extractor reads the contract from the built protocol package; build it when it is
// missing or older than its source.
const ensureProtocol = () => {
  const built = join(protocol, "dist/index.js")
  if (existsSync(built) && statSync(built).mtimeMs >= newest(join(protocol, "src"))) return
  process.stderr.write("atlas: building @novadeck/protocol…\n")
  execFileSync("pnpm", ["--filter", "@novadeck/protocol", "build"], {
    cwd: repo,
    stdio: ["ignore", "ignore", "inherit"],
  })
}

type Subject = { kind: string; name: string; render: () => string }

const subjects = (atlas: Atlas): Subject[] => [
  ...[
    ["api", renderApi],
    ["data", renderData],
    ["state", renderState],
    ["flows", renderFlows],
    ["harnesses", renderAgents],
  ].map(([name, render]) => ({
    kind: "overview",
    name: name as string,
    render: () => (render as (a: Atlas) => string)(atlas),
  })),
  ...atlas.areas.map((area) => ({
    kind: "area",
    name: area.id,
    render: () => renderArea(atlas, area),
  })),
  ...atlas.api.procedures.map((p) => ({
    kind: "procedure",
    name: p.id,
    render: () => renderProcedure(atlas, p),
  })),
  ...atlas.ui.actions.map((a) => ({
    kind: "action",
    name: a.type,
    render: () => renderAction(atlas, a.type),
  })),
  ...atlas.data.tables.map((t) => ({
    kind: "table",
    name: t.name,
    render: () => renderTable(atlas, t),
  })),
  ...atlas.agents.tools.map((t) => ({
    kind: "tool",
    name: t.name,
    render: () => renderTool(atlas, t.name),
  })),
  ...atlas.flows.map((f) => ({ kind: "flow", name: f.id, render: () => renderFlow(atlas, f.id) })),
]

export const brief = (
  atlas: Atlas,
  query: string | undefined,
): { text: string; found: boolean } => {
  if (!query) return { text: renderIndex(atlas), found: true }
  const all = subjects(atlas)
  const colon = query.indexOf(":")
  const kind =
    colon > 0 && all.some((s) => s.kind === query.slice(0, colon)) ? query.slice(0, colon) : null
  const name = kind ? query.slice(colon + 1) : query
  const exact = all.filter((s) => s.name === name && (kind === null || s.kind === kind))
  if (exact.length === 1) return { text: exact[0]!.render(), found: true }
  if (exact.length > 1)
    return {
      text: `"${name}" is ambiguous; ask for one of: ${exact.map((s) => `${s.kind}:${s.name}`).join(", ")}`,
      found: false,
    }
  const near = all
    .filter(
      (s) =>
        (kind === null || s.kind === kind) && s.name.toLowerCase().includes(name.toLowerCase()),
    )
    .slice(0, 15)
  return {
    text:
      near.length > 0
        ? `No subject "${query}". Close: ${near.map((s) => `${s.kind}:${s.name}`).join(", ")}`
        : `No subject "${query}". Run with no subject for the index.`,
    found: false,
  }
}

if (import.meta.main) {
  ensureProtocol()
  const { build } = await import("../extract/main.ts")
  const { text, found } = brief(await build(), process.argv[2])
  process.stdout.write(`${text}\n`)
  if (!found) process.exitCode = 1
}
