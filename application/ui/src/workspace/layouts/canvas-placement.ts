import type { CanvasLayout, Session } from "../model/types"

const gap = 60
const defaultWidth = 550

const bounds = (session: Session, layout: CanvasLayout) => ({
  position: layout.geometry[session.id]?.position ?? { x: session.x, y: session.y },
  width: layout.geometry[session.id]?.width ?? defaultWidth,
  height: layout.geometry[session.id]?.height ?? session.height,
})

export const adjacentCanvasPosition = (
  active: Session,
  sessions: Session[],
  layout: CanvasLayout,
  height: number,
): { x: number; y: number } => {
  const anchor = bounds(active, layout)
  const occupied = sessions.map((session) => bounds(session, layout))
  const isFree = (x: number, y: number): boolean =>
    occupied.every(
      ({ position, width, height: occupiedHeight }) =>
        x + defaultWidth + gap <= position.x ||
        position.x + width + gap <= x ||
        y + height + gap <= position.y ||
        position.y + occupiedHeight + gap <= y,
    )
  for (let step = 0; step <= sessions.length; step++) {
    const offset = step * (height + gap)
    const candidates = [
      { x: anchor.position.x + anchor.width + gap, y: anchor.position.y + offset },
      { x: anchor.position.x, y: anchor.position.y + anchor.height + gap + offset },
    ]
    const free = candidates.find(({ x, y }) => isFree(x, y))
    if (free) return free
  }
  return {
    x: anchor.position.x,
    y: anchor.position.y + anchor.height + gap + (sessions.length + 1) * (height + gap),
  }
}
