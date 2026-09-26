import {
  Accessibility,
  Cursor,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable } from "@dnd-kit/react/sortable"
import { useMemo, useState } from "react"

import type { TerminalMetadata } from "../model/types"
import { sidebarListClasses } from "../sidebar/SidebarItem"
import type { TerminalRename } from "./TerminalRenameInput"
import { TerminalTab } from "./TerminalTab"

const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 6 })],
  }),
  KeyboardSensor.configure({
    keyboardCodes: { ...KeyboardSensor.defaults.keyboardCodes, start: ["Space"] },
  }),
]
const accessibility = Accessibility.configure({
  screenReaderInstructions: {
    draggable:
      "Press Enter to select a terminal. Press Space to pick up a tab, use arrow keys to reorder, then Space to drop or Escape to cancel.",
  },
})
const feedback = Feedback.configure({
  dropAnimation: { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
})
const cursor = Cursor.configure({ cursor: "pointer" })

export const TerminalTabs = ({
  terminals,
  selected,
  hidden,
  rename,
  onVisibilityChange,
  onSelect,
  onBeginRename,
  onRenameDraft,
  onRenameSave,
  onRenameCancel,
  onClose,
  onReorder,
}: {
  terminals: TerminalMetadata[]
  selected: string
  hidden: Record<string, boolean>
  rename: TerminalRename | null
  onVisibilityChange: (id: string, hidden: boolean) => void
  onSelect: (id: string) => void
  onBeginRename: (id: string) => void
  onRenameDraft: (id: string, value: string) => void
  onRenameSave: (id: string) => void
  onRenameCancel: (id: string) => void
  onClose: (id: string) => void
  onReorder: (ids: string[]) => void
}): React.JSX.Element => {
  const [list, setList] = useState<HTMLDivElement | null>(null)
  const modifiers = useMemo(() => [RestrictToElement.configure({ element: list })], [list])
  return (
    <DragDropProvider
      sensors={sensors}
      modifiers={modifiers}
      plugins={(defaults) => [...defaults, accessibility, feedback, cursor]}
      onDragEnd={(event) => {
        if (event.canceled) return
        const { source } = event.operation
        if (!isSortable(source) || source.initialIndex === source.index) return
        const order = terminals.map((terminal) => terminal.id)
        const from = order.indexOf(String(source.id))
        if (from < 0) return
        const [id] = order.splice(from, 1)
        order.splice(source.index, 0, id!)
        onReorder(order)
      }}
    >
      <div className={`terminal-tab-list ${sidebarListClasses}`} ref={setList}>
        {terminals.map((terminal, index) => (
          <TerminalTab
            key={terminal.id}
            terminal={terminal}
            index={index}
            selected={selected === terminal.id}
            hidden={hidden[terminal.id] ?? false}
            rename={rename?.id === terminal.id ? rename : null}
            onVisibilityChange={(isHidden) => onVisibilityChange(terminal.id, isHidden)}
            onSelect={() => onSelect(terminal.id)}
            onBeginRename={() => onBeginRename(terminal.id)}
            onRenameDraft={(value) => onRenameDraft(terminal.id, value)}
            onRenameSave={() => onRenameSave(terminal.id)}
            onRenameCancel={() => onRenameCancel(terminal.id)}
            onClose={() => onClose(terminal.id)}
          />
        ))}
        {!terminals.length && <p className="px-3 py-3 text-[11px] text-muted">No open sessions</p>}
      </div>
    </DragDropProvider>
  )
}
