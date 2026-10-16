import { afterEach, describe as context, describe, expect, it } from "vitest"
import { page, type Locator } from "vitest/browser"

import { notification, openWorkspace, sidebarPanel, chooseView } from "./support/workspace"

// The agents demo: a moment after it opens, design-system's agent finishes its turn while the
// person looks at storefront. Murmur's offer is a chip beside that terminal's title, so the
// specs go to it from the notification.
const openAgents = async (murmur: string): Promise<void> => {
  await openWorkspace(`/?demo=agents&murmur=${murmur}`)
  const skip = page.getByRole("button", { name: "Skip for now" })
  if (await skip.query()) await skip.click()
}

const chip = (): Locator => page.getByRole("button", { name: "Name it for me" })
const popover = (): Locator =>
  page.getByRole("dialog", { name: "Name terminals from what they do" })
const footerItem = (): Locator => page.getByRole("button", { name: /Setting up Murmur/ })
const doneItem = (): Locator => page.getByRole("button", { name: "Terminals name themselves now" })

// Goes to the terminal whose agent finished, where the chip waits.
const goToFinished = async (): Promise<void> => {
  await sidebarPanel("Notifications").click()
  await expect.element(notification("design-system"), { timeout: 10_000 }).toBeVisible()
  // Past the moment an Escape could still turn the finish into an interruption.
  await new Promise((resolve) => setTimeout(resolve, 1200))
  await notification("design-system")
    .getByRole("button", { name: /^Go to / })
    .click()
}

const preferencesMurmur = async (): Promise<Locator> => {
  await page.getByRole("button", { name: "Workspace preferences" }).click()
  await page.getByRole("tab", { name: "Addons" }).click()
  return page.getByRole("region", { name: "Murmur" })
}

describe("Murmur's one-time offer", () => {
  context("when the first agent finishes and Murmur is not on the computer", () => {
    it("puts a chip beside that terminal's title, with no ×", async () => {
      await openAgents("uninstalled")
      await goToFinished()

      await expect.element(chip()).toBeVisible()
      await expect.element(chip()).toHaveTextContent("Name it for me")
      // Ignoring it is fine: it has no close of its own.
      await expect
        .element(page.getByRole("button", { name: /^Close Name it/ }))
        .not.toBeInTheDocument()
    })

    it("opens a popover with the size and the answers, and Esc only dismisses it", async () => {
      await openAgents("uninstalled")
      await goToFinished()
      await chip().click()

      await expect.element(popover()).toBeVisible()
      await expect
        .element(
          popover().getByText(
            "A small model on this computer reads the agent's work and names each terminal. 1.2 GB once.",
          ),
        )
        .toBeVisible()
      await expect.element(popover().getByText(/Preferences → Addons/)).toBeVisible()
      await expect.element(popover().getByRole("button", { name: "No thanks" })).toBeVisible()
      await expect.element(popover().getByRole("button", { name: "Turn on" })).toBeVisible()

      await page.getByRole("dialog", { name: "Name terminals from what they do" }).click()
      await document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await expect.element(popover()).not.toBeInTheDocument()
      // A dismiss, not a decline: the chip stays and Murmur is still wanted.
      await expect.element(chip()).toBeVisible()
      const card = await preferencesMurmur()
      await expect
        .element(card.getByRole("switch", { name: "Enabled" }))
        .toHaveAttribute("aria-checked", "true")
    })

    it("turns on into the footer item, then says it is done, and the chip is gone", async () => {
      await openAgents("uninstalled")
      await goToFinished()
      await chip().click()
      await popover().getByRole("button", { name: "Turn on" }).click()

      await expect.element(popover()).not.toBeInTheDocument()
      await expect.element(chip()).not.toBeInTheDocument()
      await expect.element(footerItem()).toBeVisible()
      await expect.element(doneItem(), { timeout: 12_000 }).toBeVisible()
      await expect.element(doneItem(), { timeout: 10_000 }).not.toBeInTheDocument()
    })

    it("opens the item's sheet with the step, the bar and Cancel", async () => {
      await openAgents("uninstalled")
      await goToFinished()
      await chip().click()
      await popover().getByRole("button", { name: "Turn on" }).click()
      await footerItem().click()

      const sheet = page.getByRole("region", { name: "Setting up Murmur" })
      await expect.element(sheet.getByText(/Downloading/)).toBeVisible()
      await expect.element(sheet.getByRole("progressbar")).toBeVisible()
      await sheet.getByRole("button", { name: "Cancel" }).click()
      await expect.element(footerItem()).not.toBeInTheDocument()
    })

    it("turns Murmur down for good on No thanks, and Preferences shows it off", async () => {
      await openAgents("uninstalled")
      await goToFinished()
      await chip().click()
      await popover().getByRole("button", { name: "No thanks" }).click()
      await expect.element(chip()).not.toBeInTheDocument()

      const card = await preferencesMurmur()
      await expect
        .element(card.getByRole("switch", { name: "Enabled" }))
        .toHaveAttribute("aria-checked", "false")
    })

    it("shrinks to its icon in a narrow Grid tile, and the name stays", async () => {
      await openAgents("uninstalled")
      await goToFinished()
      await chooseView("Grid")

      await expect.element(chip()).toBeVisible()
      await expect.element(page.getByText("Name it for me", { exact: true })).not.toBeVisible()
      await expect
        .element(page.getByRole("heading", { name: /Checkout implementation/ }).first())
        .toBeVisible()
    })
  })

  context("when the install fails on the network", () => {
    it("turns the footer item to danger and opens its sheet once, with Try again", async () => {
      await openAgents("network-down")
      await goToFinished()
      await chip().click()
      await popover().getByRole("button", { name: "Turn on" }).click()

      const sheet = page.getByRole("region", { name: "Couldn't turn on Murmur" })
      await expect.element(sheet, { timeout: 12_000 }).toBeVisible()
      await expect.element(sheet.getByText(/connection dropped/)).toBeVisible()
      await expect.element(sheet.getByRole("button", { name: "Not now" })).toBeVisible()

      // Try again installs afresh, and the second goes through to done.
      await sheet.getByRole("button", { name: "Try again" }).click()
      await expect.element(doneItem(), { timeout: 15_000 }).toBeVisible()
    })

    it("hides the item on Not now, and it is no decline", async () => {
      await openAgents("network-down")
      await goToFinished()
      await chip().click()
      await popover().getByRole("button", { name: "Turn on" }).click()
      const sheet = page.getByRole("region", { name: "Couldn't turn on Murmur" })
      await sheet.getByRole("button", { name: "Not now" }).click({ timeout: 12_000 })

      await expect.element(sheet).not.toBeInTheDocument()
      const card = await preferencesMurmur()
      await expect
        .element(card.getByRole("switch", { name: "Enabled" }))
        .toHaveAttribute("aria-checked", "true")
    })
  })

  context("when the computer can't run Murmur", () => {
    it("never offers it when it is known not to", async () => {
      await openAgents("unsupported")
      await goToFinished()

      await expect.element(chip()).not.toBeInTheDocument()
    })

    it("says so in the footer's sheet when Turn on finds it can't, and the item leaves", async () => {
      await openAgents("no-device")
      await goToFinished()
      await chip().click()
      await popover().getByRole("button", { name: "Turn on" }).click()

      const sheet = page.getByRole("region", { name: "Not available on this computer" })
      await expect.element(sheet, { timeout: 12_000 }).toBeVisible()
      await sheet.getByText("Details").click()
      await expect.element(sheet.getByText(/graphics device/)).toBeVisible()
      await sheet.getByRole("button", { name: "Close" }).click()
      await expect.element(sheet).not.toBeInTheDocument()
      await expect
        .element(page.getByRole("button", { name: /Murmur isn't available/ }))
        .not.toBeInTheDocument()
    })
  })

  context("when Murmur is already on the computer, or the offer was shown three times", () => {
    afterEach(async () => {
      await page.viewport(1440, 900)
    })

    it("never offers it when it is installed", async () => {
      await openAgents("installed")
      await goToFinished()

      await expect.element(chip()).not.toBeInTheDocument()
    })

    it("stops offering it after three sessions", async () => {
      await openAgents("offered-out")
      await goToFinished()

      await expect.element(chip()).not.toBeInTheDocument()
    })
  })
})
