import { Editable } from "@ark-ui/react/editable"
import { Tabs } from "@ark-ui/react/tabs"
import { Pencil, X } from "lucide-react"
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
    <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="h-11 shrink-0 border-b border-zinc-200" />

      <nav aria-label="Terminal sessions" className="min-h-0 flex-1">
        <Tabs.List className="pt-2 pl-1">
          {sessions.map(({ id, title }) => (
            <div className="relative h-10" data-tab-row={id} key={id}>
              <Tabs.Trigger
                aria-description="Press F2 to rename"
                aria-keyshortcuts="F2"
                className="group flex h-full w-full cursor-pointer items-center justify-center overflow-hidden border-l-2 border-transparent px-2 text-left text-[0.6875rem] leading-none outline-none transition-colors hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-inset data-[selected]:border-cyan-700 data-[selected]:bg-white sm:justify-start sm:px-4"
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
                  className="pointer-events-none ml-auto inline-flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100"
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

              {editingTab === id ? (
                <Editable.Root
                  activationMode="none"
                  className="absolute inset-0 z-10 h-full"
                  defaultValue={title}
                  defaultEdit
                  finalFocusEl={() => triggers.current[id] ?? null}
                  onEditChange={({ edit }) => {
                    if (!edit) setEditingTab(null)
                  }}
                  onValueCommit={() => {
                    onRename(id, renameValue.current)
                  }}
                  submitMode="enter"
                >
                  <Editable.Area className="h-full w-full">
                    <Editable.Input
                      aria-label={`Rename ${title}`}
                      className="h-full w-full border-0 border-l-2 border-cyan-700 bg-white px-2 text-[0.6875rem] leading-none text-zinc-900 outline-none sm:px-4"
                      onInput={(event) => {
                        renameValue.current = event.currentTarget.value
                      }}
                    />
                  </Editable.Area>
                </Editable.Root>
              ) : null}
            </div>
          ))}
        </Tabs.List>
      </nav>
    </aside>
  )
}
