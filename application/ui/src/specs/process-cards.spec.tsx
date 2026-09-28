import { describe, expect, it } from "vitest"

import { headerAction, headerName } from "./support/terminals"
import { chooseView, commandInput, openWorkspace, terminal, terminalTab } from "./support/workspace"

const agents = [
  { name: "Checkout implementation", kind: "claude" },
  { name: "Checkout review", kind: "codex" },
] as const

describe("process window cards", () => {
  it.each(agents)(
    "gives $kind its own terminal card with input and controls in every layout",
    async ({ name, kind }) => {
      await openWorkspace("/projects/storefront/sessions/initial/grid?demo=agents")

      await expect.element(terminal(name)).toHaveAttribute("data-process-card", kind)
      await expect.element(headerName(name)).toBeVisible()
      await expect.element(headerAction(name, `Close ${name}`)).toBeVisible()
      await expect.element(commandInput(name)).toBeVisible()
      await commandInput(name).fill(`Draft for ${kind}`)
      await expect.element(terminal("Dev server")).not.toHaveAttribute("data-process-card")

      await chooseView("Canvas")
      await terminalTab(name).click()
      await expect.element(terminal(name)).toHaveAttribute("data-process-card", kind)
      await expect.element(commandInput(name)).toHaveValue(`Draft for ${kind}`)
      await headerAction(name, `Minimize ${name}`).click()
      await expect.element(commandInput(name)).not.toBeInTheDocument()
      await headerAction(name, `Restore ${name}`).click()
      await expect.element(commandInput(name)).toBeVisible()

      await chooseView("Focus")
      await expect.element(terminal(name)).toHaveAttribute("data-process-card", kind)
      await expect.element(headerName(name)).toBeVisible()
      await expect.element(commandInput(name)).toHaveValue(`Draft for ${kind}`)
      await expect.element(headerAction(name, "Open in Canvas")).toBeVisible()
    },
  )
})
