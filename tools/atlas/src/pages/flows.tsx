import { Link, useParams } from "react-router"

import { atlas } from "../atlas-data.ts"
import { Page } from "../components/ui.tsx"
import { flowPath } from "../links.ts"
import { Sequence } from "./flows/sequence.tsx"
import { Thumb, actorsOf } from "./flows/thumb.tsx"

import "./visual-tokens.css"

export const FlowsPage = () => (
  <div className="p-5">
    <h1 className="mb-4 text-lg font-semibold">Flows</h1>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      {atlas.flows.map((f) => (
        <Link
          key={f.id}
          to={flowPath(f.id)}
          title={f.summary}
          className="group block rounded-sm border border-[var(--color-outline)] bg-panel p-3 text-fg no-underline hover:border-accent hover:text-fg"
        >
          <div className="mb-2 flex h-[150px] items-start overflow-hidden">
            <Thumb flow={f} />
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-line pt-2">
            <span className="text-[13px] font-medium group-hover:text-accent">{f.title}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted">
              {actorsOf(f).length}x{f.steps.length}
            </span>
          </div>
        </Link>
      ))}
    </div>
  </div>
)

export const FlowPage = () => {
  const { id = "" } = useParams()
  const flow = atlas.flows.find((f) => f.id === id)
  if (!flow) {
    return (
      <Page title="Unknown flow">
        <Link to="/flows">Back to flows</Link>
      </Page>
    )
  }
  return (
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Link to="/flows" className="text-[12px]">
          Flows
        </Link>
        <h1 className="text-lg font-semibold">{flow.title}</h1>
        <span className="ml-auto flex flex-wrap gap-x-3 text-[12px]">
          {atlas.flows
            .filter((f) => f.id !== flow.id)
            .map((f) => (
              <Link key={f.id} to={flowPath(f.id)}>
                {f.title}
              </Link>
            ))}
        </span>
      </div>
      <Sequence key={flow.id} flow={flow} />
    </div>
  )
}
