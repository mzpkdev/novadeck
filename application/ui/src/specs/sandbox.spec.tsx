import { describe as context, describe, expect, it } from "vitest"
import { page, type Locator } from "vitest/browser"

import { expectStaysAbsent, openWorkspace, press } from "./support/workspace"

const chip = (): Locator =>
  page.getByRole("button", { name: "Running without the security sandbox" })
const notice = (): Locator =>
  page.getByRole("region", { name: "Novadeck is running without its security sandbox" })

describe("the sandbox notice", () => {
  it("is absent where the host does not say", async () => {
    await openWorkspace()
    await expectStaysAbsent(chip())
    expect(chip().query()).toBeNull()
  })

  context("on a host running without its sandbox", () => {
    it("waits in the footer as a chip, and opens with the command to copy", async () => {
      await openWorkspace("/?sandbox=off")
      await expect.element(chip()).toBeVisible()
      await expect.element(notice()).not.toBeInTheDocument()
      await chip().click()
      await expect.element(notice()).toBeVisible()
      await expect.element(notice().getByText(/^sudo /)).toBeVisible()
      await expect.element(notice().getByRole("button", { name: "Copy" })).toBeVisible()
    })

    it("closes on Escape", async () => {
      await openWorkspace("/?sandbox=off")
      await chip().click()
      await expect.element(notice()).toBeVisible()
      await press("{Escape}")
      await expect.element(notice()).not.toBeInTheDocument()
    })

    it("explains without a command or a copy button when it has no fix", async () => {
      await openWorkspace("/?sandbox=off-unfixed")
      await chip().click()
      await expect.element(notice()).toBeVisible()
      await expectStaysAbsent(notice().getByRole("button", { name: "Copy" }))
    })
  })
})
