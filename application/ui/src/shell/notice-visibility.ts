import { useEffect, useSyncExternalStore } from "react"

// Whether a footer notice (the update's or the sandbox's) is on screen, told by the notices
// themselves from the one condition they show by (open, not hidden, not blocked, no dialog
// over them), so what shares the corner with them reads it from state, never from the page.

const listeners = new Set<() => void>()
let shown = 0

const change = (by: number): void => {
  shown += by
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

// Called by a notice with whether it is visible now.
export const useReportNotice = (visible: boolean): void => {
  useEffect(() => {
    if (!visible) return undefined
    change(1)
    return () => change(-1)
  }, [visible])
}

// Whether any footer notice is visible.
export const useNoticeShown = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => shown > 0,
    () => false,
  )
