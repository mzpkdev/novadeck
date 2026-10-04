import { describe, expect, it } from "vitest"
import { page, userEvent, type Locator } from "vitest/browser"

import { openShowcase, taskbarIcon } from "./support/companions"
import { openWorkspace } from "./support/workspace"

// Moves the pointer about over `target` for `duration` milliseconds, never resting.
const sweep = async (target: Locator, duration: number): Promise<void> => {
  const element = target.element()
  const box = element.getBoundingClientRect()
  // The pointer arrives, as a mouse's would, then keeps moving.
  element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }))
  for (let elapsed = 0; elapsed < duration; elapsed += 50) {
    const x = box.left + box.width * (0.25 + ((elapsed / 50) % 2) * 0.5)
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: x,
        clientY: box.top + box.height / 2,
      }),
    )
    // eslint-disable-next-line no-await-in-loop -- Each move waits for the one before.
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describe("A tooltip", () => {
  it("waits for the pointer to rest on its trigger", async () => {
    await openWorkspace()
    const zen = page.getByRole("button", { name: "Enter Zen mode" })
    await expect.element(zen).toBeVisible()

    const tooltip = page.getByText(/^Zen · /)

    await sweep(zen, 1000)
    expect(tooltip.query()).toBeNull()

    await userEvent.hover(zen)
    await expect.element(tooltip).toBeVisible()
  })
})

describe("A peek", () => {
  it("waits for the pointer to rest on its icon", async () => {
    await openShowcase()
    const icon = taskbarIcon("Build Studio", "2 images")
    await expect.element(icon).toBeVisible()
    const card = page.getByRole("button", { name: /^about\.png/ })

    await sweep(icon, 800)
    expect(card.query()).toBeNull()

    await userEvent.hover(icon)
    await expect.element(card).toBeVisible()
  })
})
