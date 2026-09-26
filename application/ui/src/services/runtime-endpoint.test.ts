import { describe, expect, it } from "vitest"

import { runtimeEndpoint } from "./runtime-endpoint"

describe("runtime endpoint", () => {
  it("uses the configured secure API path for browser WebSockets", () => {
    expect(runtimeEndpoint("https://runtime.example/api/", "https://app.example/")).toBe(
      "wss://runtime.example/api/rpc",
    )
  })
  it("resolves the local development proxy", () => {
    expect(runtimeEndpoint("/api", "http://127.0.0.1:5173/")).toBe("ws://127.0.0.1:5173/api/rpc")
  })
  it("requires encrypted transport for a remote credential", () => {
    expect(() => runtimeEndpoint("http://runtime.example/api", "https://app.example/")).toThrow(
      "HTTPS",
    )
  })
  it.each([
    "https://user:secret@runtime.example/api",
    "https://runtime.example/api?token=secret",
    "https://runtime.example/api#secret",
    "file:///api",
  ])("rejects credentials and unsupported endpoint forms: %s", (url) => {
    expect(() => runtimeEndpoint(url, "https://app.example/")).toThrow("Use an HTTP(S) API address")
  })
})
