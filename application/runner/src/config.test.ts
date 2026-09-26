import { serverOptionsFromEnv } from "./config.js"
import { describe, expect, it } from "./test.js"

describe("server configuration", () => {
  it("reads the terminal API token and database path", () => {
    const token = "configuration-tests-only-not-a-real-credential"
    expect(
      serverOptionsFromEnv({
        NOVADECK_TOKEN: token,
        NOVADECK_DATABASE: "/tmp/novadeck-test.sqlite",
      }),
    ).toMatchObject({ apiToken: token, databasePath: "/tmp/novadeck-test.sqlite" })
  })

  it("rejects empty, short, and oversized credentials", () => {
    for (const token of ["", " ", "short", "x".repeat(513)]) {
      expect(() => serverOptionsFromEnv({ NOVADECK_TOKEN: token })).toThrow("NOVADECK_TOKEN")
    }
  })

  it("reads server and CORS settings from environment variables", () => {
    expect(
      serverOptionsFromEnv({
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

  it("uses local defaults without environment variables", () => {
    expect(serverOptionsFromEnv({})).toEqual({
      hostname: "127.0.0.1",
      port: 8787,
      corsOrigins: ["http://127.0.0.1:5173"],
    })
  })

  it("rejects invalid port values", () => {
    expect(() => serverOptionsFromEnv({ PORT: "not-a-port" })).toThrow(
      "PORT must be an integer between 0 and 65535",
    )
  })
})
