import {
  Activity,
  Bell,
  ChevronRight,
  CirclePlus,
  Command,
  FolderKanban,
  LayoutDashboard,
  MoreHorizontal,
  Play,
  Search,
  Settings,
  Sparkles,
  Users,
} from "@novadeck/react/icons"
import { useEffect, useState } from "react"

import { readStatus, type ServiceStatus } from "./services/status"

const navigation = [
  { label: "Overview", icon: LayoutDashboard, current: true },
  { label: "Decks", icon: FolderKanban, current: false },
  { label: "Team", icon: Users, current: false },
] as const

const decks = [
  { name: "Product launch", updated: "Edited 12 min ago", slides: 24, accent: "bg-accent" },
  { name: "Quarterly review", updated: "Edited yesterday", slides: 18, accent: "bg-danger" },
  { name: "Research notes", updated: "Edited 4 days ago", slides: 32, accent: "bg-text-500" },
] as const

const statusStyles = {
  connecting: "bg-text-500",
  ready: "bg-accent",
  unavailable: "bg-danger",
} as const satisfies Record<ServiceStatus["status"] | "connecting" | "unavailable", string>

export const App = (): React.JSX.Element => {
  const [status, setStatus] = useState<ServiceStatus["status"] | "connecting" | "unavailable">(
    "connecting",
  )

  useEffect(() => {
    let active = true

    void readStatus().then(
      (result) => {
        if (active) setStatus(result.status)
      },
      () => {
        if (active) setStatus("unavailable")
      },
    )

    return () => {
      active = false
    }
  }, [])

  return (
    <main
      className="novadeck min-h-screen bg-background font-sans text-text-900 antialiased"
      data-theme="dark"
    >
      <div className="grid min-h-screen lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-border-subtle bg-surface px-ds-lg py-ds-xl lg:border-r lg:border-b-0">
          <div className="flex items-center gap-ds-sm px-ds-xs">
            <span className="grid size-9 place-items-center rounded-md bg-accent text-on-accent shadow-level-2">
              <Command aria-hidden="true" className="size-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">NovaDeck</p>
              <p className="text-xs text-text-500">Creative workspace</p>
            </div>
          </div>

          <nav aria-label="Primary" className="mt-8 flex gap-ds-xs overflow-x-auto lg:flex-col">
            {navigation.map(({ label, icon: Icon, current }) => (
              <a
                aria-current={current ? "page" : undefined}
                className={`flex min-w-max items-center gap-ds-sm rounded-md px-ds-sm py-ds-xs text-sm font-medium transition-colors duration-200 ease-standard ${
                  current
                    ? "bg-accent-subtle text-accent"
                    : "text-text-500 hover:bg-surface-subtle hover:text-text-900"
                }`}
                href={`#${label.toLowerCase()}`}
                key={label}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </a>
            ))}
          </nav>

          <div className="mt-auto hidden pt-ds-xl lg:block">
            <button
              className="flex w-full items-center gap-ds-sm rounded-md px-ds-sm py-ds-xs text-left text-sm text-text-500 transition-colors duration-200 ease-standard hover:bg-surface-subtle hover:text-text-900"
              type="button"
            >
              <Settings aria-hidden="true" className="size-4" />
              Settings
            </button>
            <div className="mt-ds-md flex items-center gap-ds-sm border-t border-border-subtle px-ds-xs pt-ds-lg">
              <span className="grid size-8 place-items-center rounded-full bg-surface-muted text-xs font-semibold text-text-700">
                MK
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">Personal workspace</p>
                <p className="truncate text-xs text-text-500">Free plan</p>
              </div>
              <MoreHorizontal aria-hidden="true" className="size-4 text-text-500" />
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex h-16 items-center gap-ds-md border-b border-border-subtle bg-background/90 px-ds-lg backdrop-blur md:px-ds-2xl">
            <label className="relative flex max-w-md flex-1 items-center">
              <span className="sr-only">Search decks</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-ds-sm size-4 text-text-500"
              />
              <input
                className="h-9 w-full rounded-md border border-border-subtle bg-surface px-9 text-sm text-text-900 shadow-level-1 outline-none transition-colors duration-200 ease-standard placeholder:text-text-500 focus:border-accent"
                placeholder="Search your decks"
                type="search"
              />
              <kbd className="pointer-events-none absolute right-ds-xs hidden rounded-2xs border border-border bg-surface-subtle px-ds-xs py-ds-2xs font-mono text-[0.625rem] text-text-500 sm:block">
                ⌘ K
              </kbd>
            </label>
            <button
              aria-label="Notifications"
              className="grid size-9 place-items-center rounded-md border border-border-subtle bg-surface text-text-500 shadow-level-1 transition-colors duration-200 ease-standard hover:border-border hover:text-text-900"
              type="button"
            >
              <Bell aria-hidden="true" className="size-4" />
            </button>
          </header>

          <div className="mx-auto max-w-6xl p-ds-lg md:p-ds-2xl">
            <div className="flex flex-col gap-ds-lg sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="mb-ds-xs flex items-center gap-ds-xs text-xs font-semibold tracking-[var(--tracking-label)] text-accent uppercase">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  Workspace
                </p>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">NovaDeck</h1>
                <p className="mt-ds-xs max-w-xl text-sm leading-6 text-text-500">
                  Shape ideas into focused, expressive presentations.
                </p>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-ds-xs rounded-md bg-accent px-ds-md text-sm font-semibold text-on-accent shadow-level-2 transition duration-200 ease-standard hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-focus"
                type="button"
              >
                <CirclePlus aria-hidden="true" className="size-4" />
                New deck
              </button>
            </div>

            <section className="mt-8" aria-labelledby="recent-heading">
              <div className="mb-ds-md flex items-center justify-between">
                <h2 className="text-sm font-semibold" id="recent-heading">
                  Recent decks
                </h2>
                <a
                  className="flex items-center gap-ds-2xs text-xs font-medium text-accent hover:text-accent-hover"
                  href="#decks"
                >
                  View all
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </a>
              </div>

              <div className="grid gap-ds-md md:grid-cols-3">
                {decks.map((deck, index) => (
                  <article
                    className="group overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-level-1 transition duration-200 ease-standard hover:-translate-y-0.5 hover:border-border hover:shadow-level-3"
                    key={deck.name}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-surface-muted p-ds-lg">
                      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_30%,var(--color__surface-subtle))] opacity-70" />
                      <div className="relative flex h-full flex-col rounded-sm border border-border bg-background/75 p-ds-sm shadow-level-2">
                        <div className={`mb-auto h-1 w-8 rounded-full ${deck.accent}`} />
                        <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-text-500 uppercase">
                          NovaDeck / 0{index + 1}
                        </p>
                        <p className="mt-ds-xs max-w-[10rem] text-sm font-semibold leading-tight">
                          {deck.name}
                        </p>
                      </div>
                      <button
                        aria-label={`Play ${deck.name}`}
                        className="absolute right-ds-sm bottom-ds-sm grid size-8 translate-y-1 place-items-center rounded-full bg-accent text-on-accent opacity-0 shadow-level-2 transition duration-200 ease-standard group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
                        type="button"
                      >
                        <Play aria-hidden="true" className="size-3.5 fill-current" />
                      </button>
                    </div>
                    <div className="flex items-start justify-between gap-ds-sm p-ds-md">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium">{deck.name}</h3>
                        <p className="mt-ds-2xs text-xs text-text-500">{deck.updated}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-subtle px-ds-xs py-ds-2xs text-[0.625rem] font-medium text-text-500">
                        {deck.slides} slides
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="mt-8 grid gap-ds-md lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.75fr)]">
              <section
                className="rounded-lg border border-border-subtle bg-surface p-ds-lg shadow-level-1"
                aria-labelledby="activity-heading"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold" id="activity-heading">
                      Workspace activity
                    </h2>
                    <p className="mt-ds-2xs text-xs text-text-500">
                      A quick pulse on your creative flow.
                    </p>
                  </div>
                  <Activity aria-hidden="true" className="size-5 text-accent" />
                </div>
                <div className="mt-ds-xl grid grid-cols-3 gap-ds-sm">
                  {[
                    ["74", "Slides"],
                    ["3", "Active decks"],
                    ["8.2h", "Focus time"],
                  ].map(([value, label]) => (
                    <div className="rounded-md bg-surface-subtle p-ds-sm" key={label}>
                      <p className="text-lg font-semibold tracking-tight">{value}</p>
                      <p className="mt-ds-2xs text-xs text-text-500">{label}</p>
                    </div>
                  ))}
                </div>
              </section>

              <aside
                aria-label="Runtime status"
                className="rounded-lg border border-border-subtle bg-surface p-ds-lg shadow-level-1"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">System</h2>
                  <span className="flex items-center gap-ds-xs text-xs font-medium text-text-500">
                    <span className={`size-2 rounded-full ${statusStyles[status]}`} />
                    Runtime {status}
                  </span>
                </div>
                <dl className="mt-ds-xl space-y-ds-sm text-xs">
                  <div className="flex justify-between gap-ds-md border-b border-border-subtle pb-ds-sm">
                    <dt className="text-text-500">Frontend</dt>
                    <dd className="font-medium">React</dd>
                  </div>
                  <div className="flex justify-between gap-ds-md">
                    <dt className="text-text-500">Backend</dt>
                    <dd className="font-medium">Hono</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
