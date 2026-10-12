import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { atlas, groupBy } from "../atlas-data.ts"
import type { Procedure } from "../atlas.ts"
import { AnchorLink, AnchorList } from "../components/anchor.tsx"
import { SchemaView } from "../components/schema.tsx"
import { Badge, Card, Empty, Mono, Page, Section, Table, Td, Th } from "../components/ui.tsx"
import { useFocus } from "../components/use-focus.ts"
import { areaPath } from "../links.ts"

const ProcedureRow = ({ procedure: p }: { procedure: Procedure }) => {
  const [override, setOverride] = useState<boolean | null>(null)
  const { ref, focused } = useFocus(p.id)
  const open = override ?? focused
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div
      ref={ref}
      id={p.id}
      data-focused={focused}
      className="border-b border-line/60 last:border-b-0"
    >
      <div className="flex items-start gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOverride(!open)}
          aria-label={open ? "Collapse" : "Expand"}
          className="mt-0.5 cursor-pointer text-muted hover:text-fg"
        >
          <Chevron size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="font-medium">{p.id}</Mono>
            <Badge accent={p.kind === "stream"}>{p.kind}</Badge>
            {p.area ? (
              <Link to={areaPath(p.area)} className="text-[12px]">
                {p.area}
              </Link>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] text-muted">
            <span>
              contract <AnchorLink anchor={p.anchor} />
            </span>
            <span>
              handler{" "}
              {p.handler ? <AnchorLink anchor={p.handler} /> : <span className="italic">none</span>}
            </span>
            <span className="inline-flex flex-wrap gap-x-2">
              callers{" "}
              {p.callers.length ? (
                <AnchorList anchors={p.callers} />
              ) : (
                <span className="italic">none</span>
              )}
            </span>
          </div>
        </div>
      </div>
      {open ? (
        <div className="grid gap-4 border-t border-line/60 bg-bg px-8 py-2 md:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Input</div>
            <SchemaView schema={p.input} />
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Output</div>
            <SchemaView schema={p.output} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const ApiPage = () => {
  const [filter, setFilter] = useState("")
  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const visible = atlas.api.procedures.filter((p) => {
    const haystack = `${p.id} ${p.kind} ${p.area ?? ""}`.toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
  const groups = groupBy(visible, (p) => p.namespace)
  return (
    <Page
      title="API"
      subtitle="Every procedure in the runner contract, who handles it and who calls it."
    >
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by id, kind or area"
        className="w-full max-w-sm rounded-sm border border-line bg-panel px-2 py-1 outline-none focus:border-accent"
      />
      {groups.length === 0 ? (
        <Empty>
          {atlas.api.procedures.length ? "No procedures match." : "No procedures extracted yet."}
        </Empty>
      ) : null}
      {groups.map(([namespace, procedures]) => (
        <Section key={namespace} title={namespace} count={procedures.length}>
          <Card>
            {procedures.map((p) => (
              <ProcedureRow key={p.id} procedure={p} />
            ))}
          </Card>
        </Section>
      ))}
      <Section title="Errors" count={atlas.api.errors.length}>
        {atlas.api.errors.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {atlas.api.errors.map((e) => (
                <tr key={e.code}>
                  <Td>
                    <Mono>{e.code}</Mono>
                  </Td>
                  <Td>
                    <Mono>{e.status}</Mono>
                  </Td>
                  <Td className="text-muted">{e.note ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </Page>
  )
}
