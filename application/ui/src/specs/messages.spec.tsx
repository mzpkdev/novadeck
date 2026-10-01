import { describe as context, describe, expect, it } from "vitest"
import { userEvent, type Locator } from "vitest/browser"

import {
  messageItems,
  openMessages,
  openMessagesDemo,
  pauseSwitch,
  tabMenu,
  tabTooltip,
  thread,
} from "./support/messages"
import { sidebarRenameField } from "./support/terminals"
import { expectStaysAbsent, terminalTab } from "./support/workspace"

const textOf = (locator: Locator) => locator.element().textContent

const description = (name: string) => terminalTab(name).element().getAttribute("aria-description")

describe("Messages waiting for an agent", () => {
  it("count on its terminal's tab, and only those still on their way to it", async () => {
    await openMessagesDemo()
    // Codex has one message being delivered and one queued; what it sent doesn't count.
    await expect
      .poll(() => description("Checkout review"))
      .toBe("Needs permission, 2 messages waiting")
    await expect
      .element(terminalTab("Checkout review").getByText("2", { exact: true }))
      .toBeVisible()
    // The dev server's message is gone, never waiting.
    await expect.element(terminalTab("Dev server")).not.toHaveAttribute("aria-description")
  })

  it("say a release is needed when their thread is held", async () => {
    await openMessagesDemo()
    await expect
      .poll(() => description("Checkout implementation"))
      .toBe("Plan ready for review, 1 message waiting, held until you release them")
  })
})

describe("A terminal's messages", () => {
  it("list its threads, latest first, each message with its direction, time, text and state", async () => {
    await openMessagesDemo()
    const pane = await openMessages("Checkout implementation")
    const threads = pane.getByRole("region", { name: /^Thread with / })
    await expect
      .poll(() => threads.elements().map((each) => each.getAttribute("aria-label")))
      .toEqual([
        "Thread with Checkout review (t4)",
        "Thread with Tests (t3)",
        "Thread with Dev server (t2)",
      ])
    const review = messageItems(thread(pane, "Checkout review", "t4"))
    await expect.poll(() => review.elements().length).toBe(4)
    await expect.poll(() => textOf(review.nth(0))).toMatch(/^Sent to t4\d\d:\d\d.*Delivered/)
    await expect.poll(() => textOf(review.nth(1))).toMatch(/From t4/)
    await expect.poll(() => textOf(review.nth(2))).toMatch(/Delivering/)
    await expect.poll(() => textOf(review.nth(3))).toMatch(/Waiting/)
    await expect
      .poll(() => textOf(messageItems(thread(pane, "Dev server", "t2")).first()))
      .toMatch(/Not delivered/)
  })

  it("shows the agents' text as they wrote it, never formatted", async () => {
    await openMessagesDemo()
    const pane = await openMessages("Checkout implementation")
    const written = messageItems(thread(pane, "Checkout review", "t4")).nth(3)
    await expect
      .element(
        written.getByText(
          "tests/checkout/retry.test.ts covers it now; see `maxTries` and the **cap**.",
        ),
      )
      .toBeVisible()
    await expect.element(written.getByRole("strong")).not.toBeInTheDocument()
    await expect.element(written.getByRole("code")).not.toBeInTheDocument()
  })

  it("says so when an agent has had none", async () => {
    await openMessagesDemo("/projects/api-service/sessions/initial/focus")
    const pane = await openMessages("Checkout implementation")
    await expect.element(pane.getByText(/^No messages yet/)).toBeVisible()
  })

  context("in a thread held after going back and forth", () => {
    it("lets the person release it, and the tab and thread follow", async () => {
      await openMessagesDemo()
      const pane = await openMessages("Checkout implementation")
      const tests = thread(pane, "Tests", "t3")
      await expect.poll(() => textOf(messageItems(tests).last())).toMatch(/Held for release/)
      await tests.getByRole("button", { name: "Release the thread with Tests" }).click()
      await expect.poll(() => textOf(messageItems(tests).last())).toMatch(/Waiting/)
      await expect.element(tests.getByRole("button", { name: /^Release/ })).not.toBeInTheDocument()
      await expect
        .poll(() => description("Checkout implementation"))
        .toBe("Plan ready for review, 1 message waiting")
    })
  })
})

describe("Pausing messaging", () => {
  it("holds every waiting message, says so in the pane and on the tabs, and resumes", async () => {
    await openMessagesDemo()
    const pane = await openMessages("Checkout review")
    const pause = pauseSwitch(pane)
    await expect.element(pause).toHaveAttribute("aria-checked", "false")
    await pause.click()
    await expect.element(pause).toHaveAttribute("aria-checked", "true")
    await expect.poll(() => textOf(pane.getByRole("status"))).toMatch(/Messaging is paused/)
    // Codex's queued message is held; the one already being delivered goes on.
    const items = messageItems(thread(pane, "Checkout implementation", "t1"))
    await expect.poll(() => textOf(items.nth(3))).toMatch(/Held while paused/)
    await expect.poll(() => textOf(items.nth(2))).toMatch(/Delivering/)
    await expect
      .poll(() => description("Checkout review"))
      .toBe("Needs permission, 2 messages waiting, held while messaging is paused")
    await pause.click()
    await expect.poll(() => textOf(items.nth(3))).toMatch(/Waiting/)
    await expect.element(pane.getByRole("status")).not.toBeInTheDocument()
    await expect
      .poll(() => description("Checkout review"))
      .toBe("Needs permission, 2 messages waiting")
  })
})

describe("Who named a terminal", () => {
  it("shows in its tab's tooltip", async () => {
    await openMessagesDemo()
    await expect.poll(() => tabTooltip("Checkout implementation")).toMatch(/\nNamed by you\n/)
    expect(tabTooltip("Checkout review")).toMatch(/\nNamed by the agent in t1\n/)
    expect(tabTooltip("Tests")).toMatch(/\nNamed after its first prompt\n/)
  })

  it("can be handed back to NovaDeck from the tab's menu when the person named it", async () => {
    await openMessagesDemo()
    const menu = await tabMenu("Checkout implementation")
    await menu.getByRole("menuitem", { name: "Reset to automatic" }).click()
    await expect.element(terminalTab("Checkout flow")).toBeVisible()
    await expect.poll(() => tabTooltip("Checkout flow")).toMatch(/\nNamed by the agent in t1\n/)
    // A name NovaDeck gave has nothing to hand back.
    const automatic = await tabMenu("Checkout flow")
    await expect.element(automatic.getByRole("menuitem", { name: "Rename" })).toBeVisible()
    await expectStaysAbsent(automatic.getByRole("menuitem", { name: "Reset to automatic" }))
  })

  it("is the person's once they rename it", async () => {
    await openMessagesDemo()
    const menu = await tabMenu("Checkout review")
    await expect
      .element(menu.getByRole("menuitem", { name: "Reset to automatic" }))
      .not.toBeInTheDocument()
    await menu.getByRole("menuitem", { name: "Rename" }).click()
    // The menu closes and hands focus to the tab's name field.
    await expect.element(sidebarRenameField("Checkout review")).toHaveFocus()
    await userEvent.keyboard("Review{Enter}")
    await expect.poll(() => tabTooltip("Review")).toMatch(/\nNamed by you\n/)
  })
})
