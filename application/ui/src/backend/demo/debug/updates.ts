import type { UpdateChannel, UpdateOffer } from "../../../model/update"
import type { DemoStates } from "./types"

// The browser's stand-in for the desktop app's self-updates: `offer` has an update, which
// listeners hear at once if they come later and again for each newer one. `finish` stands
// for the app coming back on the new version, a reload that forgets the offer, while one
// waits. `download` offers a version as downloading, its percent climbing until it is
// offered ready; any later offer, or a failed download, calls a running one off.
// `openPage` only counts, since a browser has no release page to open.
// The channel is remembered until the page reloads.
export const createDemoUpdates = (
  restart: () => void = () => window.location.reload(),
): {
  readonly updates: DemoStates["updates"]
  readonly offer: (offer: UpdateOffer) => void
  readonly download: (version: string, notes: readonly string[]) => void
  readonly finish: () => void
  // The download in progress, or the install on quit, failed: the update is offered as one
  // to fetch from its release page.
  readonly failInstall: () => void
  readonly channel: () => UpdateChannel
  readonly pagesOpened: () => number
} => {
  let waiting: UpdateOffer | undefined
  let channel: UpdateChannel = "stable"
  let pages = 0
  const listeners = new Set<(offer: UpdateOffer) => void>()
  let downloading: ReturnType<typeof setInterval> | undefined
  const stop = (): void => {
    clearInterval(downloading)
    downloading = undefined
  }
  const tell = (offer: UpdateOffer): void => {
    waiting = offer
    listeners.forEach((listener) => listener(offer))
  }
  return {
    updates: {
      onOffer: (listener) => {
        listeners.add(listener)
        if (waiting !== undefined) listener(waiting)
        return () => void listeners.delete(listener)
      },
      openPage: () => void (pages += 1),
      channel: {
        get: () => Promise.resolve(channel),
        set: (next) => void (channel = next),
      },
    },
    offer: (offer) => {
      stop()
      tell(offer)
    },
    download: (version, notes) => {
      stop()
      let percent = 0
      tell({ kind: "downloading", version, notes, percent })
      downloading = setInterval(() => {
        percent = Math.min(percent + downloadStep, 100)
        if (percent < 100) return tell({ kind: "downloading", version, notes, percent })
        stop()
        tell({ kind: "ready", version, notes })
      }, downloadMs)
    },
    finish: () => {
      if (waiting !== undefined) restart()
    },
    failInstall: () => {
      if (waiting === undefined) return
      stop()
      const { percent: _, ...offer } = waiting
      tell({ ...offer, kind: "available" })
    },
    channel: () => channel,
    pagesOpened: () => pages,
  }
}

// How often a demo download advances, and by how many percent.
export const downloadMs = 300
export const downloadStep = 10

// Release notes as a release's might read: a handful of lines.
export const sampleNotes: readonly string[] = [
  "Terminals keep their place when you switch projects.",
  "Grid view remembers the tiles you resized.",
  "Fixed a crash when an agent finished while the window was minimized.",
  "Faster startup on large workspaces.",
]
