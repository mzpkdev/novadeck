import type { EditorView } from "@codemirror/view"

// How far below the top of the pane a line lands.
const margin = 24

// The nearest ancestor that scrolls on its own: the pane's, never the app's clipped
// containers.
const scrollerOf = (element: HTMLElement): HTMLElement | null => {
  for (let at = element.parentElement; at; at = at.parentElement)
    if (/^(auto|scroll)$/.test(getComputedStyle(at).overflowY)) return at
  return null
}

// Brings the line at `at` to the top of the pane, smoothly unless motion is reduced.
// Only the pane's scroller moves: CodeMirror's scrollIntoView also scrolls every
// ancestor whose content overflows, clipped ones included, which shifts the whole app.
// Lines out of view have estimated heights, so once the scroll stops, or a frame after an
// instant one, it corrects for where the line really is, unless the user took over the
// scroll meanwhile.
export const scrollLineToTop = (view: EditorView, at: number): void => {
  const scroller = scrollerOf(view.dom)
  if (!scroller) return
  // Where the scroller has to be, within what it can reach.
  const target = (): number =>
    Math.min(
      Math.max(
        0,
        scroller.scrollTop +
          view.documentTop +
          view.lineBlockAt(at).top -
          scroller.getBoundingClientRect().top -
          margin,
      ),
      scroller.scrollHeight - scroller.clientHeight,
    )
  const off = (): boolean => Math.abs(target() - scroller.scrollTop) >= 1
  // Already there, or as near as it goes: nothing moves, so nothing waits for a stop.
  if (!off()) return
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches
  scroller.scrollTo({ top: target(), behavior: smooth ? "smooth" : "instant" })
  if (!smooth) {
    // The editor measures what came into view on the next frame; then it settles.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (off()) scroller.scrollTo({ top: target(), behavior: "instant" })
      }),
    )
    return
  }
  const done = new AbortController()
  const { signal } = done
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"])
    scroller.addEventListener(type, () => done.abort(), { signal, passive: true })
  scroller.addEventListener(
    "scrollend",
    () => {
      done.abort()
      if (off()) scroller.scrollTo({ top: target(), behavior: "smooth" })
    },
    { signal },
  )
  // A scroll that never reports its end leaves nothing behind.
  setTimeout(() => done.abort(), 2000)
}

// Where the pane is scrolled in the plan: the line at its top, and how far down that line,
// as a share of its height, which holds across a narrower or zoomed pane.
export type PlanScroll = { readonly at: number; readonly into: number }

// How far the pane's top is into the document, in the editor's own pixels: the page's
// are scaled where Canvas zooms. The scale is the editor's, measured here since it holds
// before the editor first measures it, and over the whole document, so rounding its
// height to whole pixels hardly matters.
const heightAtTop = (view: EditorView, scroller: HTMLElement): number => {
  const tall = view.dom.offsetHeight
  const scale = tall ? view.dom.getBoundingClientRect().height / tall : 1
  return (scroller.getBoundingClientRect().top - view.documentTop) / scale
}

// Follows where the pane is scrolled in the plan, while it's on screen; returns the stop.
export const followScroll = (view: EditorView, on: (scroll: PlanScroll) => void): (() => void) => {
  const scroller = scrollerOf(view.dom)
  if (!scroller) return () => {}
  const note = (): void => {
    // Out of sight it has no size, and no place to note.
    if (!scroller.clientHeight) return
    const height = Math.max(0, heightAtTop(view, scroller))
    const line = view.lineBlockAtHeight(height)
    on({ at: line.from, into: line.height ? (height - line.top) / line.height : 0 })
  }
  scroller.addEventListener("scroll", note, { passive: true })
  return () => scroller.removeEventListener("scroll", note)
}

// Scrolls the pane back to where `scroll` says, at once, then again each frame while the
// editor measures the lines that came into view, whose heights it had only estimated, or
// an edit moves the place; `done` once it holds still, after a few frames, or once the
// person scrolls themselves. Out of sight, it waits until the pane shows. Returns the
// cancel, for an editor that closes meanwhile.
export const restoreScroll = (
  view: EditorView,
  scroll: () => PlanScroll | null,
  done: () => void,
): (() => void) => {
  const scroller = scrollerOf(view.dom)
  if (!scroller) {
    done()
    return () => {}
  }
  const target = (): number | null => {
    const now = scroll()
    if (!now) return null
    const line = view.lineBlockAt(Math.min(now.at, view.state.doc.length))
    const height = line.top + now.into * line.height
    return Math.min(
      Math.max(0, scroller.scrollTop + height - heightAtTop(view, scroller)),
      scroller.scrollHeight - scroller.clientHeight,
    )
  }
  // Whether it moved.
  const go = (): boolean => {
    const top = target()
    if (top === null || Math.abs(top - scroller.scrollTop) < 1) return false
    scroller.scrollTo({ top, behavior: "instant" })
    return true
  }
  const stop = new AbortController()
  const { signal } = stop
  let frame = 0
  const finish = (): void => {
    if (signal.aborted) return
    stop.abort()
    cancelAnimationFrame(frame)
    done()
  }
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"])
    scroller.addEventListener(type, finish, { signal, passive: true })
  let frames = 0
  const settle = (): void => {
    if ((go() || frames === 0) && ++frames < 6) frame = requestAnimationFrame(settle)
    else finish()
  }
  const start = (): void => {
    go()
    frame = requestAnimationFrame(settle)
  }
  if (scroller.clientHeight) start()
  else {
    const shows = new ResizeObserver(() => {
      if (!scroller.clientHeight) return
      shows.disconnect()
      start()
    })
    shows.observe(scroller)
    signal.addEventListener("abort", () => shows.disconnect())
  }
  return () => {
    stop.abort()
    cancelAnimationFrame(frame)
  }
}
