import { ChevronDown, ChevronRight, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useLocation, useNavigate } from "react-router"

import { areaById, atlas, groupBy, procedureById } from "../atlas-data.ts"
import type { Procedure } from "../atlas.ts"
import { AnchorLink } from "../components/anchor.tsx"
import { CodePane } from "./api/code.tsx"
import { isEmpty } from "./api/model.ts"
import { ParamsTable } from "./api/params.tsx"
import { AreaChip } from "./api/shared.tsx"

const KindBadge = ({ kind, large = false }: { kind: Procedure["kind"]; large?: boolean }) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center rounded-sm font-mono font-semibold uppercase tracking-wide ${
      large ? "h-5 px-2 text-[10.5px]" : "h-4 w-[44px] text-[9px]"
    } ${
      kind === "call"
        ? "border border-[var(--color-line-strong)] text-muted"
        : "border border-transparent bg-[var(--color-line-strong)] text-[var(--color-paper)]"
    }`}
  >
    {kind}
  </span>
)

const NavRow = ({
  p,
  selected,
  onSelect,
}: {
  p: Procedure
  selected: boolean
  onSelect: (id: string) => void
}) => {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" })
  }, [selected])
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(p.id)}
      className={`flex w-full cursor-pointer items-center gap-2 border-l-2 py-[5px] pl-5 pr-3 text-left ${
        selected
          ? "border-accent bg-raised text-accent"
          : "border-transparent hover:bg-raised hover:text-accent"
      }`}
    >
      <KindBadge kind={p.kind} />
      <span className="min-w-0 truncate font-mono text-[12.5px]">{p.name}</span>
    </button>
  )
}

const ErrorCodes = () => {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-fg"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        All error codes
        <span className="ml-auto font-mono font-normal">{atlas.api.errors.length}</span>
      </button>
      {open ? (
        <ul className="pb-2">
          {atlas.api.errors.map((e) => (
            <li
              key={e.code}
              title={e.note ?? undefined}
              className="flex items-baseline justify-between gap-2 px-3 py-0.5 font-mono text-[11.5px]"
            >
              <span className="truncate">{e.code}</span>
              <span className="text-muted">{e.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const Nav = ({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) => {
  const [filter, setFilter] = useState("")
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = terms.length > 0
  const groups = useMemo(() => {
    const matches = (p: Procedure) => {
      const hay =
        `${p.id} ${p.namespace} ${p.area ?? ""} ${areaById.get(p.area ?? "")?.title ?? ""}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    }
    return groupBy(atlas.api.procedures, (p) => p.namespace)
      .map(([ns, list]): [string, Procedure[]] => [ns, list.filter(matches)])
      .filter(([, list]) => list.length)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])
  return (
    <nav className="flex h-full w-[248px] shrink-0 flex-col border-r border-[var(--color-outline)] bg-panel">
      <div className="border-b border-line p-3">
        <label className="relative block">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search procedures"
            className="w-full rounded-sm border border-[var(--color-outline)] bg-raised py-1 pl-7 pr-2 text-[12.5px] outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {groups.map(([ns, list]) => {
          const open = searching || !closed.has(ns)
          return (
            <div key={ns}>
              <button
                type="button"
                onClick={() =>
                  setClosed((prev) => {
                    const next = new Set(prev)
                    if (!next.delete(ns)) next.add(ns)
                    return next
                  })
                }
                className="flex w-full cursor-pointer items-center gap-1 px-3 pb-1 pt-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-fg"
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {ns}
                <span className="ml-auto font-mono font-normal">{list.length}</span>
              </button>
              {open
                ? list.map((p) => (
                    <NavRow key={p.id} p={p} selected={p.id === selected} onSelect={onSelect} />
                  ))
                : null}
            </div>
          )
        })}
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-muted">No matches</div>
        ) : null}
      </div>
      <ErrorCodes />
    </nav>
  )
}

const Section = ({
  title,
  hint,
  children,
}: {
  title: string
  hint?: ReactNode
  children: ReactNode
}) => (
  <section className="mt-7">
    <div className="mb-2 flex items-baseline gap-3 border-b border-line pb-1.5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </div>
    {children}
  </section>
)

const None = ({ children }: { children: ReactNode }) => (
  <div className="rounded-sm border border-dashed border-[var(--color-outline)] px-3 py-2 text-[12.5px] text-muted">
    {children}
  </div>
)

// Codes every procedure behind the router's middleware can get, found as the ones most
// procedures list.
const routerCodes = new Set(
  (() => {
    const counts = new Map<string, number>()
    for (const p of atlas.api.procedures)
      for (const code of p.errors) counts.set(code, (counts.get(code) ?? 0) + 1)
    return [...counts].filter(([, n]) => n >= atlas.api.procedures.length / 2).map(([c]) => c)
  })(),
)

const Errors = ({ p }: { p: Procedure }) => {
  const codes = atlas.api.errors.filter((e) => p.errors.includes(e.code))
  return (
    <Section
      title="Errors"
      hint="Raised in the handler and by the router; helpers deeper down may raise others."
    >
      {codes.length === 0 ? (
        <None>No error codes found.</None>
      ) : (
        <div className="overflow-hidden rounded-sm border border-[var(--color-outline)] bg-panel">
          <div className="grid grid-cols-[minmax(0,2.2fr)_48px_60px_minmax(0,1.6fr)] gap-x-3 bg-raised px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
            <span>Code</span>
            <span>Status</span>
            <span>From</span>
            <span>Note</span>
          </div>
          {codes.map((e) => (
            <div
              key={e.code}
              className="grid grid-cols-[minmax(0,2.2fr)_48px_60px_minmax(0,1.6fr)] items-baseline gap-x-3 border-t border-line px-3 py-2"
            >
              <span className="break-all font-mono text-[12.5px] font-medium">{e.code}</span>
              <span className="font-mono text-[12px]">{e.status}</span>
              <span className="font-mono text-[10.5px] text-muted">
                {routerCodes.has(e.code) ? "router" : "handler"}
              </span>
              <span className="text-[12px] leading-[18px] text-muted">{e.note ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

const Reference = ({ p }: { p: Procedure }) => {
  const input = isEmpty(p.input) ? null : p.input
  const output = isEmpty(p.output) ? null : p.output
  const stream = p.kind === "stream"
  return (
    <div className="mx-auto max-w-[760px] px-6 pb-16 pt-6">
      <header>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="break-all font-mono text-[20px] font-semibold leading-7">{p.id}</h1>
          <KindBadge kind={p.kind} large />
          <AreaChip id={p.area} />
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {stream
            ? "oRPC stream on the runner: one request opens it, then the runner yields events over the authenticated runner connection."
            : "oRPC procedure on the runner, called over the authenticated runner connection."}
        </p>
      </header>

      <Section title="Request" hint={`${p.id} input`}>
        {input ? <ParamsTable schema={input} /> : <None>No input.</None>}
      </Section>

      <Section
        title={stream ? "Events" : "Response"}
        hint={stream ? "Yields a sequence of the event schema below." : undefined}
      >
        {output ? (
          <ParamsTable schema={output} />
        ) : (
          <None>{stream ? "No event payload." : "No output (void)."}</None>
        )}
      </Section>

      <Errors p={p} />

      <Section title="Implementation">
        <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12.5px]">
          <dt className="text-muted">Contract</dt>
          <dd>
            <AnchorLink anchor={p.anchor} />
          </dd>
          <dt className="text-muted">Handler</dt>
          <dd>
            {p.handler ? (
              <AnchorLink anchor={p.handler} />
            ) : (
              <span className="text-muted">none</span>
            )}
          </dd>
          <dt className="text-muted">Callers {p.callers.length}</dt>
          <dd className="flex flex-col gap-1">
            {p.callers.map((c) => (
              <AnchorLink key={`${c.file}:${c.line}`} anchor={c} />
            ))}
            {p.callers.length === 0 ? <span className="text-muted">none</span> : null}
          </dd>
        </dl>
      </Section>
    </div>
  )
}

export const ApiPage = () => {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const wanted = decodeURIComponent(hash.slice(1))
  const p = procedureById.get(wanted) ?? atlas.api.procedures[0]
  if (!p) return <div className="p-6 text-muted">No procedures.</div>
  return (
    <div className="flex h-full">
      <Nav selected={p.id} onSelect={(id) => void navigate({ hash: id }, { replace: true })} />
      <div key={p.id} className="min-w-0 flex-1 overflow-auto">
        <Reference p={p} />
      </div>
      <CodePane p={p} />
    </div>
  )
}
