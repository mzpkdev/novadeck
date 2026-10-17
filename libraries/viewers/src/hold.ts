// Holding a viewer's place while its size arrives. A place set before the viewer has its
// size, as when it mounts out of sight (a parked terminal), while its pane settles, or
// before an image has loaded, is set again as the size of what it watches changes, until
// a moment after the viewer first has a size, or until the person, or anything else,
// scrolls it.

export type Hold = {
  /** Sets the place now, and again as the size arrives. */
  readonly hold: (place: () => void) => void
  /** Stops setting it. */
  readonly release: () => void
}

export const createHold = (root: HTMLElement, watched: () => readonly Element[]): Hold => {
  let release: (() => void) | undefined
  const hold = (place: () => void): void => {
    release?.()
    // Where it last put the viewer: a scroll anywhere else is someone else's.
    let placed = { top: -1, left: -1 }
    const put = (): void => {
      place()
      placed = { top: root.scrollTop, left: root.scrollLeft }
    }
    put()
    const Observer = root.ownerDocument.defaultView?.ResizeObserver
    if (!Observer) return
    let timer: ReturnType<typeof setTimeout> | undefined
    // Moved since it put it there, unless only cut short as what it holds shrank: a
    // scroll whose event may not have come yet.
    const moved = (): boolean => {
      const { scrollTop: top, scrollLeft: left, scrollHeight, clientHeight } = root
      const clamped = top < placed.top && top >= scrollHeight - clientHeight - 1
      return (top !== placed.top && !clamped) || left !== placed.left
    }
    const observer = new Observer(() => {
      if (moved()) return release?.()
      put()
      if (root.clientHeight && timer === undefined) timer = setTimeout(() => release?.(), 1000)
    })
    const letGo = (): void => release?.()
    const scrolled = (): void => {
      if (moved()) letGo()
    }
    const inputs = ["wheel", "pointerdown", "keydown", "touchstart"] as const
    release = () => {
      observer.disconnect()
      clearTimeout(timer)
      for (const input of inputs) root.removeEventListener(input, letGo)
      root.removeEventListener("scroll", scrolled)
      release = undefined
    }
    for (const input of inputs) root.addEventListener(input, letGo, { passive: true })
    root.addEventListener("scroll", scrolled, { passive: true })
    for (const element of [root, ...watched()]) observer.observe(element)
  }
  return { hold, release: () => release?.() }
}
