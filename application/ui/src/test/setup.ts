import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, vi } from "vitest"

import { server } from "./server"

// jsdom has no media-query API; component tests use the desktop layout.
vi.stubGlobal("matchMedia", (query: string) => ({
  media: query,
  matches: true,
  addEventListener: vi.fn<EventTarget["addEventListener"]>(),
  removeEventListener: vi.fn<EventTarget["removeEventListener"]>(),
}))

// Layout geometry is exercised in the browser; jsdom needs the observer API to mount Canvas.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn<ResizeObserver["observe"]>()
    unobserve = vi.fn<ResizeObserver["unobserve"]>()
    disconnect = vi.fn<ResizeObserver["disconnect"]>()
  },
)

Object.defineProperty(Element.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn<() => void>(),
})
Element.prototype.scrollIntoView = vi.fn<Element["scrollIntoView"]>()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
