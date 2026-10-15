import { useEffect, useRef } from "react"

// Tells the page framing the app that it has booted. The frame's `load` event fires for an
// error page as well, so a page that framed a failed load could not tell it from a good
// one. Rendered only where the app is embedded, once the backend is connected and the
// workspace mounts, and posts once: StrictMode's second effect run finds the ref set.
//
// The target origin is "*" because the message carries nothing sensitive; the framing page
// decides whom to believe by checking the origin and source of what it receives.
export const EmbeddedReady = (): null => {
  const posted = useRef(false)
  useEffect(() => {
    if (posted.current || window.parent === window) return
    posted.current = true
    window.parent.postMessage({ type: "novadeck:ready" }, "*")
  }, [])
  return null
}
