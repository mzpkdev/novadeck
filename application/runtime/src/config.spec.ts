import { runtimeOptionsFromEnv } from "./config.js"
import { context, describe, expect, it } from "./test.js"

describe("runtime configuration", () => {
  context("when environment variables are provided", () => {
    it("reads the server and CORS settings", () => {
      expect(
        runtimeOptionsFromEnv({
          HOST: "0.0.0.0",
          PORT: "4321",
          CORS_ORIGINS: "https://novadeck.example, https://mzpkdev.github.io",
        }),
      ).toEqual({
        hostname: "0.0.0.0",
        port: 4321,
        corsOrigins: ["https://novadeck.example", "https://mzpkdev.github.io"],
      })
    })
  })

  context("when environment variables are absent", () => {
    it("uses local development and desktop defaults", () => {
      expect(runtimeOptionsFromEnv({})).toEqual({
        hostname: "127.0.0.1",
        port: 8787,
        corsOrigins: ["http://127.0.0.1:5173", "null"],
      })
    })
  })

  context("when the port is invalid", () => {
    it("rejects the configuration", () => {
      expect(() => runtimeOptionsFromEnv({ PORT: "not-a-port" })).toThrow(
        "PORT must be an integer between 0 and 65535",
      )
    })
  })
})
