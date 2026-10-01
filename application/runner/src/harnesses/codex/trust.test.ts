import { describe, expect, it } from "../../test.js"
import { trustedIn } from "./trust.js"

// One hook as Codex's app-server lists it, as probed with 0.159.3.
const hook = (
  eventName: string,
  trustStatus: string,
  pluginId: string | null = "novadeck@novadeck",
) => ({
  key: `${pluginId ?? "/home/user/.codex/hooks.json"}:${eventName}:0:0`,
  eventName,
  pluginId,
  trustStatus,
})
const listed = (...hooks: object[]) => ({ data: [{ cwd: "/work", hooks }] })
const ours = ["sessionStart", "userPromptSubmit", "stop"]

describe("NovaDeck's Codex hooks", () => {
  it("run once each one it needs is trusted", () => {
    expect(trustedIn(listed(...ours.map((event) => hook(event, "trusted"))))).toBe(true)
  })

  it("don't run while any it needs is untrusted, changed since trusted, or missing", () => {
    for (const status of ["untrusted", "modified"])
      expect(
        trustedIn(
          listed(...ours.map((event, index) => hook(event, index === 1 ? status : "trusted"))),
        ),
      ).toBe(false)
    expect(trustedIn(listed(hook("sessionStart", "trusted"), hook("stop", "trusted")))).toBe(false)
  })

  it("count only NovaDeck's plugin's, and nothing Codex couldn't list", () => {
    expect(trustedIn(listed(...ours.map((event) => hook(event, "trusted", null))))).toBe(false)
    expect(trustedIn(undefined)).toBe(false)
    expect(trustedIn({ data: "x" })).toBe(false)
  })
})
