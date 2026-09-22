import type { PointerEvent } from "react"

const clearPointer = (event: PointerEvent<HTMLDivElement>): void => {
  delete event.currentTarget.dataset.pointerInside
}

export const backgroundPointerHandlers = {
  onPointerMove: (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "touch") return
    const surface = event.currentTarget
    const bounds = surface.getBoundingClientRect()
    surface.style.setProperty("--canvas-pointer-x", `${event.clientX - bounds.left}px`)
    surface.style.setProperty(
      "--canvas-pointer-y",
      `${event.clientY - bounds.top - surface.clientTop}px`,
    )
    surface.dataset.pointerInside = "true"
  },
  onPointerLeave: clearPointer,
  onPointerCancel: clearPointer,
}
