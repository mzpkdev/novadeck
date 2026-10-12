import type { AgentSurface } from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"

// Novadeck as an agent sees it: MCP tools, hooks, the harness contract and its adapters.
export const extractAgents = (_repo: string, _anchors: Anchors): AgentSurface => ({
  tools: [],
  hooks: [],
  contract: [],
  harnesses: [],
})
