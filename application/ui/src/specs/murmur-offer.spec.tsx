import { afterEach, describe as context, describe, expect, it } from "vitest"
import { page, type Locator } from "vitest/browser"

import { notification, openWorkspace, sidebarPanel } from "./support/workspace"

// The agents demo: a moment after it opens, design-system's agent finishes its turn while
// the person looks at storefront. Murmur's offer rides on that first finish.
const openAgents = async (murmur: string): Promise<void> => {
  await openWorkspace(`/?demo=agents&murmur=${murmur}`)
  const skip = page.getByRole("button", { name: "Skip for now" })
  if (await skip.query()) await skip.click()
}

// Murmur's card in the corner, whatever the offer has turned into: the offer, the install
// under way, the done note, or the failure.
const card = (): Locator =>
  page
    .getByRole("region")
    .filter({ hasText: /name themselves|Getting Murmur ready|turn on Murmur/ })

const offer = (): Locator => card().filter({ hasText: /Want your terminals/ })

const finished = async (): Promise<void> => {
  await sidebarPanel("Notifications").click()
  await expect.element(notification("design-system"), { timeout: 10_000 }).toBeVisible()
  // Past the moment an Escape could still turn the finish into an interruption.
  await new Promise((resolve) => setTimeout(resolve, 1200))
}

describe("Murmur's one-time offer", () => {
  context("when the first agent finishes and Murmur is not on the computer", () => {
    it("comes up in the corner without taking focus, saying what it downloads", async () => {
      await openAgents("uninstalled")

      await expect
        .element(offer().getByText("Want your terminals to name themselves?"), { timeout: 10_000 })
        .toBeVisible()
      await expect
        .element(offer().getByText(/A small model on this computer .* Downloads 1\.2 GB once\./))
        .toBeVisible()
      await expect.element(offer().getByText(/Preferences → Addons/)).toBeVisible()
      await expect.element(offer().getByText(/GPU/)).not.toBeInTheDocument()
      expect(offer().element().contains(document.activeElement)).toBe(false)
    })

    it("turns on with progress, says it is done, and goes by itself", async () => {
      await openAgents("uninstalled")
      await offer().getByRole("button", { name: "Turn on" }).click({ timeout: 10_000 })

      await expect.element(card().getByRole("progressbar")).toBeVisible()
      await expect.element(card().getByText(/Downloading/)).toBeVisible()
      await expect
        .element(card().getByText("Your terminals name themselves now."), { timeout: 10_000 })
        .toBeVisible()
      await expect
        .element(card().getByText("Your terminals name themselves now."), { timeout: 10_000 })
        .not.toBeInTheDocument()
    })

    it("turns Murmur down for good on No thanks, and Preferences shows it off", async () => {
      await openAgents("uninstalled")
      await offer().getByRole("button", { name: "No thanks" }).click({ timeout: 10_000 })
      await expect.element(offer()).not.toBeInTheDocument()

      await page.getByRole("button", { name: "Workspace preferences" }).click()
      await page.getByRole("tab", { name: "Addons" }).click()
      const murmurCard = page.getByRole("region", { name: "Murmur" })
      await expect
        .element(murmurCard.getByRole("switch", { name: "Enabled" }))
        .toHaveAttribute("aria-checked", "false")
    })

    it("turns Murmur down for good on its close button too", async () => {
      await openAgents("uninstalled")
      await offer().getByRole("button", { name: "Close" }).click({ timeout: 10_000 })
      await expect.element(offer()).not.toBeInTheDocument()

      await page.getByRole("button", { name: "Workspace preferences" }).click()
      await page.getByRole("tab", { name: "Addons" }).click()
      await expect
        .element(
          page.getByRole("region", { name: "Murmur" }).getByRole("switch", { name: "Enabled" }),
        )
        .toHaveAttribute("aria-checked", "false")
    })
  })

  context("on a page narrower than 1400px, where it must stay clear of the composer", () => {
    afterEach(async () => {
      await page.viewport(1440, 900)
    })

    it("keeps to a short card that still says it runs here and what it downloads", async () => {
      await page.viewport(1200, 900)
      await openAgents("uninstalled")

      await expect.element(offer().getByText("Runs on this computer \u00b7 1.2 GB")).toBeVisible()
      await expect.element(offer().getByText(/Downloads 1\.2 GB once/)).not.toBeVisible()
      await expect.element(offer().getByRole("button", { name: "Turn on" })).toBeVisible()
    })

    it("keeps its buttons at the right edge on every card, as on the install's", async () => {
      await page.viewport(1200, 900)
      await openAgents("uninstalled")
      await offer().getByRole("button", { name: "Turn on" }).click({ timeout: 10_000 })

      const cancel = card().getByRole("button", { name: "Cancel" })
      await expect.element(cancel).toBeVisible()
      const box = card().element().getBoundingClientRect()
      const button = cancel.element().getBoundingClientRect()
      // Its right edge is the card's, less the padding.
      expect(box.right - button.right).toBeLessThan(24)
    })
  })

  context("when the footer's update notice is open", () => {
    it("sits beside it, not over it", async () => {
      await openAgents("uninstalled&update=ready")
      await expect.element(offer(), { timeout: 10_000 }).toBeVisible()
      const notice = page.getByText("Novadeck 0.0.80 is ready")
      await expect.element(notice).toBeVisible()

      const cardBox = offer().element().getBoundingClientRect()
      const panel = notice.element().closest(".update-panel")!.getBoundingClientRect()
      expect(cardBox.right).toBeLessThanOrEqual(panel.left)
    })
  })

  context("when the computer can't run Murmur", () => {
    it("never comes up when it is known not to", async () => {
      await openAgents("unsupported")
      await finished()

      await expect.element(offer()).not.toBeInTheDocument()
    })

    it("leaves for good when Turn on finds the computer can't", async () => {
      await openAgents("no-device")
      await offer().getByRole("button", { name: "Turn on" }).click({ timeout: 10_000 })

      await expect.element(card().getByRole("progressbar")).toBeVisible()
      await expect.element(card(), { timeout: 10_000 }).not.toBeInTheDocument()
      await expect.element(page.getByText("Couldn't turn on Murmur")).not.toBeInTheDocument()
    })
  })

  context("when Murmur is already on the computer", () => {
    it("never comes up", async () => {
      await openAgents("installed")
      await finished()

      await expect.element(offer()).not.toBeInTheDocument()
    })
  })
})
