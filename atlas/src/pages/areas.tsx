import { Blocks, Network } from "lucide-react"
import { FileText } from "lucide-react"
import { useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"

import { areaById, atlas, nodeTitle } from "../atlas-data.ts"
import { AnchorIcon, blobUrl } from "../components/anchor.tsx"
import { Empty, Ground, Page } from "../components/ui.tsx"
import { compact, Dot, hue, KindSample, Segmented } from "../components/viz.tsx"
import { nodePath, procedurePath, tablePath, toolPath } from "../links.ts"
import { EgoGraph } from "./areas/ego.tsx"
import { GraphView } from "./areas/graph-view.tsx"
import { TreemapView } from "./areas/treemap-view.tsx"

type View = "treemap" | "graph"

export const AreasPage = () => {
  const [params, setParams] = useSearchParams()
  const view: View = params.get("view") === "graph" ? "graph" : "treemap"
  if (atlas.areas.length === 0) {
    return (
      <Page title="Areas">
        <Empty>No areas extracted yet.</Empty>
      </Page>
    )
  }
  return (
    <Ground
      title="Areas"
      flush
      tools={
        <>
          {view === "treemap" ? (
            <span className="pane floating flex h-9 items-center gap-2 px-3 text-caption text-muted">
              area = lines
              <span className="hatch inline-block h-3 w-5 border border-line" /> tests
            </span>
          ) : null}
          <Segmented
            floating
            value={view}
            onChange={(v) => setParams(v === "graph" ? { view: "graph" } : {})}
            options={[
              { id: "treemap", label: "Size", icon: <Blocks size={13} /> },
              { id: "graph", label: "Links", icon: <Network size={13} /> },
            ]}
          />
        </>
      }
    >
      <div className={view === "treemap" ? "min-h-0 flex-1 px-1.5 pb-1.5" : "min-h-0 flex-1"}>
        {view === "treemap" ? <TreemapView /> : <GraphView />}
      </div>
    </Ground>
  )
}

const Owned = ({
  label,
  ids,
  to,
}: {
  label: string
  ids: string[]
  to: (id: string) => string
}) => {
  const [open, setOpen] = useState(false)
  if (ids.length === 0) return null
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="pane cursor-pointer px-2 py-0.5 text-[12px] hover:border-accent"
        aria-expanded={open}
      >
        <span className="font-mono font-semibold">{ids.length}</span>{" "}
        <span className="text-muted">{label}</span>
      </button>
      {open ? (
        <div className="mt-2 flex max-w-2xl flex-wrap gap-1">
          {ids.map((id) => (
            <Link
              key={id}
              to={to(id)}
              className="rounded-sm border border-[var(--window-border-color)] bg-panel px-1.5 font-mono text-[11px] leading-5 no-underline"
            >
              {id}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const AreaPage = () => {
  const { id = "" } = useParams()
  const area = areaById.get(id)
  if (!area) {
    return (
      <Page title="Unknown area">
        <Link to="/areas">Back to areas</Link>
      </Page>
    )
  }
  const maxLines = Math.max(...atlas.areas.map((a) => a.lines))
  const share = area.files > 0 ? Math.min(1, area.tests / area.files) : 0
  return (
    <Ground
      crumbs={
        <>
          <Link to="/areas" className="text-muted no-underline hover:text-fg">
            Areas
          </Link>
          <span>/</span>
          <Link
            to={nodePath(area.node)}
            className="flex items-center gap-1.5 text-muted no-underline hover:text-fg"
          >
            <Dot node={area.node} />
            {nodeTitle(area.node)}
          </Link>
          <span>/</span>
        </>
      }
      title={area.title}
      tools={
        <span className="pane floating flex h-9 items-center gap-1 px-2">
          {area.entries.map((e) => (
            <AnchorIcon key={`${e.file}:${e.line}`} anchor={e} size={15} />
          ))}
          {area.docs.map((d) => (
            <a
              key={d}
              href={blobUrl(d)}
              target="_blank"
              rel="noreferrer"
              title={d}
              className="icon-button small"
            >
              <FileText size={13} />
            </a>
          ))}
        </span>
      }
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="pane p-4">
          <div className="flex items-center gap-3">
            <div
              className="relative h-3 overflow-hidden rounded-sm bg-raised"
              style={{ width: "min(100%, 28rem)" }}
              title={`${area.lines.toLocaleString()} lines, ${area.files} files, ${area.tests} test files`}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${(area.lines / maxLines) * 100}%`,
                  background: hue(area.node).ink,
                }}
              >
                <div
                  className="hatch absolute inset-y-0 right-0"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-[12px]">{compact(area.lines)}</span>
            <span className="font-mono text-[11px] text-muted">
              {area.files} files · {area.tests} tests
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-[12px] text-muted">{area.purpose}</p>
        </header>
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted">
            <span>depends on</span>
            <span className="flex items-center gap-1">
              <KindSample kind="import" /> import
            </span>
            <span className="flex items-center gap-1">
              <KindSample kind="call" /> call
            </span>
            <span className="flex items-center gap-1">
              <KindSample kind="data" /> data
            </span>
            <span className="ml-auto">used by</span>
          </div>
          <EgoGraph id={area.id} />
        </section>
        <section className="flex flex-wrap items-start gap-2">
          <Owned label="procedures" ids={area.procedures} to={procedurePath} />
          <Owned label="tables" ids={area.tables} to={tablePath} />
          <Owned label="tools" ids={area.tools} to={toolPath} />
        </section>
      </div>
    </Ground>
  )
}
