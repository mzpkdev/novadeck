import { describe, expect, it, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { commands, server } from "vitest/browser"

import { App } from "../../app/App"
import { scriptedRunner } from "../../backend/runner/scripted"
import { chooseView, layoutSettled } from "../support/workspace"
import { startClock } from "./clock"
import { counts, observeMutations } from "./probes"
import { playScript } from "./script"

// React reports commits to a DevTools hook only if one is there before react-dom loads.
await vi.hoisted(async () => (await import("./probes")).installRenderCount())
// Every store counts the listeners it wakes.
vi.mock("../../model/store", async (importOriginal) =>
  (await import("./probes")).countedStores(await importOriginal<Record<string, unknown>>()),
)

// Where the run leaves its reading, for the gate and for comparing runs.
const readingPath = `${server.config.root}/test-results/counters.json`

// Fonts load in real time; loaded first, terminals measure their cells the same way
// every run.
const loadFonts = async (): Promise<void> => {
  await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
  await document.fonts.ready
}

// The views' code loads when a view first shows, in real time. A warm-up on the real clock
// shows each view the script does, so in the run their code is there at once, whatever the
// machine's speed; then the page starts over, as the run expects.
const warmUp = async (): Promise<void> => {
  const connection = await scriptedRunner({ terminals: 13 }).connect(new AbortController().signal)
  await render(<App createBackend={connection.createBackend} />)
  await layoutSettled()
  await chooseView("Focus")
  await cleanup()
  connection.close()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, "", "/")
}

describe("Counter run", () => {
  it("counts what 13 busy agents cost the UI", async () => {
    await loadFonts()
    await warmUp()
    const runner = scriptedRunner({ terminals: 13 })
    const stopMutations = observeMutations()
    const clock = startClock(() => counts.commits + counts.mutations)
    const connecting = new AbortController()
    try {
      // The app connects and loads the workspace on the clock, as everything after does.
      const connection = await clock.until(runner.connect(connecting.signal))
      // Rendering takes its own `act`; the clock's frames then let the app settle.
      await render(<App createBackend={connection.createBackend} />)
      await clock.frames(60)
      const names = runner.terminalIds.map((_, index) => `Agent ${index + 1}`)
      const reading = await playScript(runner, clock, { terminalNames: names })
      await commands.writeFile(readingPath, `${JSON.stringify(reading, null, 2)}\n`)
      console.log(JSON.stringify(reading))
      // Grid shows every terminal, so every one streams and all their output arrives.
      expect(reading.grid.streamingSettled).toBe(13)
      expect(reading.grid.bytes).toBe(reading.grid.written)
      // Focus parks what it doesn't show, so most of the output never arrives.
      expect(reading.focus.bytes).toBeLessThan(reading.focus.written)
    } finally {
      connecting.abort()
      stopMutations()
      clock.stop()
    }
  })
})
