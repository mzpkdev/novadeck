import type {
  ProcedureTrace,
  RunnerLens,
  SqlVerb,
  Statement,
  Step,
  StoreMethod,
  Touch,
} from "../src/lens-runner.ts"
import { sourceFiles } from "./files.ts"
import type { LensInput } from "./lens-input.ts"

const storeFile = "application/runner/src/workspaces/store.ts"
const routerFile = "application/runner/src/router.ts"
const runnerDir = "application/runner/src"

const lineAt = (source: string, index: number): number => source.slice(0, index).split("\n").length

// Every string and template literal in `code` that reads as a SQL statement, with its
// offset. Interpolations become `?`; comments are skipped.
export const sqlIn = (code: string): { sql: string; at: number }[] => {
  const found: { sql: string; at: number }[] = []
  const template = (from: number): { text: string; end: number } => {
    let text = ""
    let i = from + 1
    while (i < code.length && code[i] !== "`") {
      if (code[i] === "\\") {
        text += code[i + 1] ?? ""
        i += 2
      } else if (code[i] === "$" && code[i + 1] === "{") {
        let depth = 1
        i += 2
        while (i < code.length && depth > 0) {
          if (code[i] === "{") depth += 1
          else if (code[i] === "}") depth -= 1
          else if (code[i] === "`") i = template(i).end
          i += 1
        }
        text += "?"
      } else text += code[i++]
    }
    return { text, end: i }
  }
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!
    if (ch === "/" && code[i + 1] === "/")
      i = code.indexOf("\n", i) === -1 ? code.length : code.indexOf("\n", i)
    else if (ch === "/" && code[i + 1] === "*") i = code.indexOf("*/", i) + 1
    else if (ch === "`") {
      const { text, end } = template(i)
      if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|REPLACE)\b/i.test(text))
        found.push({ sql: text.replace(/\s+/g, " ").trim(), at: i })
      i = end
    } else if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < code.length && code[j] !== ch && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1
      const text = code.slice(i + 1, j)
      if (/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(text))
        found.push({ sql: text.replace(/\s+/g, " ").trim(), at: i })
      i = j
    }
  }
  return found
}

// The tables a statement touches: its subject by its leading keyword, every other
// `FROM`/`JOIN` as a read.
export const touchesOf = (sql: string, tables: Set<string>): Touch[] => {
  const kind = sql.trim().split(/\s/)[0]!.toLowerCase()
  const subject =
    kind === "insert" || kind === "replace"
      ? /\bINTO\s+(\w+)/i.exec(sql)
      : kind === "update"
        ? /^\s*UPDATE\s+(?:OR\s+\w+\s+)?(\w+)/i.exec(sql)
        : kind === "delete"
          ? /\bDELETE\s+FROM\s+(\w+)/i.exec(sql)
          : null
  const verb: SqlVerb =
    kind === "delete" ? "delete" : kind === "select" || kind === "with" ? "read" : "write"
  const touches: Touch[] = []
  const add = (table: string | undefined, as: SqlVerb): void => {
    if (table && tables.has(table) && !touches.some((t) => t.table === table && t.verb === as))
      touches.push({ table, verb: as })
  }
  add(subject?.[1], verb)
  const rest = subject ? sql.replace(subject[0], " ") : sql
  for (const match of rest.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/gi)) add(match[1], "read")
  return touches
}

const statementKind = (sql: string): Statement["kind"] => {
  const word = sql.trim().split(/\s/)[0]!.toLowerCase()
  return word === "insert" || word === "replace"
    ? "insert"
    : word === "update"
      ? "update"
      : word === "delete"
        ? "delete"
        : "select"
}

type Unit = {
  name: string
  prop: boolean
  file: string
  line: number
  body: string
  offset: number
}

// The class methods (two-space indent) and top-level functions of a file, with bodies.
const unitsIn = (file: string, source: string): Unit[] => {
  const lines = source.split("\n")
  const units: Unit[] = []
  let offset = 0
  const offsets = lines.map((text) => {
    const at = offset
    offset += text.length + 1
    return at
  })
  lines.forEach((text, index) => {
    const method =
      /^ {2}(?:(?:async|private|public|static|protected|get|set)\s+)*\*?(\w+)\s*(?:<[^>]*>)?\(/.exec(
        text,
      )
    const fn = /^(?:export\s+)?(?:async\s+)?function\*?\s+(\w+)/.exec(text)
    const prop = /^( {4,8})(\w+): (?:async )?\(/.exec(text)
    const name = method?.[1] ?? fn?.[1] ?? prop?.[2]
    if (!name || ["if", "for", "while", "switch", "catch", "constructor"].includes(name)) return
    const close = method ? "  }" : prop ? `${prop[1]}},` : "}"
    let end = index
    while (end < lines.length && lines[end] !== close && lines[end] !== close.slice(0, -1)) end += 1
    units.push({
      name,
      prop: Boolean(prop && !method && !fn),
      file,
      line: index + 1,
      body: lines.slice(index, end + 1).join("\n"),
      offset: offsets[index]!,
    })
  })
  // Methods and functions first, so a lookup by name finds them before an object's property.
  return units.toSorted((a, b) => Number(a.prop) - Number(b.prop))
}

type Service = { field: string; type: string; file: string }

const servicesOf = (router: string): Service[] => {
  const imports = new Map(
    [...router.matchAll(/import type \{ (\w+) \} from "\.\/([^"]+)\.js"/g)].map((match) => [
      match[1]!,
      `${runnerDir}/${match[2]}.ts`,
    ]),
  )
  const options = router.slice(router.indexOf("createRouter"))
  return [...options.matchAll(/^\s+(\w+): (\w+)$/gm)].flatMap((match) => {
    const file = imports.get(match[2]!)
    return file ? [{ field: match[1]!, type: match[2]!, file }] : []
  })
}

const stem = (file: string): string => file.split("/").at(-1)!.replace(/\.ts$/, "")

const builtin = new Set([
  "get",
  "set",
  "has",
  "delete",
  "map",
  "filter",
  "push",
  "add",
  "clear",
  "values",
  "keys",
  "find",
  "some",
  "every",
  "forEach",
  "includes",
  "slice",
  "join",
  "then",
  "catch",
  "close",
  "on",
  "off",
  "emit",
  "send",
  "write",
  "read",
  "start",
  "stop",
  "run",
  "all",
  "next",
  "reduce",
])

export const extractRunnerLens = (input: LensInput): RunnerLens => {
  const { repo, anchors } = input
  const tables = input.data.tables.map((table) => table.name)
  const tableSet = new Set(tables)

  // The store: its methods, their statements, and the store methods they call.
  const storeSource = anchors.read(storeFile) ?? ""
  const classAt = storeSource.indexOf("export class WorkspaceStore")
  const storeUnits = unitsIn(storeFile, storeSource.slice(classAt)).map((unit) => ({
    ...unit,
    line: unit.line + lineAt(storeSource, classAt) - 1,
    offset: unit.offset + classAt,
  }))
  const storeNames = new Set(storeUnits.map((unit) => unit.name))
  const methods: StoreMethod[] = storeUnits.map((unit) => {
    const statements = sqlIn(unit.body).map(({ sql, at }): Statement => ({
      sql,
      kind: statementKind(sql),
      touches: touchesOf(sql, tableSet),
      anchor: { file: storeFile, line: lineAt(storeSource, unit.offset + at) },
    }))
    const calls = [
      ...new Set([...unit.body.matchAll(/\bthis\.(\w+)\(/g)].map((m) => m[1]!)),
    ].filter((name) => storeNames.has(name) && name !== unit.name)
    const merged = new Map<string, Touch>()
    const weight = new Map<string, number>()
    for (const statement of statements)
      for (const touch of statement.touches) {
        merged.set(`${touch.table}:${touch.verb}`, touch)
        weight.set(touch.table, (weight.get(touch.table) ?? 0) + (touch.verb === "read" ? 1 : 2))
      }
    const home = [...weight].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return {
      name: unit.name,
      anchor: { file: storeFile, line: unit.line },
      statements,
      calls,
      touches: [...merged.values()],
      home,
      usedBy: [],
    }
  })
  const methodByName = new Map(methods.map((method) => [method.name, method]))

  // Every other runner unit, to follow a call from a service one or two hops in.
  const router = anchors.read(routerFile) ?? ""
  const services = servicesOf(router)
  const files = sourceFiles(repo, runnerDir).filter((file) => file !== storeFile)
  const unitsByFile = new Map(files.map((file) => [file, unitsIn(file, anchors.read(file) ?? "")]))
  const unitsNamed = (name: string): Unit[] =>
    [...unitsByFile.values()].flatMap((list) => list.filter((unit) => unit.name === name))

  // Store methods a body calls on whatever it names the store by (`store`, `records`,
  // `this.options.records?`, `this.settings`…): any call of a store method's name, in a
  // file that deals with the store.
  const storeLike = /WorkspaceStore|Records\b|\bstore\b/
  const generic = new Set(["close", "forget", "scrub", "transaction", "constructor"])
  const storeCalls = (body: string, file: string): string[] =>
    file !== routerFile && !storeLike.test(anchors.read(file) ?? "")
      ? []
      : [
          ...new Set(
            [
              ...body.matchAll(
                file === routerFile
                  ? /\bstore\.(\w+)\(/g
                  : /(?<!\bthis|\boptions)[\w)\]]\??\.(\w+)\(/g,
              ),
            ]
              .map((match) => match[1]!)
              .filter((name) => methodByName.has(name) && !generic.has(name)),
          ),
        ]

  const trace = (id: string): ProcedureTrace => {
    const at = router.indexOf(`authorized.${id}.handler(`)
    const start = at === -1 ? router.indexOf(`api.${id}.handler(`) : at
    if (start === -1) return { id, steps: [], reached: [], traced: false }
    const skip = start + id.length + 20
    const next = router.slice(skip).search(/\.handler\(/)
    const body = router.slice(start, next === -1 ? undefined : skip + next)
    const seen = new Set<string>()

    // The steps below `text`, as a flat list in call order. A branch that reaches no
    // store method is dropped, except the first hop, which shows where the trail ends.
    const below = (text: string, depth: number, self: Unit | null, dispatch: boolean): Step[] => {
      const out: Step[] = []
      if (depth > 2) return out
      const found: { unit: Unit; label: string }[] = []
      for (const match of text.matchAll(/(?<![\w$])(this\.)?(?:(\w+)\??\.)?(\w+)\(/g)) {
        const [, viaThis, receiver, name] = match
        if (
          !name ||
          (!dispatch && methodByName.has(name)) ||
          ["if", "for", "while", "switch", "catch"].includes(name)
        )
          continue
        if (dispatch) {
          const service = services.find((each) => each.field === receiver)
          if (!service || viaThis) continue
          const dir = service.file.slice(0, service.file.lastIndexOf("/"))
          const unit = unitsNamed(name)
            .filter((each) => each.file.startsWith(`${dir}/`))
            .toSorted(
              (a, b) =>
                Number(b.file === service.file) - Number(a.file === service.file) ||
                Number(b.file.startsWith(dir)) - Number(a.file.startsWith(dir)),
            )[0]
          if (unit) found.push({ unit, label: `${service.type}.${name}` })
        } else if (viaThis && !receiver && self) {
          const same = unitsByFile.get(self.file)?.find((unit) => unit.name === name)
          if (same && same !== self) found.push({ unit: same, label: `${stem(same.file)}.${name}` })
        } else if (viaThis && receiver && !builtin.has(name)) {
          const only = unitsNamed(name)
          if (only.length === 1 && only[0] !== self)
            found.push({ unit: only[0]!, label: `${stem(only[0]!.file)}.${name}` })
        }
      }
      for (const { unit, label } of found) {
        const key = `${unit.file}:${unit.name}`
        if (seen.has(key)) continue
        seen.add(key)
        const inner = below(unit.body, depth + 1, unit, false)
        const store = storeCalls(unit.body, unit.file)
        if (store.length > 0 || inner.length > 0 || (depth === 0 && dispatch))
          out.push(
            { label, anchor: { file: unit.file, line: unit.line }, depth: depth + 1, store },
            ...inner,
          )
      }
      return out
    }

    const steps: Step[] = [
      {
        label: `router: ${id}`,
        anchor: { file: routerFile, line: lineAt(router, start) },
        depth: 0,
        store: storeCalls(body, routerFile),
      },
      ...below(body, 0, null, true),
    ]
    const reached: ProcedureTrace["reached"] = []
    const have = new Set<string>()
    const reach = (method: string, from: string | null, depth: number): void => {
      if (have.has(method) || depth > 2) return
      have.add(method)
      reached.push({ method, from })
      for (const call of methodByName.get(method)?.calls ?? []) reach(call, method, depth + 1)
    }
    for (const step of steps) for (const method of step.store) reach(method, null, 0)
    const traced = reached.some((r) => methodByName.get(r.method)!.statements.length > 0)
    return { id, steps, reached, traced }
  }

  const procedures = input.api.procedures.map((procedure) => trace(procedure.id))
  for (const procedure of procedures)
    for (const { method } of procedure.reached) methodByName.get(method)!.usedBy.push(procedure.id)

  // Tables ordered by how much SQL touches them, so the hot ones lead.
  const heat = new Map(tables.map((table) => [table, 0]))
  for (const method of methods)
    for (const statement of method.statements)
      for (const touch of statement.touches) heat.set(touch.table, (heat.get(touch.table) ?? 0) + 1)

  return {
    tables: tables.toSorted((a, b) => heat.get(b)! - heat.get(a)!),
    methods: methods.filter((method) => method.statements.length > 0),
    procedures,
    statements: methods.reduce((sum, method) => sum + method.statements.length, 0),
  }
}
