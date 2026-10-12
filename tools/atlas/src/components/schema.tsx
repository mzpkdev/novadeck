import { useState } from "react"

import type { JsonSchema } from "../atlas.ts"

type Schema = Record<string, unknown>

const isSchema = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const list = (value: unknown): Schema[] => (Array.isArray(value) ? value.filter(isSchema) : [])

const resolve = (root: Schema, schema: Schema): Schema => {
  let current = schema
  for (let i = 0; i < 8; i++) {
    const ref = current["$ref"]
    if (typeof ref !== "string" || !ref.startsWith("#/")) return current
    let target: unknown = root
    for (const part of ref.slice(2).split("/")) target = isSchema(target) ? target[part] : undefined
    if (!isSchema(target)) return current
    current = target
  }
  return current
}

const Muted = ({ children }: { children: string }) => <span className="text-muted">{children}</span>

const Type = ({ root, schema, depth }: { root: Schema; schema: Schema; depth: number }) => {
  if (depth > 8) return <Muted>…</Muted>
  const s = resolve(root, schema)
  if ("const" in s) return <span>{JSON.stringify(s["const"])}</span>
  if (Array.isArray(s["enum"]))
    return <span>{s["enum"].map((v) => JSON.stringify(v)).join(" | ")}</span>

  const union = list(s["anyOf"]).length ? list(s["anyOf"]) : list(s["oneOf"])
  if (union.length) {
    return (
      <>
        {union.map((variant, i) => (
          <span key={JSON.stringify(variant)}>
            {i > 0 ? <Muted> | </Muted> : null}
            <Type root={root} schema={variant} depth={depth + 1} />
          </span>
        ))}
      </>
    )
  }
  const all = list(s["allOf"])
  if (all.length) {
    return (
      <>
        {all.map((part, i) => (
          <span key={JSON.stringify(part)}>
            {i > 0 ? <Muted> & </Muted> : null}
            <Type root={root} schema={part} depth={depth + 1} />
          </span>
        ))}
      </>
    )
  }

  const type = Array.isArray(s["type"]) ? s["type"].join(" | ") : s["type"]
  const props = isSchema(s["properties"])
    ? Object.entries(s["properties"]).filter((e): e is [string, Schema] => isSchema(e[1]))
    : []
  if (type === "object" || props.length) {
    if (!props.length) {
      const extra = s["additionalProperties"]
      return isSchema(extra) ? (
        <>
          Record&lt;string, <Type root={root} schema={extra} depth={depth + 1} />
          &gt;
        </>
      ) : (
        <>{"{}"}</>
      )
    }
    const required = new Set(Array.isArray(s["required"]) ? s["required"] : [])
    return (
      <>
        {"{"}
        <div className="pl-4">
          {props.map(([name, prop]) => {
            const description = resolve(root, prop)["description"] ?? prop["description"]
            return (
              <div key={name}>
                {name}
                {required.has(name) ? "" : "?"}:{" "}
                <Type root={root} schema={prop} depth={depth + 1} />
                {typeof description === "string" ? (
                  <span className="text-muted"> {"// " + description}</span>
                ) : null}
              </div>
            )
          })}
        </div>
        {"}"}
      </>
    )
  }
  if (type === "array") {
    const items = s["items"]
    return (
      <>
        {isSchema(items) ? <Type root={root} schema={items} depth={depth + 1} /> : "unknown"}
        {"[]"}
      </>
    )
  }
  const noise = (k: string) =>
    (k === "pattern" && "format" in s) ||
    ((k === "minimum" || k === "maximum") && Math.abs(Number(s[k])) >= Number.MAX_SAFE_INTEGER)
  const extras = ["format", "minimum", "maximum", "minLength", "maxLength", "pattern"]
    .filter((k) => k in s && !noise(k))
    .map((k) => `${k}=${String(s[k])}`)
    .join(", ")
  return (
    <>
      {typeof type === "string" ? type : Object.keys(s).length ? "unknown" : "any"}
      {extras ? <Muted>{` (${extras})`}</Muted> : null}
    </>
  )
}

export const SchemaView = ({ schema }: { schema: JsonSchema | null }) => {
  const [raw, setRaw] = useState(false)
  if (!schema) return <span className="text-muted italic">none</span>
  return (
    <div>
      <div className="whitespace-pre-wrap font-mono text-[12px] leading-5">
        {raw ? JSON.stringify(schema, null, 2) : <Type root={schema} schema={schema} depth={0} />}
      </div>
      <button
        type="button"
        onClick={() => setRaw(!raw)}
        className="mt-1 cursor-pointer text-[11px] text-muted hover:text-fg"
      >
        {raw ? "type view" : "raw JSON"}
      </button>
    </div>
  )
}
