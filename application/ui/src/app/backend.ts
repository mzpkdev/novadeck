import { createDemoBackend } from "../backend/demo"
import { createContentDemo } from "../backend/demo/content"
import { createDemoConnection } from "../backend/demo/debug/connect"
import type { BackendSelection } from "../backend/port"

// The only place that chooses a backend adapter. Tests and specs run on the demo;
// every build, development or production, connects to a runner, whose client and
// terminal emulator load with the connection instead of the entry point. The content
// preview connects to the demo, with its debug panel.
const runnerSelection = (): BackendSelection => ({
  connect: async (signal, progress) =>
    (await import("../backend/runner")).connectRunnerBackend(signal, progress),
})

// Specs open the content demo, with its agents' plans and artifacts, by adding
// `?demo=showcase` to the address's hash. The address is read when the workspace
// mounts, since each spec sets its own.
const showcaseRequested = (): boolean =>
  new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("demo") === "showcase"

export const selectBackend: BackendSelection =
  import.meta.env.MODE === "content-preview"
    ? createDemoConnection()
    : import.meta.env.MODE === "test"
      ? { createBackend: () => (showcaseRequested() ? createContentDemo() : createDemoBackend()) }
      : runnerSelection()
