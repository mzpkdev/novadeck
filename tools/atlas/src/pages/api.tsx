import { Circle, Search, Square } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { areaById, atlas, groupBy, procedureById } from "../atlas-data.ts"
import type { Procedure } from "../atlas.ts"
import { AnchorIcon, AnchorLink } from "../components/anchor.tsx"
import { SchemaView } from "../components/schema.tsx"
import { useFocus } from "../components/use-focus.ts"
import { AreaChip, Label, SidePanel, areaOfFile, groupColor } from "./api/shared.tsx"

import "./visual-tokens.css"

const Tile = ({
  procedure: p,
  selected,
  dim,
  onSelect,
}: {
  procedure: Procedure
  selected: boolean
  dim: boolean
  onSelect: (id: string) => void
}) => {
  const { ref, focused } = useFocus<HTMLButtonElement>(p.id)
  useEffect(() => {
    if (focused) onSelect(p.id)
  }, [focused, onSelect, p.id])
  const stream = p.kind === "stream"
  return (
    <button
      ref={ref}
      id={p.id}
      type="button"
      title={`${p.id} (${p.kind})`}
      onClick={() => onSelect(p.id)}
      className={`size-4 cursor-pointer border-[1.5px] p-0 transition-opacity ${stream ? "rounded-full" : "rounded-[2px]"} ${
        selected
          ? "border-accent bg-accent"
          : `border-[var(--color-line-strong)] hover:border-accent ${stream ? "bg-transparent" : "bg-[var(--color-line-strong)]"}`
      } ${dim ? "opacity-20" : ""}`}
    />
  )
}

// Which area calls which namespace, and how often: a dot matrix, dot area = call sites.
const CallMatrix = ({
  namespaces,
  selectedNs,
}: {
  namespaces: string[]
  selectedNs: string | null
}) => {
  const { lines, peak } = useMemo(() => {
    const counts = new Map<string, Map<string, number>>()
    for (const p of atlas.api.procedures)
      for (const c of p.callers) {
        const area = areaOfFile(c.file)
        if (!area) continue
        const row = counts.get(area) ?? new Map<string, number>()
        row.set(p.namespace, (row.get(p.namespace) ?? 0) + 1)
        counts.set(area, row)
      }
    const built = [...counts]
      .map(([area, row]) => ({ area, row, total: [...row.values()].reduce((a, b) => a + b, 0) }))
      .toSorted((a, b) => b.total - a.total)
    const top = Math.max(1, ...built.flatMap((r) => [...r.row.values()]))
    return { lines: built, peak: top }
  }, [])
  const CELL = 30
  return (
    <div className="overflow-auto">
      <div className="inline-block">
        <div className="flex pl-40">
          {namespaces.map((ns) => (
            <div key={ns} className="relative" style={{ width: CELL, height: 64 }}>
              <span
                className={`absolute bottom-1 left-1/2 origin-bottom-left -rotate-60 whitespace-nowrap font-mono text-[11px] ${selectedNs === ns ? "text-accent" : "text-muted"}`}
              >
                {ns}
              </span>
            </div>
          ))}
        </div>
        {lines.map(({ area, row }) => (
          <div key={area} className="flex items-center border-t border-line">
            <div className="flex w-40 shrink-0 items-center gap-1.5 pr-2 text-[12px]">
              <span className="size-1.5 rounded-full" style={{ background: groupColor(area) }} />
              <span className="truncate">{areaById.get(area)?.title ?? area}</span>
            </div>
            {namespaces.map((ns) => {
              const n = row.get(ns) ?? 0
              const d = n ? 5 + 17 * Math.sqrt(n / peak) : 0
              return (
                <div
                  key={ns}
                  className="flex items-center justify-center"
                  style={{ width: CELL, height: 26 }}
                  title={n ? `${areaById.get(area)?.title} calls ${ns}: ${n}` : undefined}
                >
                  {n ? (
                    <span
                      className={`rounded-full ${selectedNs === ns ? "bg-accent" : "bg-[var(--color-line-strong)]"}`}
                      style={{ width: d, height: d }}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

const ProcedurePanel = ({ p, onClose }: { p: Procedure; onClose: () => void }) => {
  const callerAreas = [...new Set(p.callers.map((c) => areaOfFile(c.file)).filter(Boolean))]
  return (
    <SidePanel
      title={
        <>
          {p.id} <span className="ml-1 font-sans text-[11px] font-normal text-muted">{p.kind}</span>
        </>
      }
      onClose={onClose}
      className="w-96"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AreaChip id={p.area} />
        <span className="flex items-center gap-1 text-[11px] text-muted" title="contract">
          contract <AnchorIcon anchor={p.anchor} />
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted" title="handler">
          handler {p.handler ? <AnchorIcon anchor={p.handler} /> : <span>none</span>}
        </span>
      </div>
      <div>
        <Label>Callers {p.callers.length}</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {callerAreas.map((a) => (
            <AreaChip key={a} id={a} />
          ))}
          {p.callers.map((c) => (
            <AnchorIcon key={`${c.file}:${c.line}`} anchor={c} />
          ))}
          {p.callers.length === 0 ? <span className="text-[12px] text-muted">none</span> : null}
        </div>
        {p.handler ? (
          <div className="mt-1 text-[11px]">
            <AnchorLink anchor={p.handler} />
          </div>
        ) : null}
      </div>
      <div>
        <Label>Input</Label>
        <SchemaView schema={p.input} />
      </div>
      <div>
        <Label>Output</Label>
        <SchemaView schema={p.output} />
      </div>
    </SidePanel>
  )
}

export const ApiPage = () => {
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (p: Procedure) => {
    const hay = `${p.id} ${p.kind} ${p.area ?? ""}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  }
  const groups = groupBy(atlas.api.procedures, (p) => p.namespace)
  const sel = selected ? (procedureById.get(selected) ?? null) : null
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-auto p-5">
        <div className="mb-4 flex items-center gap-4">
          <h1 className="text-lg font-semibold">API</h1>
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Square size={11} fill="currentColor" /> call
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Circle size={11} /> stream
          </span>
          <label className="relative ml-auto">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter"
              className="w-36 rounded-sm border border-line bg-panel py-0.5 pl-6 pr-2 text-[12px] outline-none focus:border-accent"
            />
          </label>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {groups.map(([ns, procedures]) => (
            <div
              key={ns}
              className={`rounded-sm border bg-panel p-2.5 ${sel?.namespace === ns ? "border-accent" : "border-[var(--color-outline)]"}`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-mono text-[12px] font-medium">{ns}</span>
                <span className="font-mono text-[10px] text-muted">{procedures.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {procedures.map((p) => (
                  <Tile
                    key={p.id}
                    procedure={p}
                    selected={selected === p.id}
                    dim={terms.length > 0 && !matches(p)}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <h2 className="mb-1 mt-7 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Who calls whom
        </h2>
        <div className="rounded-sm border border-[var(--color-outline)] bg-panel p-3">
          <CallMatrix namespaces={groups.map(([ns]) => ns)} selectedNs={sel?.namespace ?? null} />
        </div>
        {atlas.api.errors.length ? (
          <>
            <h2 className="mb-1 mt-7 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Errors
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {atlas.api.errors.map((e) => (
                <span
                  key={e.code}
                  title={e.note ?? undefined}
                  className="rounded-sm border border-line bg-panel px-1.5 font-mono text-[11px] leading-5"
                >
                  {e.code} <span className="text-muted">{e.status}</span>
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
      {sel ? <ProcedurePanel p={sel} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
