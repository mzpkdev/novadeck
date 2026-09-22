import { Tabs } from "@ark-ui/react/tabs"
import { Terminal } from "lucide-react"
import { type FormEvent, useRef, useState } from "react"

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
  accent: "text-cyan-700",
  error: "text-red-700",
  muted: "text-zinc-500",
  output: "text-zinc-900",
  success: "text-emerald-700",
} as const satisfies Record<Tone, string>

export const App = (): React.JSX.Element => {
  const [activeTab, setActiveTab] = useState<TabId>("assistant")
  const [sessions, setSessions] = useState(initialSessions)
  const generations = useRef<Record<TabId, number>>({ assistant: 0, logs: 0, runtime: 0 })
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
      generations.current[activeTab]++
      updateLines(activeTab, () => [])
      return
    }

    const sessionId = activeTab
    const generation = generations.current[sessionId]
    updateLines(sessionId, (current) => [
      ...current,
      createLine("", "output"),
      createLine(`~/novadeck $ ${next}`, "output"),
    ])

    const response = await executeCommand(next)
    if (generations.current[sessionId] === generation) {
      updateLines(sessionId, (current) => [...current, ...response])
    }
  }

  return (
    <Tabs.Root
      onValueChange={({ value }) => setActiveTab(value as TabId)}
      orientation="vertical"
      value={activeTab}
      asChild
    >
      <main
        className="grid h-svh grid-cols-[7rem_minmax(0,1fr)] overflow-hidden bg-white font-['Geist_Variable',ui-sans-serif,sans-serif] text-zinc-900 antialiased sm:grid-cols-[13rem_minmax(0,1fr)]"
        data-theme="light"
      >
        <TerminalTabs onRename={renameTab} sessions={sessions} />

        <section className="flex h-full min-w-0 flex-col" aria-labelledby="terminal-title">
          <header className="relative flex h-11 shrink-0 items-center border-b border-zinc-200 bg-white px-4">
            <h1
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[0.6875rem] font-medium tracking-wide text-zinc-500"
              id="terminal-title"
            >
              {activeSession.title}
            </h1>
          </header>

          {sessions.map((session) => (
            <Tabs.Content
              className="min-h-0 flex-1 overflow-y-auto px-4 py-6 font-['Geist_Mono_Variable',ui-monospace,monospace] text-xs leading-6 outline-none sm:px-8 sm:py-8 sm:text-[0.8125rem]"
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
            className="shrink-0 border-t border-zinc-200 bg-white px-4 py-2 font-['Geist_Mono_Variable',ui-monospace,monospace] sm:px-8"
            onSubmit={submit}
          >
            <div className="flex min-w-0 items-center gap-2 text-xs sm:text-[0.8125rem]">
              <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[0.6875rem] leading-none sm:text-xs">
                <Terminal aria-hidden="true" className="block size-3.5 shrink-0 text-cyan-700" />
                <span className="text-cyan-700">~/novadeck/{activeTab}</span>
                <span className="text-zinc-500">$</span>
              </span>
              <input
                aria-label="Terminal input"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                autoFocus
                className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-zinc-900 caret-cyan-700 outline-none"
                name="command"
                spellCheck={false}
              />
            </div>
          </form>
        </section>
      </main>
    </Tabs.Root>
  )
}
