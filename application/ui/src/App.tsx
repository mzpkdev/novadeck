import { Editable, Input, Tabs } from "@novadeck/react"
import { Terminal } from "@novadeck/react/icons"
import { type FormEvent, useRef, useState } from "react"

import { readStatus } from "./services/status"

type Tone = "accent" | "error" | "muted" | "output" | "success"
type Line = { id: string; text: string; tone: Tone }
type TabId = "assistant" | "logs" | "runtime"
type Session = { id: TabId; lines: Line[]; title: string }

let nextLineId = 0
const createLine = (text: string, tone: Tone): Line => ({
  id: `terminal-line-${nextLineId++}`,
  text,
  tone,
})

const initialLines: Line[] = [
  createLine("NovaDeck Terminal 0.0.0", "accent"),
  createLine("Presentation workspace connected to local runtime.", "muted"),
  createLine("Type `help` to see available commands.", "muted"),
  createLine("", "output"),
  createLine('$ novadeck deck create "A calm, privacy-first AI workspace"', "output"),
  createLine("Analyzing brief...", "muted"),
  createLine("Building a six-slide narrative...", "muted"),
  createLine("✓ Wrote ./launch-outline.deck", "success"),
  createLine("", "output"),
  createLine("  01  A calmer way to work with AI", "output"),
  createLine("  02  The cost of noisy, fragmented tools", "output"),
  createLine("  03  One private workspace for real thinking", "output"),
  createLine("  04  Control stays with your team", "output"),
  createLine("  05  From first thought to finished work", "output"),
  createLine("  06  Do your best work. Keep it yours.", "output"),
  createLine("", "output"),
  createLine("Run `novadeck deck build` to generate the presentation.", "muted"),
]

const initialSessions: Session[] = [
  { id: "assistant", lines: initialLines, title: "Terminal 1" },
  {
    id: "runtime",
    lines: [
      createLine("NovaDeck Runtime", "accent"),
      createLine("Local API process is ready.", "success"),
      createLine("endpoint  http://127.0.0.1:8787", "output"),
      createLine("health    /api/status", "muted"),
    ],
    title: "Terminal 2",
  },
  {
    id: "logs",
    lines: [
      createLine("NovaDeck application logs", "accent"),
      createLine("15:42:08  ui       connected", "muted"),
      createLine("15:42:08  runtime  listening on 127.0.0.1:8787", "output"),
      createLine("15:42:09  deck     loaded launch-outline.deck", "success"),
    ],
    title: "Terminal 3",
  },
]

const toneStyles = {
  accent: "text-accent",
  error: "text-danger",
  muted: "text-text-500",
  output: "text-text-900",
  success: "text-success",
} as const satisfies Record<Tone, string>

const responseFor = async (command: string): Promise<Line[]> => {
  const normalized = command.toLowerCase()

  if (normalized === "help") {
    return [
      createLine("Commands", "accent"),
      createLine("  help                  Show this command list", "output"),
      createLine("  status                Check the local runtime", "output"),
      createLine("  ls                    List workspace files", "output"),
      createLine("  pwd                   Print the working directory", "output"),
      createLine("  novadeck deck build   Build the current deck", "output"),
      createLine("  clear                 Clear the terminal", "output"),
    ]
  }

  if (normalized === "status") {
    try {
      const result = await readStatus()
      return [createLine(`runtime  ${result.status}`, "success")]
    } catch {
      return [createLine("runtime  unavailable", "error")]
    }
  }

  if (normalized === "ls") return [createLine("launch-outline.deck", "output")]
  if (normalized === "pwd") return [createLine("/home/novadeck", "output")]

  if (normalized === "novadeck deck build") {
    return [
      createLine("Rendering 6 slides...", "muted"),
      createLine("✓ Built ./dist/privacy-first-ai.deck", "success"),
    ]
  }

  return [
    createLine(`command not found: ${command}`, "error"),
    createLine("Type `help` for available commands.", "muted"),
  ]
}

export const App = (): React.JSX.Element => {
  const [activeTab, setActiveTab] = useState<TabId>("assistant")
  const [editingTab, setEditingTab] = useState<TabId | null>(null)
  const [sessions, setSessions] = useState(initialSessions)
  const renameValue = useRef("")
  const triggers = useRef<Partial<Record<TabId, HTMLButtonElement>>>({})
  const activeSession = sessions.find((session) => session.id === activeTab)!

  const updateLines = (id: TabId, update: (lines: Line[]) => Line[]): void => {
    setSessions((current) =>
      current.map((session) =>
        session.id === id ? { ...session, lines: update(session.lines) } : session,
      ),
    )
  }

  const renameTab = (id: TabId, value: string): void => {
    const title = value.trim()
    if (!title) return
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, title } : session)),
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const form = event.currentTarget
    const value = new FormData(form).get("command")
    const next = typeof value === "string" ? value.trim() : ""
    if (!next) return

    form.reset()

    if (next.toLowerCase() === "clear") {
      updateLines(activeTab, () => [])
      return
    }

    const sessionId = activeTab
    updateLines(sessionId, (current) => [
      ...current,
      createLine("", "output"),
      createLine(`~/novadeck $ ${next}`, "output"),
    ])

    const response = await responseFor(next)
    updateLines(sessionId, (current) => [...current, ...response])
  }

  return (
    <div className="novadeck" data-theme="light">
      <Tabs.Root
        onValueChange={({ value }) => {
          setActiveTab(value as TabId)
          setEditingTab(null)
        }}
        orientation="vertical"
        value={activeTab}
        asChild
      >
        <main
          className="grid h-svh grid-cols-[7rem_minmax(0,1fr)] overflow-hidden bg-background font-mono text-text-900 antialiased sm:grid-cols-[13rem_minmax(0,1fr)]"
          data-theme="light"
        >
          <aside className="flex min-h-0 flex-col border-r border-border-subtle bg-surface-subtle">
            <div className="h-11 shrink-0 border-b border-border-subtle" />

            <nav aria-label="Terminal sessions" className="relative min-h-0 flex-1">
              <Tabs.List className="pl-ds-2xs pt-ds-xs">
                {sessions.map(({ id, title }) => (
                  <Tabs.Trigger
                    className="h-10 w-full justify-center overflow-hidden px-ds-xs py-0 text-left text-[0.6875rem] leading-none hover:bg-background/60 data-[selected]:bg-background data-[selected]:[box-shadow:inset_2px_0_0_var(--color__accent)] sm:justify-start sm:px-ds-md"
                    key={id}
                    onDoubleClick={() => {
                      renameValue.current = title
                      setEditingTab(id)
                    }}
                    ref={(element) => {
                      if (element) triggers.current[id] = element
                      else delete triggers.current[id]
                    }}
                    value={id}
                  >
                    <span className="truncate">{title}</span>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {editingTab &&
                sessions.map((session, index) =>
                  session.id === editingTab ? (
                    <Editable.Root
                      activationMode="none"
                      className="absolute right-0 left-ds-2xs z-10"
                      defaultValue={session.title}
                      defaultEdit
                      finalFocusEl={() => triggers.current[session.id] ?? null}
                      key={session.id}
                      onEditChange={({ edit }) => {
                        if (!edit) setEditingTab(null)
                      }}
                      onValueCommit={() => {
                        renameTab(session.id, renameValue.current)
                      }}
                      style={{ top: `calc(var(--spacing__xs) + ${index * 2.5}rem)` }}
                      submitMode="enter"
                    >
                      <Editable.Area>
                        <Editable.Input
                          aria-label={`Rename ${session.title}`}
                          className="h-10 border-0 bg-background px-ds-xs py-0 text-[0.6875rem] leading-none [box-shadow:inset_2px_0_0_var(--color__accent)] sm:px-ds-md"
                          onInput={(event) => {
                            renameValue.current = event.currentTarget.value
                          }}
                        />
                      </Editable.Area>
                    </Editable.Root>
                  ) : null,
                )}
            </nav>
          </aside>

          <section className="flex h-full min-w-0 flex-col" aria-labelledby="terminal-title">
            <header className="relative flex h-11 shrink-0 items-center border-b border-border-subtle bg-surface px-ds-md">
              <div className="flex items-center gap-ds-xs" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-warning" />
                <span className="size-2.5 rounded-full bg-success" />
              </div>

              <h1
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[0.6875rem] font-medium tracking-wide text-text-500"
                id="terminal-title"
              >
                {activeSession.title}
              </h1>
            </header>

            {sessions.map((session) => (
              <Tabs.Content
                className="min-h-0 flex-1 overflow-y-auto px-ds-md py-ds-lg text-xs leading-6 sm:px-ds-xl sm:py-ds-xl sm:text-[0.8125rem]"
                key={session.id}
                value={session.id}
              >
                <div aria-live="polite" className="max-w-4xl" role="log">
                  {session.lines.map((line) => (
                    <div
                      className={`min-h-6 whitespace-pre-wrap ${toneStyles[line.tone]}`}
                      key={line.id}
                    >
                      {line.text}
                    </div>
                  ))}
                  <span
                    aria-hidden="true"
                    ref={(element) => element?.scrollIntoView?.({ block: "end" })}
                  />
                </div>
              </Tabs.Content>
            ))}

            <form
              aria-label="Terminal command"
              className="shrink-0 border-t border-border-subtle bg-background px-ds-md py-ds-sm sm:px-ds-xl"
              onSubmit={submit}
            >
              <Input
                className="min-h-0 min-w-0 border-0 bg-transparent p-0 text-xs text-text-900 shadow-none outline-none sm:text-[0.8125rem]"
                controlProps={{
                  "aria-label": "Terminal input",
                  autoCapitalize: "off",
                  autoComplete: "off",
                  autoCorrect: "off",
                  autoFocus: true,
                  className: "caret-accent px-ds-xs py-ds-xs text-text-900",
                  name: "command",
                  spellCheck: false,
                }}
                start={
                  <span className="inline-flex shrink-0 items-center gap-ds-xs whitespace-nowrap text-[0.6875rem] leading-none sm:text-xs">
                    <Terminal aria-hidden="true" className="block size-3.5 shrink-0 text-accent" />
                    <span className="text-accent">~/novadeck/{activeTab}</span>
                    <span className="text-text-500">$</span>
                  </span>
                }
              />
            </form>
          </section>
        </main>
      </Tabs.Root>
    </div>
  )
}
