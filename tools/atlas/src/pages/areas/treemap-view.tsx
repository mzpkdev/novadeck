import { useMemo, useState } from "react"
import { useNavigate } from "react-router"

import { atlas, groupBy, nodeTitle } from "../../atlas-data.ts"
import type { Area } from "../../atlas.ts"
import { squarify } from "../../components/treemap.ts"
import { compact, hue, useSize } from "../../components/viz.tsx"
import { areaPath } from "../../links.ts"

const GAP = 3
const HEAD = 16

// The whole codebase: a rect per runtime node, a rect per area inside it, area = lines.
// Hatching along the bottom of an area is its share of test files.
export const TreemapView = () => {
  const { ref, w, h } = useSize<HTMLDivElement>()
  const navigate = useNavigate()
  const [hover, setHover] = useState<{ area: Area; x: number; y: number } | null>(null)

  const groups = useMemo(() => {
    const nodes = groupBy(atlas.areas, (a) => a.node).map(([node, areas]) => ({
      node,
      areas,
      lines: areas.reduce((sum, a) => sum + a.lines, 0),
    }))
    return squarify(
      nodes.map((g) => ({ item: g, value: g.lines })),
      0,
      0,
      w,
      h,
    ).map((g) => ({
      ...g,
      cells: squarify(
        g.item.areas.map((a) => ({ item: a, value: a.lines })),
        g.x + GAP,
        g.y + GAP + HEAD,
        g.w - GAP * 2,
        g.h - GAP * 2 - HEAD,
      ),
    }))
  }, [w, h])

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {groups.map((g) => (
        <div
          key={g.item.node}
          className="absolute rounded-sm border border-[var(--color-outline)] bg-panel"
          style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
        >
          {g.w > 60 ? (
            <div
              className="absolute left-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted"
              style={{ top: 2 }}
            >
              <span className="truncate">{nodeTitle(g.item.node)}</span>
              <span>{compact(g.item.lines)}</span>
            </div>
          ) : null}
        </div>
      ))}
      {groups.flatMap((g) =>
        g.cells.map(({ item: a, x, y, w: cw, h: ch }) => {
          const share = a.files > 0 ? Math.min(1, a.tests / a.files) : 0
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate(areaPath(a.id))}
              onMouseMove={(e) => setHover({ area: a, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              className="absolute cursor-pointer overflow-hidden border border-[var(--color-paper)] text-left hover:border-accent hover:outline hover:outline-1 hover:outline-accent"
              style={{ left: x, top: y, width: cw, height: ch, background: hue(g.item.node).fill }}
            >
              {share > 0 ? (
                <span
                  className="hatch absolute inset-x-0 bottom-0"
                  style={{ height: `${share * 100}%`, opacity: 0.4 }}
                />
              ) : null}
              {cw > 56 && ch > 22 ? (
                <span className="relative block truncate px-1.5 pt-1 text-[11px] leading-3.5">
                  {a.title}
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
      {hover ? (
        <div
          className="pointer-events-none fixed z-20 rounded-sm border border-[var(--color-outline)] bg-panel px-2 py-1 text-[12px] shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium">{hover.area.title}</div>
          <div className="font-mono text-[11px] text-muted">
            {hover.area.lines.toLocaleString()} lines · {hover.area.files} files ·{" "}
            {hover.area.tests} tests
          </div>
        </div>
      ) : null}
    </div>
  )
}
