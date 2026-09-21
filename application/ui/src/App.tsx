import { Button, Card, Input, Link } from "@novadeck/react"
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
      data-theme="light"
    >
      <div className="min-h-screen [display:grid] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-border-subtle bg-surface px-ds-lg py-ds-xl lg:border-r lg:border-b-0">
          <div className="flex items-center gap-ds-sm px-ds-xs">
            <span className="size-9 place-items-center rounded-md bg-accent text-on-accent shadow-level-2 [display:grid]">
              <Command aria-hidden="true" className="size-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">NovaDeck</p>
              <p className="text-xs text-text-500">Creative workspace</p>
            </div>
          </div>

          <nav aria-label="Primary" className="mt-8 flex gap-ds-xs overflow-x-auto lg:flex-col">
            {navigation.map(({ label, icon: Icon, current }) => (
              <Button
                aria-current={current ? "page" : undefined}
                className="min-w-max justify-start text-sm lg:w-full"
                href={`#${label.toLowerCase()}`}
                key={label}
                start={<Icon aria-hidden="true" />}
                variant={current ? "tonal" : "text"}
              >
                {label}
              </Button>
            ))}
          </nav>

          <div className="mt-auto hidden pt-ds-xl lg:block">
            <Button
              className="justify-start text-sm"
              fluid
              start={<Settings aria-hidden="true" />}
              variant="text"
            >
              Settings
            </Button>
            <div className="mt-ds-md flex items-center gap-ds-sm border-t border-border-subtle px-ds-xs pt-ds-lg">
              <span className="size-8 place-items-center rounded-full bg-surface-muted text-xs font-semibold text-text-700 [display:grid]">
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
            <Input
              className="max-w-md flex-1 text-sm"
              controlProps={{
                "aria-label": "Search decks",
                placeholder: "Search your decks",
                type: "search",
              }}
              end={
                <kbd className="hidden rounded-2xs border border-border bg-surface-subtle px-ds-xs py-ds-2xs font-mono text-[0.625rem] text-text-500 sm:block">
                  ⌘ K
                </kbd>
              }
              start={<Search aria-hidden="true" />}
            />
            <Button aria-label="Notifications" iconOnly variant="elevated">
              <Bell aria-hidden="true" />
            </Button>
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
              <Button
                className="text-sm font-semibold"
                start={<CirclePlus aria-hidden="true" />}
                variant="filled"
              >
                New deck
              </Button>
            </div>

            <section className="mt-8" aria-labelledby="recent-heading">
              <div className="mb-ds-md flex items-center justify-between">
                <h2 className="text-sm font-semibold" id="recent-heading">
                  Recent decks
                </h2>
                <Link
                  className="flex items-center gap-ds-2xs text-xs font-medium text-accent hover:text-accent-hover"
                  href="#decks"
                >
                  View all
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>

              <div className="gap-ds-md [display:grid] md:grid-cols-3">
                {decks.map((deck, index) => (
                  <Card
                    className="group transition-transform duration-200 ease-standard hover:-translate-y-0.5"
                    fluid
                    key={deck.name}
                    raised
                    renderContent={
                      <>
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
                          <Button
                            aria-label={`Play ${deck.name}`}
                            className="absolute right-ds-sm bottom-ds-sm translate-y-1 rounded-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
                            iconOnly
                            variant="filled"
                          >
                            <Play aria-hidden="true" className="fill-current" />
                          </Button>
                        </div>
                        <div className="flex items-start justify-between gap-ds-sm border-t border-border-subtle p-ds-md">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-medium">{deck.name}</h3>
                            <p className="mt-ds-2xs text-xs text-text-500">{deck.updated}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-surface-subtle px-ds-xs py-ds-2xs text-[0.625rem] font-medium text-text-500">
                            {deck.slides} slides
                          </span>
                        </div>
                      </>
                    }
                  />
                ))}
              </div>
            </section>

            <div className="mt-8 gap-ds-md [display:grid] lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.75fr)]">
              <Card
                as="section"
                aria-labelledby="activity-heading"
                fluid
                renderContent={
                  <div className="p-ds-lg">
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
                    <div className="mt-ds-xl grid-cols-3 gap-ds-sm [display:grid]">
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
                  </div>
                }
              />

              <Card
                aria-label="Runtime status"
                as="section"
                fluid
                renderContent={
                  <div className="p-ds-lg">
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
                  </div>
                }
                role="complementary"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
