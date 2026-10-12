import { z } from "zod"

import type { Api, ApiError, Anchor, JsonSchema, Procedure } from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"
import { sourceFiles } from "./files.ts"

const contractFile = "application/protocol/src/contract.ts"
const routerFile = "application/runner/src/router.ts"

type Definition = { inputSchema?: unknown; outputSchema?: unknown }

const isProcedure = (value: unknown): value is { "~orpc": Definition } =>
  typeof value === "object" && value !== null && "~orpc" in value

const walk = (node: object, path: string[] = []): { path: string[]; definition: Definition }[] =>
  Object.entries(node).flatMap(([key, value]) =>
    isProcedure(value)
      ? [{ path: [...path, key], definition: value["~orpc"] }]
      : typeof value === "object" && value !== null
        ? walk(value, [...path, key])
        : [],
  )

const eventDetails = Object.getOwnPropertySymbols

// oRPC's event iterator schema carries the yielded schema under a symbol.
const streamed = (schema: unknown): { yields?: unknown } | null => {
  const standard = (schema as { "~standard"?: Record<symbol, unknown> } | undefined)?.["~standard"]
  if (!standard || (standard as { vendor?: string }).vendor !== "orpc") return null
  const symbol = eventDetails(standard).find((each) => each.description?.includes("EVENT_ITERATOR"))
  return symbol ? (standard[symbol] as { yields?: unknown }) : { yields: undefined }
}

const toJson = (schema: unknown): JsonSchema | null => {
  if (schema === undefined || schema === null) return null
  try {
    return z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any", io: "input" })
  } catch {
    return null
  }
}

// `terminals.create` → the line in the router that implements it, and the call it makes.
type Service = { name: string; file: string }

const services = (router: string): Service[] => {
  const imports = new Map(
    [...router.matchAll(/import type \{ (\w+) \} from "\.\/([^"]+)\.js"/g)].map((match) => [
      match[1]!,
      `application/runner/src/${match[2]}.ts`,
    ]),
  )
  const options = router.slice(router.indexOf("createRouter"))
  return [...options.matchAll(/^\s+(\w+): (\w+)$/gm)].flatMap((match) => {
    const file = imports.get(match[2]!)
    return file ? [{ name: match[1]!, file }] : []
  })
}

const definitionOf = (
  repo: string,
  anchors: Anchors,
  runnerFiles: string[],
  service: Service,
  method: string,
): Anchor | null => {
  const dir = service.file.slice(0, service.file.lastIndexOf("/"))
  const pattern = new RegExp(`^\\s*(?:(?:async|get|static)\\s+)*\\*?${method}\\s*(?:[(<:=])`, "m")
  const siblings = runnerFiles
    .filter((file) => file.startsWith(`${dir}/`))
    .toSorted((a, b) => Number(/manager|service/.test(b)) - Number(/manager|service/.test(a)))
  const candidates = [service.file, ...siblings]
  for (const file of new Set(candidates)) {
    const source = anchors.read(file)
    const match = source === null ? null : pattern.exec(source)
    if (source !== null && match) {
      return {
        file,
        line: source.slice(0, match.index).split("\n").length + (match[0].startsWith("\n") ? 1 : 0),
      }
    }
  }
  void repo
  return null
}

const handlerOf = (
  repo: string,
  anchors: Anchors,
  runnerFiles: string[],
  router: string,
  known: Service[],
  id: string,
): Anchor | null => {
  const start = router.indexOf(`authorized.${id}.handler(`)
  const at = start === -1 ? router.indexOf(`api.${id}.handler(`) : start
  if (at === -1) return null
  const line = router.slice(0, at).split("\n").length
  const skip = at + id.length + 20
  const next = router.slice(skip).search(/\.handler\(/)
  const body = router.slice(at, next === -1 ? undefined : skip + next)
  const rank = (call: RegExpMatchArray): number =>
    (call[2] === id.split(".").at(-1) ? 0 : 2) + (call[1] === "store" ? 1 : 0)
  const calls = [...body.matchAll(/\b(\w+)\.(\w+)\(/g)].toSorted((a, b) => rank(a) - rank(b))
  for (const call of calls) {
    const service = known.find((each) => each.name === call[1])
    if (!service) continue
    const found = definitionOf(repo, anchors, runnerFiles, service, call[2]!)
    if (found) return found
  }
  return { file: routerFile, line }
}

const callersOf = (anchors: Anchors, uiFiles: string[], id: string): Anchor[] => {
  const pattern = new RegExp(`\\.${id.replace(".", "\\.")}\\(`)
  return uiFiles.flatMap((file) => {
    const lines = anchors.read(file)?.split("\n") ?? []
    const index = lines.findIndex((text) => pattern.test(text))
    return index === -1 ? [] : [{ file, line: index + 1 }]
  })
}

const extractErrors = (anchors: Anchors, source: string): ApiError[] => {
  const body = source.slice(
    source.indexOf("export const errors"),
    source.indexOf("const procedure ="),
  )
  const found: ApiError[] = []
  let note: string[] = []
  for (const text of body.split("\n").map((each) => each.trim())) {
    if (text.startsWith("//")) note.push(text.replace(/^\/\/\s?/, ""))
    else {
      const match = /^([A-Z_]+): \{ status: (\d+)/.exec(text)
      if (match)
        found.push({ code: match[1]!, status: Number(match[2]), note: note.join(" ") || null })
      note = []
    }
  }
  void anchors
  return found
}

// Every procedure in the protocol contract, with its schemas, handler and callers.
export const extractApi = async (repo: string, anchors: Anchors): Promise<Api> => {
  const { contract } = await import("@novadeck/protocol")
  const source = anchors.read(contractFile) ?? ""
  const router = anchors.read(routerFile) ?? ""
  const known = services(router)
  const runnerFiles = sourceFiles(repo, "application/runner/src")
  // The protocol's own client calls some procedures (write, resize, ack) for the UI.
  const callerFiles = [
    ...sourceFiles(repo, "application/ui/src"),
    ...sourceFiles(repo, "application/protocol/src").filter((file) => file !== contractFile),
  ]

  const procedures = walk(contract).map(({ path, definition }): Procedure => {
    const id = path.join(".")
    const name = path[path.length - 1]!
    const stream = streamed(definition.outputSchema)
    return {
      id,
      namespace: path.slice(0, -1).join("."),
      name,
      kind: stream ? "stream" : "call",
      input: toJson(definition.inputSchema),
      output: toJson(stream ? stream.yields : definition.outputSchema),
      anchor: { file: contractFile, line: findProcedureLine(source, path) },
      handler: handlerOf(repo, anchors, runnerFiles, router, known, id),
      callers: callersOf(anchors, callerFiles, id),
      area: null,
    }
  })

  return { procedures, errors: extractErrors(anchors, source) }
}

// The `name:` line inside its namespace's block, not an earlier procedure of the same name.
const findProcedureLine = (source: string, path: string[]): number | null => {
  const from =
    path.length > 1 ? source.indexOf(`  ${path[0]}: {`, source.indexOf("export const contract")) : 0
  const index = source.indexOf(`    ${path[path.length - 1]}: `, Math.max(from, 0))
  return index === -1 ? null : source.slice(0, index).split("\n").length
}
