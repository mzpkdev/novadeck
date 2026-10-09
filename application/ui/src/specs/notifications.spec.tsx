import { describe as context, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { workspaceSwitcher } from "./support/sessions"
import {
  terminal,
  notification,
  notifications,
  openWorkspace,
  sidebarPanel,
} from "./support/workspace"

// The agents demo: docs-site's agent asks a question, and a moment after it opens
// design-system's finishes, done, and infra's fails, while the person looks at storefront.
const openNotifications = async (): Promise<void> => {
  await openWorkspace("/?demo=agents")
  const skip = page.getByRole("button", { name: "Skip for now" })
  if (await skip.query()) await skip.click()
  await sidebarPanel("Notifications").click()
}

const markAllRead = () => page.getByRole("button", { name: "Mark all read" })

describe("The notification center", () => {
  context("when no agent asks for the person", () => {
    it("says so", async () => {
      await openWorkspace()
      await sidebarPanel("Notifications").click()

      await expect.element(page.getByText("Nothing needs you.")).toBeVisible()
      await expect.element(markAllRead()).not.toBeInTheDocument()
    })
  })

  context("when an agent in another project asks a question", () => {
    it("lists it with where it is, and shows it on a click", async () => {
      await openNotifications()
      const row = notification("docs-site")

      await expect.element(row.getByText("Asks a question")).toBeVisible()
      await row.getByRole("button").click()

      await expect.element(workspaceSwitcher()).toHaveTextContent("docs-site")
      await expect.element(terminal("Checkout implementation")).toBeVisible()
      // It waits until its agent is answered, however often it is looked at.
      await expect.element(notification("docs-site")).toBeVisible()
    })
  })

  context("when an agent finishes elsewhere", () => {
    it("lists a done and a failed finish, each until the person looks at it", async () => {
      await openNotifications()
      const done = notification("design-system")
      const failed = notification("infra")

      await expect.element(done.getByText("Done · reply unread"), { timeout: 10_000 }).toBeVisible()
      await expect
        .element(failed.getByText("Stopped with an error · reply unread"), { timeout: 10_000 })
        .toBeVisible()
      await done.getByRole("button", { name: /^Go to / }).click()

      await expect.element(workspaceSwitcher()).toHaveTextContent("design-system")
      await expect.element(done).not.toBeInTheDocument()
      await expect.element(failed).toBeVisible()
    })

    it("clears one when dismissed, and keeps the rest", async () => {
      await openNotifications()
      const done = notification("design-system")
      await expect.element(done, { timeout: 10_000 }).toBeVisible()
      await expect.element(notification("infra"), { timeout: 10_000 }).toBeVisible()

      await done.getByRole("button", { name: /^Mark .* read$/ }).click()

      await expect.element(done).not.toBeInTheDocument()
      await expect.element(notification("infra")).toBeVisible()
      await expect.element(notification("docs-site")).toBeVisible()
    })

    it("clears every finish at once, and keeps the requests", async () => {
      await openNotifications()
      await expect.element(notification("design-system"), { timeout: 10_000 }).toBeVisible()
      await expect.element(notification("infra"), { timeout: 10_000 }).toBeVisible()

      await markAllRead().click()

      await expect.element(notification("design-system")).not.toBeInTheDocument()
      await expect.element(notification("infra")).not.toBeInTheDocument()
      await expect.element(markAllRead()).not.toBeInTheDocument()
      await expect.element(notification("docs-site")).toBeVisible()
    })
  })

  context("when a request waits on the person", () => {
    it("has no way to dismiss it", async () => {
      await openNotifications()
      const row = notification("docs-site")

      await expect.element(row).toBeVisible()
      await expect
        .element(row.getByRole("button", { name: /^Mark .* read$/ }))
        .not.toBeInTheDocument()
      await expect.element(notifications().first()).toBeVisible()
    })
  })
})
