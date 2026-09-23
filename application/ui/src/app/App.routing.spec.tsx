import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeEach } from "vitest"

import { context, describe, expect, it } from "../test"
import { App, WorkspaceApp } from "./App"

const storefront = "/projects/storefront/sessions/initial/focus?terminal=01"
const api = "/projects/api-service/sessions/initial/canvas?terminal=02"
const open = (url = storefront) => {
  const router = createMemoryRouter([{ path: "*", element: <WorkspaceApp /> }], {
    initialEntries: [url],
  })
  render(<RouterProvider router={router} />)
  return router
}
const click = async (element: Element): Promise<void> => {
  await act(async () => {
    fireEvent.click(element)
  })
}
const url = (router: ReturnType<typeof open>): string =>
  `${router.state.location.pathname}${router.state.location.search}`
const travel = async (router: ReturnType<typeof open>, delta: number): Promise<void> => {
  await act(async () => {
    await router.navigate(delta)
  })
}
const navigate = async (router: ReturnType<typeof open>, destination: string): Promise<void> => {
  await act(async () => {
    await router.navigate(destination)
  })
}

describe("workspace routing", () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, "", "/")
  })

  context("when opening a link", () => {
    it("loads the project, session, view, terminal, sidebar and preferences section", async () => {
      const router = open(`${api}&panel=sessions&dialog=preferences&section=shortcuts`)
      expect(screen.getByRole("dialog", { name: "Preferences" })).toBeVisible()
      expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      await click(screen.getByRole("button", { name: "Close preferences" }))
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Switch workspace" })).toHaveAttribute(
        "title",
        "~/projects/api-service",
      )
      expect(screen.getByRole("list", { name: "Saved sessions" })).toBeVisible()
      expect(document.querySelector('[data-id="02"]')).toHaveClass("selected")
      expect(url(router)).toBe(`${api}&panel=sessions`)
    })

    it("replaces missing resources and disabled views with a valid destination", async () => {
      localStorage.setItem("novadeck.preferences", JSON.stringify({ enabledViews: ["grid"] }))
      const router = open(
        "/projects/missing/sessions/expired/canvas?terminal=missing&dialog=invalid",
      )
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(url(router)).toBe(storefront.replace("focus", "grid"))
      await navigate(router, "/unknown/path")
      expect(url(router)).toBe(storefront.replace("focus", "grid"))
    })

    it("loads hash links and restores sample navigation after a reload", async () => {
      window.history.replaceState(null, "", `/#${api}`)
      const first = render(<App />)
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      expect(window.location.hash).toBe(`#${api}`)
      first.unmount()
      render(<App />)
      expect(screen.getByRole("button", { name: "Switch workspace" })).toHaveAttribute(
        "title",
        "~/projects/api-service",
      )
      expect(document.querySelector('[data-id="02"]')).toHaveClass("selected")
    })
  })

  context("when using browser history", () => {
    it("restores terminal and view navigation while preserving drafts", async () => {
      const router = open()
      await act(async () => {
        fireEvent.change(
          screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
          { target: { value: "unfinished" } },
        )
      })
      await click(screen.getByRole("button", { name: "Select Runtime" }))
      expect(url(router)).toBe(storefront.replace("terminal=01", "terminal=05"))
      await click(screen.getByRole("radio", { name: "Grid" }))
      expect(url(router)).toContain("/grid?")
      await travel(router, -1)
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
      await travel(router, -1)
      expect(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
      ).toHaveValue("unfinished")
      await travel(router, 2)
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(url(router)).toContain("terminal=05")
    })

    it("restores sessions across projects without remounting their workspace data", async () => {
      const router = open()
      await click(screen.getByRole("radio", { name: "Canvas" }))
      const original = url(router)
      await click(screen.getByRole("radio", { name: "Sessions" }))
      await click(screen.getByRole("button", { name: "New session" }))
      const fresh = url(router)
      expect(screen.getByText("No terminals open")).toBeVisible()
      await navigate(router, api)
      expect(screen.getByRole("button", { name: "Switch workspace" })).toHaveAttribute(
        "title",
        "~/projects/api-service",
      )
      await travel(router, -1)
      expect(url(router)).toBe(fresh)
      expect(screen.getByText("No terminals open")).toBeVisible()
      await navigate(router, original)
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Select Checkout implementation" })).toBeVisible()
    })

    it("repairs old links to closed terminals without bringing them back", async () => {
      const router = open()
      await click(screen.getByRole("button", { name: "Select Runtime" }))
      await click(
        within(screen.getByRole("region", { name: "Runtime terminal" })).getByRole("button", {
          name: "Close Runtime",
        }),
      )
      expect(url(router)).not.toContain("terminal=05")
      await navigate(router, storefront.replace("terminal=01", "terminal=05"))
      expect(screen.queryByRole("button", { name: "Select Runtime" })).not.toBeInTheDocument()
      expect(url(router)).not.toContain("terminal=05")
      await travel(router, -1)
      expect(screen.queryByRole("button", { name: "Select Runtime" })).not.toBeInTheDocument()
    })

    it("opens and dismisses dialogs and preference sections through history", async () => {
      const router = open()
      await click(screen.getByRole("button", { name: "Workspace preferences" }))
      await click(screen.getByRole("tab", { name: "Shortcuts" }))
      expect(url(router)).toContain("section=shortcuts")
      await travel(router, -1)
      expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true")
      await travel(router, -1)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      await travel(router, 1)
      expect(screen.getByRole("dialog", { name: "Preferences" })).toBeVisible()
      await act(async () => {
        fireEvent.keyDown(window, { key: "k", ctrlKey: true })
      })
      expect(screen.getByRole("dialog", { name: "Find a terminal" })).toBeVisible()
      expect(screen.queryByRole("dialog", { name: "Preferences" })).not.toBeInTheDocument()
      await travel(router, -1)
      expect(screen.getByRole("dialog", { name: "Preferences" })).toBeVisible()
      expect(screen.getAllByRole("dialog")).toHaveLength(1)
    })

    it("can open Preferences after leaving a project's open search", async () => {
      const router = open()
      await click(screen.getByRole("button", { name: "Find a terminal" }))
      await navigate(router, api)
      await click(screen.getByRole("button", { name: "Workspace preferences" }))
      expect(screen.getByRole("dialog", { name: "Preferences" })).toBeVisible()
      expect(screen.getAllByRole("dialog")).toHaveLength(1)
    })

    it("normalizes a disabled view while keeping Preferences open", async () => {
      const router = open()
      await click(screen.getByRole("button", { name: "Workspace preferences" }))
      await click(
        within(screen.getByRole("dialog", { name: "Preferences" })).getByRole("checkbox", {
          name: "Focus",
        }),
      )
      expect(url(router)).toContain("/grid?")
      expect(url(router)).toContain("dialog=preferences")
      await click(screen.getByRole("button", { name: "Close preferences" }))
      await travel(router, -1)
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(url(router)).toContain("/grid?")
    })
  })
})
