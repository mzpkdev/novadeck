import { createContext, useContext } from "react"

// Whether the app runs framed in another page, as the website's hero frames the visitor
// build: the page around it says what it is and decides what a phone gets, so the app shows
// neither the visitor strip nor the narrow window's panel.
export const EmbeddedContext = createContext(false)

export const useEmbedded = (): boolean => useContext(EmbeddedContext)

// Tells the page framing the app that it is in view. The frame's `load` event fires for an
// error page as well, so the page could not otherwise tell a booted app from a failed load.
// The target origin is "*" because the message carries nothing sensitive; the framing page
// decides whom to believe by checking the origin and source of what it receives.
export const announceShown = (): void => {
  if (window.parent !== window) window.parent.postMessage({ type: "novadeck:ready" }, "*")
}

// The pixels one line stands for, where a wheel counts in lines.
const lineHeightPx = 16

// The frames whose visitor engaged the app: engaged stays so for the page's life, whatever
// mounts the hold again (StrictMode's second effect run, a reboot).
const engaged = new WeakSet<Window>()

// A wheel's distance in CSS pixels: its mode says whether it counts pixels, lines or pages.
const pixels = ({ deltaX, deltaY, deltaMode }: WheelEvent, frame: Window) =>
  deltaMode === 1
    ? { deltaX: deltaX * lineHeightPx, deltaY: deltaY * lineHeightPx }
    : deltaMode === 2
      ? {
          deltaX: deltaX * frame.innerWidth,
          deltaY: deltaY * frame.innerHeight,
        }
      : { deltaX, deltaY }

// Until the page framing the app says the visitor engaged it (`novadeck:engaged`), the
// wheel belongs to that page, not to the app: it is taken before anything in the app sees
// it, so no terminal, list or canvas scrolls or zooms, and handed up as `novadeck:wheel`,
// in CSS pixels, for the page to scroll with. A zoom gesture (ctrl or meta with the wheel)
// is taken the same way but not handed up, as the page has no use for it. Nothing is held
// where the app is not framed, and the hold ends for good on the first message from the
// parent: any other sender is ignored. The target origin is "*" for the reason
// `announceShown`'s is. Returns what lifts the hold, for the effect that began it.
export const holdInputUntilEngaged = (frame: Window = window): (() => void) => {
  const parent = frame.parent
  if (parent === frame || engaged.has(frame)) return () => {}
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.ctrlKey || event.metaKey) return
    parent.postMessage({ type: "novadeck:wheel", ...pixels(event, frame) }, "*")
  }
  const release = (): void => {
    frame.removeEventListener("wheel", onWheel, { capture: true })
    frame.removeEventListener("message", onMessage)
  }
  const onMessage = (event: MessageEvent): void => {
    if (event.source !== parent) return
    const data: unknown = event.data
    if (typeof data !== "object" || data === null || !("type" in data)) return
    if (data.type !== "novadeck:engaged") return
    engaged.add(frame)
    release()
  }
  // Not passive: it prevents the default, and must come before the app's own listeners.
  frame.addEventListener("wheel", onWheel, { capture: true, passive: false })
  frame.addEventListener("message", onMessage)
  return release
}
