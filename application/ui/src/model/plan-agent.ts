import { createStore } from "./store"

// Design study only: what a plan's terminal was just told. The agent's own prompt
// answers approval there; the plan preview follows along. The content-preview
// backend publishes it; nothing else does.
export type PlanTerminalInput = { readonly plan: string; readonly input: string }

export const planTerminal = createStore<PlanTerminalInput | null>(null)
