import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { flows } from "../content/flows.ts"
import { runtime } from "../content/runtime.ts"
import type { Area, Atlas, Flow, Runtime } from "../src/atlas.ts"
import { extractAgents } from "./agents.ts"
import { createAnchors, type Anchors } from "./anchors.ts"
import { extractApi } from "./api.ts"
import { areaOf, extractAreas } from "./areas.ts"
import { extractData } from "./data.ts"
import { extractLinks } from "./links.ts"

const repo = resolve(import.meta.dirname, "../..")
const output = resolve(import.meta.dirname, "../src/generated/atlas.json")

const resolveRuntime = (anchors: Anchors, areas: Area[]): Runtime => ({
  nodes: runtime.nodes.map((node) => ({
    ...node,
    areas: areas.filter((area) => area.node === node.id).map((area) => area.id),
    anchor: anchors.resolve(node.anchor, `runtime node ${node.id}`),
  })),
  edges: runtime.edges.map((edge) => ({
    ...edge,
    anchor: anchors.resolve(edge.anchor, `runtime edge ${edge.id}`),
  })),
})

const resolveFlows = (anchors: Anchors): Flow[] =>
  flows.map((flow) => ({
    ...flow,
    steps: flow.steps.map((step, index) => ({
      ...step,
      label: step.label ?? step.text,
      anchor: anchors.resolve(step.anchor, `flow ${flow.id} step ${index + 1}`),
    })),
  }))

export const build = async (): Promise<Atlas> => {
  const anchors = createAnchors(repo)
  const api = await extractApi(repo, anchors)
  const data = extractData(repo, anchors)
  const agents = extractAgents(repo, anchors)
  const areas = extractAreas(repo, anchors, { api, data, agents })
  const owner = (file: string | undefined): string | null =>
    file === undefined ? null : areaOf(areas, file)

  return {
    generatedAt: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
    repository: "https://github.com/novadeck-org/novadeck",
    root: repo,
    runtime: resolveRuntime(anchors, areas),
    areas,
    links: extractLinks(repo, anchors, areas, { api, data }),
    api: {
      ...api,
      procedures: api.procedures.map((procedure) => ({
        ...procedure,
        area: owner(procedure.handler?.file),
      })),
    },
    data: {
      ...data,
      tables: data.tables.map((table) => ({ ...table, area: owner(table.anchor.file) })),
    },
    agents,
    flows: resolveFlows(anchors),
    broken: anchors.broken(),
  }
}

if (import.meta.main) {
  const atlas = await build()
  mkdirSync(join(output, ".."), { recursive: true })
  writeFileSync(output, `${JSON.stringify(atlas, null, 2)}\n`)
  console.log(
    `atlas: ${atlas.areas.length} areas, ${atlas.api.procedures.length} procedures, ` +
      `${atlas.data.tables.length} tables, ${atlas.agents.tools.length} agent tools, ` +
      `${atlas.flows.length} flows`,
  )
  for (const broken of atlas.broken) {
    console.warn(`broken anchor: ${broken.where}: "${broken.text}" not in ${broken.file}`)
  }
  if (process.argv.includes("--strict") && atlas.broken.length > 0) process.exitCode = 1
}
