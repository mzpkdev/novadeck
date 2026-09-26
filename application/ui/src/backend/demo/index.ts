import type { CreateBackend } from "../port"
import { createDemoTerminal } from "./DemoTerminal"
import { createDemoEngine } from "./engine"
import { createMockTerminal, demoSeed } from "./samples"

// A self-contained backend with sample projects and simulated terminals.
export const createDemoBackend: CreateBackend = () => {
  const engine = createDemoEngine()
  return {
    seed: demoSeed(Date.now()),
    newTerminal: ({ number, directory }) => createMockTerminal(number, directory),
    commit: engine.reconcile,
    TerminalSurface: createDemoTerminal(engine),
  }
}
