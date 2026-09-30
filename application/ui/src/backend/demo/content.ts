import { gridColumns } from "../../model/layout/grid-placement"
import { planTerminal } from "../../model/plan-agent"
import { createTerminalState } from "../../model/state"
import type { CanvasLayout, GridBreakpoint, GridLayouts, TerminalMetadata } from "../../model/types"
import type { CreateBackend } from "../port"
import { createDemoEngine, type DemoEngine } from "./engine"
import { demoBackend } from "./index"

// A UI-only workspace. The previews never start processes or request a runner.
export const createContentDemo: CreateBackend = () => {
  const terminals: TerminalMetadata[] = [
    {
      id: "01",
      name: "Build Studio",
      command: "codex",
      process: "codex",
      state: "running",
      directory: "~/projects/studio",
      plan: "studio",
    },
    {
      id: "03",
      name: "Refactor auth",
      command: "claude",
      process: "claude",
      state: "running",
      directory: "~/projects/studio",
      plan: "auth",
    },
    {
      id: "02",
      name: "Dev server",
      command: "pnpm dev",
      process: "vite",
      state: "running",
      directory: "~/projects/studio",
    },
  ]
  const canvasLayout: CanvasLayout = {
    minimized: {},
    geometry: Object.fromEntries(
      terminals.map((terminal, index) => [
        terminal.id,
        {
          // One column, so a plan attached beside a node covers none of the others.
          position: { x: 40, y: 40 + index * 620 },
          width: 640,
          height: 560,
        },
      ]),
    ),
  }
  const gridLayouts: GridLayouts = Object.fromEntries(
    Object.entries(gridColumns).map(([breakpoint, columns]) => {
      const count = breakpoint === "mobile" ? 1 : 2
      return [
        breakpoint as GridBreakpoint,
        terminals.map((terminal, index) => ({
          i: terminal.id,
          x: (index % count) * (columns / count),
          y: Math.floor(index / count) * 24,
          w: columns / count,
          h: 24,
          minW: 4,
          minH: 10,
        })),
      ]
    }),
  )
  // The agents' own prompts answer approval in their terminals; the plan preview
  // follows what each plan's terminal is told.
  const plans = new Map(
    terminals.flatMap((terminal) => (terminal.plan ? [[terminal.id, terminal.plan]] : [])),
  )
  const base = createDemoEngine()
  const engine: DemoEngine = {
    ...base,
    run: (key, command) => {
      base.run(key, command)
      const plan = plans.get(key.terminalId)
      if (plan && command.trim()) planTerminal.update(() => ({ plan, input: command }))
    },
  }
  return {
    ...demoBackend(engine),
    seed: {
      projects: [
        {
          id: "studio",
          name: "studio",
          directory: "~/projects/studio",
          sessions: [
            {
              id: "initial",
              name: "Content previews",
              terminals,
              restored: createTerminalState(terminals, "focus", "grid", {
                canvasLayout,
                gridLayouts,
              }),
            },
          ],
        },
      ],
    },
  }
}
