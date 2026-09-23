import { act, render, screen } from "@testing-library/react"
import { afterEach, vi } from "vitest"

import { describe, expect, it } from "../../test"
import { createMockTerminal } from "../mock/sessions"
import { Focus } from "./Focus"

const sessions = [createMockTerminal(1, "/project"), createMockTerminal(2, "/project")]
const props = {
  sessions,
  onSelect: vi.fn<(id: string) => void>(),
  render: (session: (typeof sessions)[number]) => (
    <section aria-label={session.name} data-terminal={session.id}>
      <input aria-label={`Command for ${session.name}`} />
    </section>
  ),
}

afterEach(() => vi.useRealTimers())

describe("Focus terminal transitions", () => {
  it("keeps the outgoing terminal inert until its exit transition finishes", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...matchMedia(""), matches: false })
    vi.useFakeTimers()
    const { rerender } = render(<Focus {...props} displayed="01" />)
    const previous = screen.getByRole("region", { name: "Terminal 01" })
    rerender(<Focus {...props} displayed="02" />)
    expect(previous).toBeInTheDocument()
    expect(previous.parentElement).toHaveAttribute("inert")
    expect(previous.parentElement).toHaveAttribute("data-hiding", "true")
    expect(screen.queryByRole("region", { name: "Terminal 01" })).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Terminal 02" })).toBeVisible()
    act(() => vi.advanceTimersByTime(180))
    expect(previous).not.toBeInTheDocument()
  })

  it("reuses a terminal when switching back during its exit", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...matchMedia(""), matches: false })
    vi.useFakeTimers()
    const { rerender } = render(<Focus {...props} displayed="01" />)
    const previous = screen.getByRole("region", { name: "Terminal 01" })
    rerender(<Focus {...props} displayed="02" />)
    act(() => vi.advanceTimersByTime(60))
    rerender(<Focus {...props} displayed="01" />)
    act(() => vi.advanceTimersByTime(180))
    expect(screen.getByRole("region", { name: "Terminal 01" })).toBe(previous)
    expect(previous.parentElement).not.toHaveAttribute("inert")
    expect(
      screen.queryByRole("region", { name: "Terminal 02", hidden: true }),
    ).not.toBeInTheDocument()
  })

  it("switches immediately with reduced motion", () => {
    const { rerender } = render(<Focus {...props} displayed="01" />)
    const previous = screen.getByRole("region", { name: "Terminal 01" })
    rerender(<Focus {...props} displayed="02" />)
    expect(previous).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Terminal 02" })).toBeVisible()
  })
})
