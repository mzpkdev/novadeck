import { createBootRehearsals } from "../backend/boot-rehearsal"
import { createDemoBackend } from "../backend/demo"
import { createContentDemo } from "../backend/demo/content"
import type { BackendSelection, ConnectBackend } from "../backend/port"

// The only place that chooses a backend adapter. Tests and specs run on the demo;
// every build, development or production, connects to a runner, whose client and
// terminal emulator load with the connection instead of the entry point. The content
// preview connects to the demo, with its debug panel.
const runnerSelection = (): BackendSelection => ({
  connect: async (signal, progress) =>
    (await import("../backend/runner")).connectRunnerBackend(signal, progress),
})

// The content preview's demo, with its debug panel, loads with the connection too, so
// no build for a runner carries it.
const demoSelection = (): BackendSelection => {
  const rehearsals = createBootRehearsals()
  // Made once it loads, as it remembers the variant and what the panel armed; a load
  // that failed is tried again by the next attempt.
  let connect: ConnectBackend | undefined
  return {
    connect: async (signal, progress) => {
      connect ??= (await import("../backend/demo/debug/connect")).connectDemo(rehearsals)
      return connect(signal, progress)
    },
    reboots: rehearsals.reboots,
  }
}

// Specs open the content demo, with its agents' plans and artifacts, by adding
// `?demo=showcase` to the address's hash. The address is read when the workspace
// mounts, since each spec sets its own.
const showcaseRequested = (): boolean =>
  new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("demo") === "showcase"

export const selectBackend: BackendSelection =
  import.meta.env.MODE === "content-preview"
    ? demoSelection()
    : import.meta.env.MODE === "test"
      ? { createBackend: () => (showcaseRequested() ? createContentDemo() : createDemoBackend()) }
      : runnerSelection()
