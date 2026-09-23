import { act, renderHook } from "@testing-library/react"
import { afterEach, vi } from "vitest"

import { describe, expect, it } from "../../test"
import { useTerminalVisibility } from "./useTerminalVisibility"

afterEach(() => vi.useRealTimers())

describe("terminal visibility transitions", () => {
  it("retains an exiting terminal, and cancels removal when it is shown again", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...matchMedia(""), matches: false })
    vi.useFakeTimers()
    const { result, rerender } = renderHook((hidden) => useTerminalVisibility(hidden), {
      initialProps: { "01": false },
    })
    rerender({ "01": true })
    expect(result.current["01"]).toBeFalsy()
    act(() => vi.advanceTimersByTime(90))
    rerender({ "01": false })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current["01"]).toBeFalsy()
    rerender({ "01": true })
    act(() => vi.advanceTimersByTime(180))
    expect(result.current["01"]).toBe(true)
  })

  it("shows a previously hidden terminal immediately and allows it to exit again", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...matchMedia(""), matches: false })
    vi.useFakeTimers()
    const { result, rerender } = renderHook((hidden) => useTerminalVisibility(hidden), {
      initialProps: { "01": true },
    })
    expect(result.current["01"]).toBe(true)
    rerender({ "01": false })
    expect(result.current["01"]).toBeFalsy()
    rerender({ "01": true })
    expect(result.current["01"]).toBeFalsy()
    act(() => vi.advanceTimersByTime(180))
    expect(result.current["01"]).toBe(true)
  })

  it("applies visibility immediately with reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...matchMedia(""), matches: true })
    const { result, rerender } = renderHook((hidden) => useTerminalVisibility(hidden), {
      initialProps: { "01": false },
    })
    rerender({ "01": true })
    expect(result.current["01"]).toBe(true)
    rerender({ "01": false })
    expect(result.current["01"]).toBe(false)
  })
})
