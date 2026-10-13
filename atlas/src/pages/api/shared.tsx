import { X } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router"

import { areaById, atlas } from "../../atlas-data.ts"
import { areaPath } from "../../links.ts"

const toRegex = (glob: string) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "@@")
      .replace(/\*/g, "[^/]*")
      .replace(/@@/g, ".*")}$`,
  )

const matchers = atlas.areas.flatMap((a) =>
  a.globs.map((g) => ({ id: a.id, glob: g, re: toRegex(g) })),
)

// The area a file belongs to, by the most specific glob that matches it.
export const areaOfFile = (file: string): string | null => {
  let best: { id: string; glob: string } | null = null
  for (const m of matchers)
    if (m.re.test(file) && (!best || m.glob.length > best.glob.length)) best = m
  return best?.id ?? null
}

export const groupOfArea = (id: string) =>
  id.startsWith("ui-")
    ? "ui"
    : id.startsWith("runner-")
      ? "runner"
      : id === "protocol"
        ? "protocol"
        : id.startsWith("host-")
          ? "host"
          : "other"

export const groupColor = (id: string) => `var(--g-${groupOfArea(id)})`

export const SidePanel = ({
  title,
  onClose,
  children,
  className = "",
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  className?: string
}) => (
  <aside
    className={`flex min-h-0 w-80 shrink-0 flex-col border-l border-[var(--window-border-color)] bg-panel ${className}`}
  >
    <div className="pane-heading flex h-12 shrink-0 items-center gap-2 px-3">
      <div className="min-w-0 flex-1 truncate font-mono text-body font-medium">{title}</div>
      <button type="button" onClick={onClose} aria-label="Close" className="icon-button small">
        <X size={12} />
      </button>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">{children}</div>
  </aside>
)

export const Label = ({ children }: { children: ReactNode }) => (
  <div className="section-label mb-1.5">{children}</div>
)

export const AreaChip = ({ id }: { id: string | null }) =>
  id ? (
    <Link
      to={areaPath(id)}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-line px-1.5 text-[11px] leading-5 text-fg no-underline hover:border-accent"
    >
      <span className="size-1.5 rounded-full" style={{ background: groupColor(id) }} />
      {areaById.get(id)?.title ?? id}
    </Link>
  ) : null
