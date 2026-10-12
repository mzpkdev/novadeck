import { afterEach, describe as context, describe, expect, it } from "vitest"
import { cleanup } from "vitest-browser-react"
import { page, type Locator } from "vitest/browser"

import { expectStaysAbsent, openWorkspace, press } from "./support/workspace"

// The version whose notice came up last, as the app keeps it between launches.
const seenKey = "novadeck.update-seen"

// The footer's chips come before the panel in the page, which has its own buttons.
const install = (): Locator =>
  page.getByRole("button", { name: "Install Novadeck", exact: true }).first()
const update = (): Locator => page.getByRole("button", { name: /^Update available:/ }).first()
const sandbox = (): Locator => page.getByRole("button", { name: /^No sandbox:/ })
const quiet = (): Locator => page.getByRole("region", { name: "Install Novadeck" })
const offered = (): Locator => page.getByRole("region", { name: "Novadeck 0.0.80 is available" })
const later = (panel: Locator): Locator => panel.getByRole("button", { name: "Later" })
const primary = (panel: Locator): Locator => panel.getByRole("button", { name: "Install Novadeck" })

describe("a portable copy's install entry", () => {
  afterEach(() => page.viewport(1440, 900))

  it("is absent where the host has no portable copy", async () => {
    await openWorkspace()
    await expectStaysAbsent(install())
    expect(install().query()).toBeNull()
  })

  context("with no release known", () => {
    it("waits in the footer as a chip, and never opens by itself", async () => {
      await openWorkspace("/?portable=on")
      await expect.element(install()).toBeVisible()
      await expectStaysAbsent(quiet())
      expect(quiet().query()).toBeNull()
    })

    it("opens from the chip with what installing means, and closes on Later", async () => {
      await openWorkspace("/?portable=on")
      await install().click()
      await expect.element(quiet()).toBeVisible()
      await expect.element(quiet().getByText(/can't update itself/)).toBeVisible()
      await expect.element(quiet().getByText(/keeps your workspace/)).toBeVisible()
      await later(quiet()).click()
      await expect.element(quiet()).not.toBeInTheDocument()
      await expect.element(install()).toBeVisible()
    })

    it("closes on Escape from inside it, as the update notice does", async () => {
      await openWorkspace("/?portable=on")
      await install().click()
      await expect.element(quiet()).toHaveFocus()
      await press("{Escape}")
      await expect.element(quiet()).not.toBeInTheDocument()
      await expect.element(install()).toHaveFocus()
    })

    it("shortens to Install on a narrow bar", async () => {
      await page.viewport(600, 800)
      await openWorkspace("/?portable=on")
      await expect.element(install().getByText("Install", { exact: true })).toBeVisible()
      await expect
        .element(install().getByText("Install Novadeck", { exact: true }))
        .not.toBeVisible()
    })

    it("says nothing of the sandbox where the host runs sandboxed", async () => {
      await openWorkspace("/?portable=on")
      await install().click()
      await expect.element(quiet().getByText(/sandbox/)).not.toBeInTheDocument()
    })
  })

  context("while installing", () => {
    it("shows Installing… disabled once Install Novadeck is pressed, and does nothing more", async () => {
      await openWorkspace("/?portable=on")
      await install().click()
      await primary(quiet()).click()
      await expect.element(quiet()).not.toBeInTheDocument()
      const installing = page.getByRole("button", {
        name: /^Install Novadeck$/,
      })
      await expect.element(installing).toBeDisabled()
      await expect.element(installing).toHaveTextContent("Installing…")
      await expectStaysAbsent(quiet())
    })

    it("says a newer Novadeck is installed, and offers to open it", async () => {
      await openWorkspace("/?portable=on&install=newer")
      await install().click()
      await primary(quiet()).click()
      const newer = page.getByRole("region", {
        name: "Novadeck 0.0.99 is already installed",
      })
      await expect.element(newer).toBeVisible()
      await expect.element(newer.getByRole("button", { name: "Open Novadeck" })).toBeVisible()
      await expect.element(primary(newer)).not.toBeInTheDocument()
      await newer.getByRole("button", { name: "Open Novadeck" }).click()
      await expect.element(newer).not.toBeInTheDocument()
    })

    it("says why it failed and keeps Install Novadeck to try again", async () => {
      await openWorkspace("/?portable=on&install=failed")
      await install().click()
      await primary(quiet()).click()
      await expect
        .element(quiet().getByRole("alert"))
        .toHaveTextContent("Could not install Novadeck: There is no space left.")
      await primary(quiet()).click()
      await expect
        .element(quiet().getByRole("alert"))
        .toHaveTextContent("Could not install Novadeck: There is no space left.")
    })
  })
})

describe("a portable copy with a release waiting", () => {
  it("turns the chip to Update available and raises the notice, with Install Novadeck", async () => {
    await openWorkspace("/?portable=on&update=available&released=recent")
    await expect.element(offered()).toBeVisible()
    await expect.element(offered().getByText(/can't update itself/)).toBeVisible()
    await expect.element(primary(offered())).toBeVisible()
    await expect.element(offered().getByRole("button", { name: "Release notes" })).toBeVisible()
    await expect
      .element(offered().getByRole("button", { name: "Download" }))
      .not.toBeInTheDocument()
    await expect.element(update()).toBeVisible()
  })

  it("raises the notice once per version while the release is recent", async () => {
    await openWorkspace("/?portable=on&update=available&released=recent")
    await expect.element(offered()).toBeVisible()
    await later(offered()).click()
    await expect.poll(() => localStorage.getItem(seenKey)).toBe("available:0.0.80")
    await cleanup()
    await openWorkspace("/?portable=on&update=available&released=recent")
    await expect.element(update()).toBeVisible()
    await expectStaysAbsent(offered())
  })

  it("raises the notice at every launch once the release is 14 days old", async () => {
    localStorage.setItem(seenKey, "available:0.0.80")
    await openWorkspace("/?portable=on&update=available&released=old")
    await expect.element(offered()).toBeVisible()
  })

  it("treats a release with no date as not stale", async () => {
    localStorage.setItem(seenKey, "available:0.0.80")
    await openWorkspace("/?portable=on&update=available")
    await expect.element(update()).toBeVisible()
    await expectStaysAbsent(offered())
  })

  it("installs from the notice", async () => {
    await openWorkspace("/?portable=on&update=available&released=recent")
    await primary(offered()).click()
    await expect.element(offered()).not.toBeInTheDocument()
    await expect.element(update()).toBeDisabled()
    await expect.element(update()).toHaveTextContent("Installing…")
  })
})

describe("the sandbox chip on a portable copy", () => {
  it("is not shown, and the install panel says what installing allows", async () => {
    await openWorkspace("/?portable=on&sandbox=off")
    await expect.element(install()).toBeVisible()
    await expectStaysAbsent(sandbox())
    expect(sandbox().query()).toBeNull()
    await install().click()
    await expect.element(quiet().getByText(/turn on the sandbox/)).toBeVisible()
  })

  it("is shown again on an installed copy", async () => {
    await openWorkspace("/?sandbox=off")
    await expect.element(sandbox()).toBeVisible()
  })
})
