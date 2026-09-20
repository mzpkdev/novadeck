import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"

import { server } from "./server"

Object.defineProperty(window, "novadeck", {
  configurable: true,
  value: {
    versions: {
      chrome: "142.0.0",
      electron: "44.4.3",
      node: "26.0.0",
    },
  },
})

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
