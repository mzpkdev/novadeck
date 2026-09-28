import { createStore } from "../../model/store"
import type { Backend, CreateBackend } from "../port"
import { createDemoTerminal } from "./DemoTerminal"
import { createDemoEngine, type DemoEngine } from "./engine"
import { createMockTerminal, demoSeed } from "./samples"

// A self-contained backend with sample projects and simulated terminals. It keeps no
// transcripts, but its setting switches like the runner's.
export const demoBackend = (engine: DemoEngine): Backend => {
  const transcripts = createStore(true)
  return {
    seed: demoSeed(Date.now()),
    newTerminal: ({ number, directory }) => createMockTerminal(number, directory),
    commit: engine.reconcile,
    TerminalSurface: createDemoTerminal(engine),
    transcripts: { enabled: transcripts, set: (enabled) => transcripts.update(() => enabled) },
  }
}

export const createDemoBackend: CreateBackend = () => {
  const agents = new URLSearchParams(window.location.hash.split("?")[1]).get("demo") === "agents"
  const engine = createDemoEngine()
  const backend = demoBackend(engine)
  return agents ? { ...backend, seed: demoSeed(Date.now(), true) } : backend
}
