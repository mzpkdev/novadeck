import { useEffect, useRef, useState, type ReactNode } from "react"

import { atlas, nodeById } from "../atlas-data.ts"
import type { AreaLink } from "../atlas.ts"

// Muted category hues per runtime node; the tokens live at the end of index.css.
export const hue = (node: string) => ({
  fill: `var(--hue-${nodeById.has(node) ? node : "github"})`,
  ink: `var(--hue-${nodeById.has(node) ? node : "github"}-ink)`,
})

export const compact = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

export const links: AreaLink[] = (atlas as { links?: AreaLink[] }).links ?? []

export const kindDash: Record<AreaLink["kind"], string | undefined> = {
  import: undefined,
  call: "7 4",
  data: "1.5 4",
}

export const strokeFor = (weight: number) => 1 + Math.min(5, Math.log2(weight + 1) * 0.9)

export const useSize = <T extends HTMLElement>() => {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, ...size }
}

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { id: T; label: string; icon?: ReactNode }[]
  onChange: (id: T) => void
}) => (
  <div className="segmented gap-0.5">
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        aria-pressed={o.id === value}
        onClick={() => onChange(o.id)}
        className="segment h-7 gap-1.5 px-2.5 text-control"
      >
        {o.icon}
        {o.label}
      </button>
    ))}
  </div>
)

export const Dot = ({ node, size = 8 }: { node: string; size?: number }) => (
  <span
    className="inline-block shrink-0 rounded-full"
    style={{ width: size, height: size, background: hue(node).ink }}
  />
)

// A line sample for a link kind, for legends.
export const KindSample = ({ kind }: { kind: AreaLink["kind"] }) => (
  <svg width="26" height="8" aria-hidden>
    <line
      x1="1"
      x2="25"
      y1="4"
      y2="4"
      stroke="var(--color-line-strong)"
      strokeWidth="2"
      strokeDasharray={kindDash[kind]}
      strokeLinecap="round"
    />
  </svg>
)
