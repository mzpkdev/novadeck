import { createElement } from "react"
import { vi } from "vitest"

import { describe, expect, it } from "../test"
import { render } from "../test/render"
import { CornerCard, CornerCardStack } from "./CornerCard"

describe("a corner card", () => {
  it("names itself by its title, with a short live summary and no focus taken", () => {
    const { container, unmount } = render(
      createElement(
        CornerCardStack,
        null,
        createElement(CornerCard, { title: "Want a thing?" }, createElement("p", null, "Details.")),
      ),
    )
    const card = container.querySelector("section")!
    // Only the summary is live; the card's own words and bar are not re-read as they change.
    expect(card.getAttribute("role")).toBeNull()
    expect(card.querySelector("[role=status]")?.textContent).toBe("Want a thing?")
    expect(card.querySelector("[role=status] ~ [role=status], .sr-only")).toBeNull()
    expect(card.getAttribute("aria-labelledby")).toBe(card.querySelector("p")?.id)
    expect(card.textContent).toContain("Want a thing?")
    expect(card.contains(document.activeElement)).toBe(false)
    unmount()
  })

  it("shows a close button only when it can be closed, and calls it", () => {
    const onClose = vi.fn<() => void>()
    const open = render(createElement(CornerCard, { title: "Closable", onClose }))
    open.container.querySelector<HTMLButtonElement>("button[aria-label=Close]")?.click()
    expect(onClose).toHaveBeenCalledOnce()
    open.unmount()

    const fixed = render(createElement(CornerCard, { title: "Fixed" }))
    expect(fixed.container.querySelector("button")).toBeNull()
    fixed.unmount()
  })

  it("shows progress and actions when given, and an urgent one is an alert", () => {
    const { container, unmount } = render(
      createElement(CornerCard, {
        title: "Working",
        urgent: true,
        progress: { label: "Setup", value: 1, max: 4 },
        actions: createElement("button", { type: "button" }, "Cancel"),
      }),
    )
    expect(container.querySelector("[role=alert]")?.textContent).toBe("Working")
    expect(container.querySelector("[aria-label=Setup]")).not.toBeNull()
    expect(container.textContent).toContain("Cancel")
    unmount()
  })

  it("returns focus when the control that held it goes", async () => {
    const back = vi.fn<() => void>()
    const button = (label: string) => createElement("button", { type: "button", key: label }, label)
    const stack = (child: React.ReactElement | null) =>
      createElement(
        CornerCardStack,
        { returnFocus: back },
        child && createElement(CornerCard, { title: "Swap", actions: child }),
      )
    const { container, rerender, unmount } = render(stack(button("Turn on")))
    container.querySelector("button")?.focus()
    expect(document.activeElement?.textContent).toBe("Turn on")

    rerender(stack(button("Cancel")))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(back).toHaveBeenCalledOnce()

    // Focus the person moved elsewhere is not taken back.
    const elsewhere = document.createElement("input")
    document.body.append(elsewhere)
    container.querySelector("button")?.focus()
    elsewhere.focus()
    await new Promise((resolve) => setTimeout(resolve, 0))
    rerender(stack(null))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(back).toHaveBeenCalledOnce()
    elsewhere.remove()
    unmount()
  })

  it("leaves focus where it was when pressed", () => {
    const { container, unmount } = render(createElement(CornerCard, { title: "Pressed" }))
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    container.querySelector("section")?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    unmount()
  })

  it("shows its note even with no actions", () => {
    const { container, unmount } = render(
      createElement(CornerCard, { title: "Ready", note: "Runs on this computer" }),
    )
    expect(container.querySelector(".corner-card-note")?.textContent).toBe("Runs on this computer")
    unmount()
  })
})
