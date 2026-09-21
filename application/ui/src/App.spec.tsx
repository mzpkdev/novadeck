import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { HttpResponse, http } from "msw"

import { App } from "./App"
import { context, describe, expect, it } from "./test"
import { server } from "./test/server"

describe("NovaDeck terminal", () => {
  context("when the runtime is ready", () => {
    it("runs commands in a light-theme terminal session", async () => {
      server.use(http.get("*/api/status", () => HttpResponse.json({ status: "ready" })))

      render(<App />)

      expect(screen.getByRole("heading", { name: "Terminal 1" }).closest("main")).toHaveAttribute(
        "data-theme",
        "light",
      )
      expect(screen.getByRole("textbox", { name: "Terminal input" }).parentElement).toHaveClass(
        "input",
        "outlined",
      )
      fireEvent.change(screen.getByRole("textbox", { name: "Terminal input" }), {
        target: { value: "help" },
      })
      fireEvent.submit(screen.getByRole("form", { name: "Terminal command" }))

      expect(await screen.findByText("Commands")).toBeInTheDocument()
      expect(screen.getByText("novadeck deck build Build the current deck")).toBeInTheDocument()
    })

    it("switches and renames terminal tabs", async () => {
      render(<App />)

      const runtimeTab = screen.getByRole("tab", { name: "Terminal 2" })
      await waitFor(() => expect(runtimeTab).not.toHaveAttribute("data-ssr"))
      fireEvent.click(runtimeTab)
      expect(await screen.findByRole("heading", { name: "Terminal 2" })).toBeInTheDocument()
      expect(await screen.findByText("NovaDeck Runtime")).toBeVisible()
      expect(
        within(screen.getByRole("tabpanel", { name: "Terminal 2" })).getByRole("log"),
      ).toBeInTheDocument()

      fireEvent.doubleClick(screen.getByRole("tab", { name: "Terminal 2" }))
      const editor = screen.getByRole("textbox", { name: "Rename Terminal 2" })
      fireEvent.input(editor, { target: { value: "Runtime shell" } })
      fireEvent.keyDown(editor, { key: "Enter" })

      expect(await screen.findByRole("tab", { name: "Runtime shell" })).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "Runtime shell" })).toBeInTheDocument()
      expect(screen.getByRole("tabpanel", { name: "Runtime shell" })).toBeInTheDocument()
    })
  })
})
