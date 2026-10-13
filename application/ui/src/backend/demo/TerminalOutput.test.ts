import { createElement } from "react"
import { afterEach } from "vitest"

import type { TerminalMetadata } from "../../model/types"
import { describe, expect, it } from "../../test"
import { render, type Rendered } from "../../test/render"
import { createMockTerminal } from "./samples"
import { TerminalOutput } from "./TerminalOutput"

const mounted: Rendered[] = []
afterEach(() => mounted.splice(0).forEach((view) => view.unmount()))

const claude = (planning: boolean): TerminalMetadata => ({
  ...createMockTerminal({ projectId: "p", workspaceSessionId: "s" }, 1, "~/p"),
  id: "01",
  process: "claude",
  state: "running",
  agent: { working: true, ...(planning ? { planning: true as const } : {}) },
})
const show = (terminal: TerminalMetadata) =>
  createElement(TerminalOutput, { terminal, projectName: "p" })

describe("terminal output", () => {
  it("opens a planning agent with its plan request", () => {
    const view = render(show(claude(true)))
    mounted.push(view)
    expect(view.container.textContent).toContain("Plan a compact order summary")
  })

  it("leaves the agent's intro as it opened when plan mode toggles", () => {
    const view = render(show(claude(false)))
    mounted.push(view)
    expect(view.container.textContent).toContain("Add a compact order summary")
    view.rerender(show(claude(true)))
    expect(view.container.textContent).toContain("Add a compact order summary")
    expect(view.container.textContent).not.toContain("Plan a compact order summary")
  })

  it("keeps a planning intro when plan mode ends", () => {
    const view = render(show(claude(true)))
    mounted.push(view)
    view.rerender(show(claude(false)))
    expect(view.container.textContent).toContain("Plan a compact order summary")
  })
})
