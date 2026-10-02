import { useSyncExternalStore } from "react"

import { createStore } from "../../model/store"

// While an icon is dragged off a terminal's taskbar: the terminal it came from, the
// terminal window under the pointer, and whether the pointer is on that terminal's bar,
// where a drop places it. A terminal without a bar shows an empty one while it's hovered.
export type DragOver = {
  readonly source: string
  readonly terminal: string | null
  readonly onBar: boolean
}

export const dragOver = createStore<DragOver | null>(null)

export const useDragOver = (): DragOver | null =>
  useSyncExternalStore(dragOver.subscribe, dragOver.getSnapshot)

// The terminal window under a point, by its terminal id, and whether the point is on
// that window's taskbar.
export const dragTargetAt = (
  x: number,
  y: number,
): { readonly terminal: string | null; readonly onBar: boolean } => {
  const under = document.elementsFromPoint(x, y)
  const window = under.find((element) => element.matches("section.terminal-window"))
  const terminal = window?.getAttribute("data-terminal") ?? null
  const onBar = Boolean(
    window &&
    under.some(
      (element) =>
        element.classList.contains("plan-taskbar") &&
        element.closest("section.terminal-window") === window,
    ),
  )
  return { terminal, onBar }
}
