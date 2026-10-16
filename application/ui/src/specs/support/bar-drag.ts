import { onTestFailed, onTestFinished } from "vitest"

type DragState = {
  readonly from: string
  readonly undocks: boolean
  readonly over: string | null
  readonly onBar: boolean
  readonly place: unknown
}

type Drop = {
  readonly source: unknown
  readonly initialIndex: number | undefined
  readonly index: number | undefined
  readonly cancelled: boolean
  readonly nativeEvent: Event | undefined
  readonly before: DragState | null
  readonly after: DragState | null
}

const stateOf = (state: DragState | null) => {
  if (!state) return null
  const { from, undocks, over, onBar, place } = state
  return { from, undocks, over, onBar, place }
}

const pointOf = (event: Event | undefined) => {
  if (!event || !("clientX" in event) || !("clientY" in event))
    return { native: event?.type, pointer: event instanceof PointerEvent }
  const { clientX: x, clientY: y } = event
  if (typeof x !== "number" || typeof y !== "number") return { native: event.type }
  return {
    native: event.type,
    pointer: event instanceof PointerEvent,
    x,
    y,
    hits: document.elementsFromPoint(x, y).map((element) => ({
      tag: element.tagName,
      class: element.getAttribute("class"),
      terminal: element.getAttribute("data-terminal"),
      slot: element.getAttribute("data-slot"),
      dragging: element.getAttribute("data-dragging"),
    })),
  }
}

/** Keeps a failed undocking gesture's native release and app decision in the CI log. */
export const watchBarDrag = (): void => {
  const began = performance.now()
  const events: unknown[] = []
  const record = (type: string, detail: unknown): void => {
    events.push({ ms: Math.round(performance.now() - began), type, detail })
    if (events.length > 20) events.shift()
  }
  const pointer = (event: Event): void => record(event.type, pointOf(event))
  const dropped = (event: Event): void => {
    const { nativeEvent, before, after, ...drop } = (event as CustomEvent<Drop>).detail
    record("app-drop", {
      ...drop,
      ...pointOf(nativeEvent),
      before: stateOf(before),
      after: stateOf(after),
    })
  }
  for (const type of ["pointerdown", "pointerup", "pointercancel"])
    window.addEventListener(type, pointer, true)
  window.addEventListener("novadeck:test-bar-drop", dropped)
  onTestFailed(() => console.error("UI_BAR_DRAG", JSON.stringify(events)))
  onTestFinished(() => {
    for (const type of ["pointerdown", "pointerup", "pointercancel"])
      window.removeEventListener(type, pointer, true)
    window.removeEventListener("novadeck:test-bar-drop", dropped)
  })
}
