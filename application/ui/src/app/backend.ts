import { createDemoBackend } from "../backend/demo"
import type { BackendSelection } from "../backend/port"

// The only place that chooses a backend adapter. Tests and specs run on the demo;
// every build, development or production, connects to a runner, whose client and
// terminal emulator load with the connection instead of the entry point.
export const selectBackend: BackendSelection =
  import.meta.env.MODE === "test"
    ? { createBackend: createDemoBackend }
    : {
        connect: async (signal, progress) =>
          (await import("../backend/runner")).connectRunnerBackend(signal, progress),
      }
