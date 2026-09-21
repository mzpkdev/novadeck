import { Input } from "@novadeck/react/field"
import { Terminal } from "@novadeck/react/icons"
import { Tabs } from "@novadeck/react/tabs"
import { type FormEvent, useState } from "react"

import {
  createLine,
  executeCommand,
  initialSessions,
  type Line,
  type TabId,
  type Tone,
} from "./terminal"
import { TerminalTabs } from "./TerminalTabs"

const toneStyles = {
  accent: "text-accent",
  error: "text-danger",
  muted: "text-text-500",
  output: "text-text-900",
  success: "text-success",
} as const satisfies Record<Tone, string>

export const App = (): React.JSX.Element => {
  const [activeTab, setActiveTab] = useState<TabId>("assistant")
  const [sessions, setSessions] = useState(initialSessions)
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

    const response = await executeCommand(next)
    updateLines(sessionId, (current) => [...current, ...response])
  }

  return (
    <div className="novadeck" data-theme="light">
      <Tabs.Root
        onValueChange={({ value }) => setActiveTab(value as TabId)}
        orientation="vertical"
        value={activeTab}
        asChild
      >
        <main
          className="grid h-svh grid-cols-[7rem_minmax(0,1fr)] overflow-hidden bg-background font-sans text-text-900 antialiased sm:grid-cols-[13rem_minmax(0,1fr)]"
          data-theme="light"
        >
          <TerminalTabs onRename={renameTab} sessions={sessions} />

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
                className="min-h-0 flex-1 overflow-y-auto px-ds-md py-ds-lg font-mono text-xs leading-6 sm:px-ds-xl sm:py-ds-xl sm:text-[0.8125rem]"
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
              className="shrink-0 border-t border-border-subtle bg-background px-ds-md py-ds-sm font-mono sm:px-ds-xl"
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
