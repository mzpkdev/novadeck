import {
  Bot,
  Cable,
  Database,
  Layers,
  Map as MapIcon,
  Search as SearchIcon,
  TriangleAlert,
  Workflow,
} from "lucide-react"
import { useEffect, useState } from "react"
import { NavLink, Outlet } from "react-router"

import { atlas } from "../atlas-data.ts"
import { Search } from "./search.tsx"

const nav = [
  { to: "/", label: "Map", icon: MapIcon },
  { to: "/areas", label: "Areas", icon: Layers },
  { to: "/api", label: "API", icon: Cable },
  { to: "/data", label: "Data", icon: Database },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/flows", label: "Flows", icon: Workflow },
]

const Banner = () => {
  if (atlas.broken.length === 0) return null
  return (
    <div className="shrink-0 border-b border-warn bg-[var(--color-warning)] px-4 py-2 text-[12px] text-warn">
      <div className="flex items-center gap-2 font-medium">
        <TriangleAlert size={14} />
        {atlas.broken.length} curated anchor{atlas.broken.length === 1 ? "" : "s"} no longer resolve
      </div>
      <ul className="mt-1 max-h-24 overflow-auto font-mono">
        {atlas.broken.map((b) => (
          <li key={`${b.where}:${b.file}:${b.text}`}>
            {b.where}: {b.file} / {b.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export const Layout = () => {
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearching((s) => !s)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex h-full">
      <nav className="region-sidebar flex w-48 shrink-0 flex-col border-r">
        <div className="px-4 py-3 text-[13px] font-semibold tracking-wide">Novadeck Atlas</div>
        <button
          type="button"
          onClick={() => setSearching(true)}
          className="mx-3 mb-3 flex cursor-pointer items-center gap-2 rounded-sm border border-line px-2 py-1 text-left text-[12px] text-muted hover:text-fg"
        >
          <SearchIcon size={13} />
          Search
          <kbd className="ml-auto font-mono text-[10px]">Ctrl K</kbd>
        </button>
        <ul className="flex-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-1.5 text-[13px] no-underline ${
                    isActive ? "bg-raised text-fg" : "text-muted hover:text-fg"
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-3 font-mono text-[11px] leading-5 text-muted">
          <div>
            <a href={`${atlas.repository}/commit/${atlas.commit}`} target="_blank" rel="noreferrer">
              {atlas.commit.slice(0, 7)}
            </a>
          </div>
          <div title={atlas.generatedAt}>{atlas.generatedAt.replace("T", " ").slice(0, 16)}</div>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <Banner />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Search open={searching} onClose={() => setSearching(false)} />
    </div>
  )
}
