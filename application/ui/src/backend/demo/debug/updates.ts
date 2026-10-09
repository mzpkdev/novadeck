import type { DemoStates } from "./types"

// The browser's stand-in for the desktop app's self-updates: `offer` has a version
// downloaded, which listeners hear at once if they come later and again for each newer
// one, and `install` restarts as the app does, which here is a reload that forgets the
// offer.
export const createDemoUpdates = (
  restart: () => void = () => window.location.reload(),
): { readonly updates: DemoStates["updates"]; readonly offer: (version: string) => void } => {
  let waiting: string | undefined
  const listeners = new Set<(version: string) => void>()
  return {
    updates: {
      onReady: (listener) => {
        listeners.add(listener)
        if (waiting !== undefined) listener(waiting)
        return () => void listeners.delete(listener)
      },
      install: () => {
        if (waiting !== undefined) restart()
      },
    },
    offer: (version) => {
      waiting = version
      listeners.forEach((listener) => listener(version))
    },
  }
}
