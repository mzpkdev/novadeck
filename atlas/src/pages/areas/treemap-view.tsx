import { useMemo, useState } from "react"
import { useNavigate } from "react-router"

import { atlas, groupBy } from "../../atlas-data.ts"
import type { Area } from "../../atlas.ts"
import { squarify } from "../../components/treemap.ts"
import { compact, hue, Token, useSize } from "../../components/viz.tsx"
import { areaPath } from "../../links.ts"

// Groups stand apart on the workspace as windows; areas tile each window's body.
const SPACE = 6
const PAD = 4
const HEAD = 26
// A rect smaller than this on a side is not a target anyone can hit.
const MIN = 6

// The whole codebase: a window per top-level token (`runner`, `ui`, `harness`…), a rect per
// area inside it, area = lines.
// Hatching along the bottom of an area is its share of test files.
export const TreemapView = () => {
  const { ref, w, h } = useSize<HTMLDivElement>()
  const navigate = useNavigate()
  const [listing, setListing] = useState(false)
  const [hover, setHover] = useState<{ area: Area; x: number; y: number } | null>(null)

  const groups = useMemo(() => {
    const nodes = groupBy(atlas.areas, (a) => a.id.split("/")[0] ?? a.id).map(([top, areas]) => ({
      top,
      areas,
      lines: areas.reduce((sum, a) => sum + a.lines, 0),
    }))
    return squarify(
      nodes.map((g) => ({ item: g, value: g.lines })),
      0,
      0,
      w,
      h,
    )
      .map((g) => ({
        ...g,
        x: g.x + SPACE,
        y: g.y + SPACE,
        w: g.w - SPACE * 2,
        h: g.h - SPACE * 2,
      }))
      .map((g) => ({
        ...g,
        cells: squarify(
          g.item.areas.map((a) => ({ item: a, value: a.lines })),
          g.x + PAD,
          g.y + HEAD + PAD,
          g.w - PAD * 2,
          g.h - HEAD - PAD * 2,
        ),
      }))
  }, [w, h])

  // Areas the layout could not give a usable rect (no lines, or a window too small to tile)
  // are listed, never dropped.
  const drawn = new Set(
    groups.flatMap((g) => g.cells.filter((c) => c.w >= MIN && c.h >= MIN).map((c) => c.item.id)),
  )
  const hidden = w > 0 ? atlas.areas.filter((a) => !drawn.has(a.id)) : []

  return (
    <div ref={ref} className="relative h-full w-full">
      {groups.map((g) => (
        <div
          key={g.item.top}
          className="pane absolute"
          style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
        >
          <div
            className="pane-heading quiet flex items-center gap-1.5 px-2 text-[12px] font-medium"
            style={{ height: HEAD }}
          >
            {g.w > 40 ? <span className="truncate font-mono">{g.item.top}</span> : null}
            {g.w > 130 ? (
              <span className="ml-auto font-mono text-[11px] font-normal text-muted">
                {compact(g.item.lines)}
              </span>
            ) : null}
          </div>
        </div>
      ))}
      {groups.flatMap((g) =>
        g.cells.map(({ item: a, x, y, w: cw, h: ch }) => {
          if (cw < MIN || ch < MIN) return null
          const share = a.files > 0 ? Math.min(1, a.tests / a.files) : 0
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate(areaPath(a.id))}
              onMouseMove={(e) => setHover({ area: a, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              className="absolute cursor-pointer overflow-hidden border border-[var(--color-paper)] text-left hover:border-accent hover:outline hover:outline-1 hover:outline-accent"
              style={{ left: x, top: y, width: cw, height: ch, background: hue(a.node).fill }}
            >
              {share > 0 ? (
                <span
                  className="hatch absolute inset-x-0 bottom-0"
                  style={{ height: `${share * 100}%`, opacity: 0.4 }}
                />
              ) : null}
              {cw > 56 && ch > 22 ? (
                <span className="relative block truncate px-1.5 pt-1 text-[11px] leading-3.5">
                  <Token id={a.id} within={g.item.top} />
                  {cw > 90 && ch > 36 ? (
                    <span className="block font-mono text-[10px] text-muted">
                      {compact(a.lines)}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          )
        }),
      )}
      {hidden.length > 0 ? (
        <div className="absolute right-3 bottom-3 z-10 flex flex-col items-end gap-1">
          {listing ? (
            <ul className="pane floating m-0 max-h-60 list-none overflow-auto p-1.5 text-[12px]">
              {hidden.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => navigate(areaPath(a.id))}
                    className="item flex w-full items-center gap-3 px-2 py-0.5 text-left"
                  >
                    <Token id={a.id} />
                    <span className="ml-auto font-mono text-[11px] text-muted">
                      {compact(a.lines)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            aria-expanded={listing}
            onClick={() => setListing(!listing)}
            className="item pane floating cursor-pointer px-2 py-1 text-[12px] text-muted"
          >
            +{hidden.length} too small to draw
          </button>
        </div>
      ) : null}
      {hover ? (
        <div
          className="pane floating pointer-events-none fixed z-20 px-2 py-1 text-[12px]"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <Token id={hover.area.id} className="font-medium" />
          {hover.area.purpose ? (
            <div className="max-w-80 text-[12px] text-muted">{hover.area.purpose}</div>
          ) : null}
          <div className="font-mono text-[11px] text-muted">
            {hover.area.lines.toLocaleString()} lines · {hover.area.files} files ·{" "}
            {hover.area.tests} tests
          </div>
        </div>
      ) : null}
    </div>
  )
}
