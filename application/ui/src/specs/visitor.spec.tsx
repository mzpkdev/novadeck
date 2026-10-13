import { afterEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { openWorkspace, press } from "./support/workspace"

// The website's demo, as far as the app's own parts of it go.
const openVisitor = async (): Promise<void> => {
  await openWorkspace("/?visitor=on")
}

const panel = () => page.getByRole("region", { name: "Best on a desktop browser" })
const download = () => panel().getByRole("link", { name: "Download Novadeck" })
const card = () => page.getByRole("region", { name: "Things to try" })

describe("the visitor build", () => {
  afterEach(() => page.viewport(1440, 900))

  it("keeps focus on the page when the things to try are dismissed", async () => {
    await openVisitor()
    await card().getByRole("button", { name: "Dismiss the things to try" }).click()
    await expect.element(card()).not.toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
  })

  it("closes the card from inside it with Escape", async () => {
    await openVisitor()
    card().getByRole("button", { name: "Dismiss the things to try" }).element().focus()
    await press("{Escape}")
    await expect.element(card()).not.toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
  })

  it("leaves nothing of the app to reach under the phone panel", async () => {
    await page.viewport(390, 800)
    await openVisitor()
    await expect.element(panel()).toBeVisible()
    const preferences = page.getByRole("button", { name: "Workspace preferences" }).element()
    expect(preferences.closest("[inert]")).not.toBeNull()
    await press("{Tab}")
    await expect.element(download()).toHaveFocus()
    await press("{Tab}")
    expect(document.activeElement?.closest("[inert]") ?? null).toBeNull()
    expect(document.activeElement).not.toBe(preferences)
  })
})
