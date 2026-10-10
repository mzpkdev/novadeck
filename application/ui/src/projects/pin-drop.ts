import { createContext, useContext, useSyncExternalStore } from "react"

type Point = { readonly x: number; readonly y: number }

// Where a dragged project would land on the pins bar: its place among the pins, the gap's
// offset from the start of the bar's row, where the bar marks it, and the bar's bottom on
// screen, which the dragged row keeps below.
export type PinDropSpot = { readonly index: number; readonly x: number; readonly bottom: number }

// A project dragged out of the switcher's list, while the drag lasts: whether the pins
// bar can take it (it is pinned, or a pin is free), and where it would land while the
// pointer is over the bar.
export type PinDrop = {
  readonly id: string
  readonly accepts: boolean
  readonly spot: PinDropSpot | null
}

// The pins bar, as the channel knows it: where a point lands among its pins, null off the
// bar or while it isn't shown.
export type PinDropBar = {
  readonly locate: (point: Point, id: string) => PinDropSpot | null
}

// Carries a drag from the switcher's list to the pins bar, which are apart in the tree:
// the list tells where the drag starts, moves and ends, and the bar, which knows where
// its pins are, says where a point lands among them. A drop on a spot pins the project
// there, through `drop`; the spot is found again as the drag ends, in case the bar went
// meanwhile, as into Zen.
export type PinDropChannel = {
  readonly getSnapshot: () => PinDrop | null
  readonly subscribe: (listener: () => void) => () => void
  readonly setBar: (bar: PinDropBar | null) => void
  readonly start: (id: string, accepts: boolean) => void
  // A point the bar can't see, as over the open list, is null.
  readonly move: (point: Point | null) => void
  // Ends the drag, pinning the project where it was let go unless it was canceled;
  // true when it was dropped on the bar.
  readonly end: (canceled: boolean) => boolean
}

export const createPinDrop = (drop: (id: string, index: number) => void): PinDropChannel => {
  let state: PinDrop | null = null
  let bar: PinDropBar | null = null
  let last: Point | null = null
  const listeners = new Set<() => void>()
  const set = (next: PinDrop | null): void => {
    state = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setBar: (next) => {
      bar = next
    },
    start: (id, accepts) => {
      last = null
      set({ id, accepts, spot: null })
    },
    move: (point) => {
      if (!state) return
      last = point
      const spot = state.accepts && point && bar ? bar.locate(point, state.id) : null
      const was = state.spot
      const same =
        was && spot && was.index === spot.index && was.x === spot.x && was.bottom === spot.bottom
      if (was === spot || same) return
      set({ ...state, spot })
    },
    end: (canceled) => {
      const was = state
      if (!was) return false
      set(null)
      const spot = !canceled && was.spot && last && bar ? bar.locate(last, was.id) : null
      last = null
      if (!spot) return false
      drop(was.id, spot.index)
      return true
    },
  }
}

export const PinDropContext = createContext<PinDropChannel | null>(null)

const none = (): (() => void) => () => {}
const nothing = (): null => null

// The channel, where one is given, and the drag it carries now.
export const usePinDrop = (): { channel: PinDropChannel | null; drag: PinDrop | null } => {
  const channel = useContext(PinDropContext)
  const drag = useSyncExternalStore(
    channel?.subscribe ?? none,
    channel?.getSnapshot ?? nothing,
    nothing,
  )
  return { channel, drag }
}
