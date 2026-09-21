import { Editable } from "@novadeck/react/editable"
import { Pencil, X } from "@novadeck/react/icons"
import { Tabs } from "@novadeck/react/tabs"
import { useRef, useState } from "react"

import type { Session, TabId } from "./terminal"

type TerminalTabsProps = {
  onRename: (id: TabId, title: string) => void
  sessions: Session[]
}

export const TerminalTabs = ({ onRename, sessions }: TerminalTabsProps): React.JSX.Element => {
  const [editingTab, setEditingTab] = useState<TabId | null>(null)
  const renameValue = useRef("")
  const triggers = useRef<Partial<Record<TabId, HTMLButtonElement>>>({})

  const startRename = (id: TabId, title: string): void => {
    renameValue.current = title
    setEditingTab(id)
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-border-subtle bg-surface-subtle">
      <div className="h-11 shrink-0 border-b border-border-subtle" />

      <nav aria-label="Terminal sessions" className="relative min-h-0 flex-1">
        <Tabs.List className="pl-ds-2xs pt-ds-xs">
          {sessions.map(({ id, title }) => (
            <Tabs.Trigger
              aria-description="Press F2 to rename"
              aria-keyshortcuts="F2"
              className="group h-10 w-full justify-center overflow-hidden px-ds-xs py-0 text-left text-[0.6875rem] leading-none hover:bg-background/60 data-[selected]:bg-background data-[selected]:[box-shadow:inset_2px_0_0_var(--color__accent)] sm:justify-start sm:px-ds-md"
              key={id}
              onKeyDown={(event) => {
                if (event.key !== "F2") return
                event.preventDefault()
                startRename(id, title)
              }}
              onFocus={() => {
                if (editingTab !== id) setEditingTab(null)
              }}
              ref={(element) => {
                if (element) triggers.current[id] = element
                else delete triggers.current[id]
              }}
              value={id}
            >
              <span className="truncate">{title}</span>
              <span
                aria-hidden="true"
                className="pointer-events-none ml-auto inline-flex shrink-0 items-center gap-ds-xs opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100"
              >
                <span
                  className="inline-flex opacity-25 transition-opacity hover:opacity-100"
                  data-rename-trigger
                  onClick={(event) => {
                    event.stopPropagation()
                    startRename(id, title)
                  }}
                  title={`Rename ${title}`}
                >
                  <Pencil size={10} />
                </span>
                <span
                  className="inline-flex opacity-25 transition-opacity hover:opacity-100"
                  data-close-trigger
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                  title={`Close ${title}`}
                >
                  <X size={12} />
                </span>
              </span>
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
                  onRename(session.id, renameValue.current)
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
  )
}
