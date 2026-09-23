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

import type { Session } from "../model/types"
import { sidebarListClasses } from "../sidebar/SidebarItem"
import { SessionTab } from "./SessionTab"

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

export const SessionList = ({
  sessions,
  selected,
  hidden,
  onVisibilityChange,
  onSelect,
  onRename,
  onClose,
  onReorder,
}: {
  sessions: Session[]
  selected: string
  hidden: Record<string, boolean>
  onVisibilityChange: (id: string, hidden: boolean) => void
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
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
        const order = sessions.map((session) => session.id)
        const from = order.indexOf(String(source.id))
        if (from < 0) return
        const [id] = order.splice(from, 1)
        order.splice(source.index, 0, id!)
        onReorder(order)
      }}
    >
      <div className={`session-list ${sidebarListClasses}`} ref={setList}>
        {sessions.map((session, index) => (
          <SessionTab
            key={session.id}
            session={session}
            index={index}
            selected={selected === session.id}
            hidden={hidden[session.id] ?? false}
            onVisibilityChange={(isHidden) => onVisibilityChange(session.id, isHidden)}
            onSelect={() => onSelect(session.id)}
            onRename={(name) => onRename(session.id, name)}
            onClose={() => onClose(session.id)}
          />
        ))}
        {!sessions.length && <p className="px-3 py-3 text-[11px] text-muted">No open sessions</p>}
      </div>
    </DragDropProvider>
  )
}
