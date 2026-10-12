import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"

import { atlas } from "../atlas-data.ts"
import { areaPath, flowPath, procedurePath, settingId, tablePath, toolPath } from "../links.ts"
import { Badge } from "./ui.tsx"

type Item = { kind: string; label: string; detail: string; to: string }

const items: Item[] = [
  ...atlas.areas.map((a) => ({ kind: "area", label: a.title, detail: a.id, to: areaPath(a.id) })),
  ...atlas.api.procedures.map((p) => ({
    kind: "procedure",
    label: p.id,
    detail: p.kind,
    to: procedurePath(p.id),
  })),
  ...atlas.data.tables.map((t) => ({
    kind: "table",
    label: t.name,
    detail: `${t.columns.length} columns`,
    to: tablePath(t.name),
  })),
  ...atlas.data.settings.map((s) => ({
    kind: "setting",
    label: `${s.group}.${s.key}`,
    detail: s.type,
    to: `/data#${encodeURIComponent(settingId(s.group, s.key))}`,
  })),
  ...atlas.agents.tools.map((t) => ({
    kind: "tool",
    label: t.name,
    detail: t.description.slice(0, 80),
    to: toolPath(t.name),
  })),
  ...atlas.flows.map((f) => ({ kind: "flow", label: f.title, detail: f.id, to: flowPath(f.id) })),
]

const match = (item: Item, terms: string[]) => {
  const haystack = `${item.kind} ${item.label} ${item.detail}`.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export const Search = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return items.filter((item) => match(item, terms)).slice(0, 50)
  }, [query])

  if (!open) return null

  const go = (item: Item | undefined) => {
    if (!item) return
    onClose()
    setQuery("")
    void navigate(item.to)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/50 pt-24" onMouseDown={onClose}>
      <div
        className="h-fit max-h-[70vh] w-[560px] max-w-[92vw] overflow-hidden rounded-sm border border-line bg-panel shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          placeholder="Jump to area, procedure, table, setting, tool, flow"
          className="w-full border-b border-line bg-transparent px-3 py-2 outline-none"
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose()
            else if (e.key === "ArrowDown") {
              e.preventDefault()
              setIndex(Math.min(index + 1, results.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setIndex(Math.max(index - 1, 0))
            } else if (e.key === "Enter") go(results[index])
          }}
        />
        <ul className="max-h-[56vh] overflow-auto">
          {results.length === 0 ? <li className="px-3 py-2 text-muted">No matches</li> : null}
          {results.map((item, i) => (
            <li key={`${item.kind}:${item.label}:${item.to}`}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(item)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left ${i === index ? "bg-raised" : ""}`}
              >
                <span className="w-20 shrink-0">
                  <Badge>{item.kind}</Badge>
                </span>
                <span className="truncate font-mono text-[12px]">{item.label}</span>
                <span className="ml-auto truncate text-[12px] text-muted">{item.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
