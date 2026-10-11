import { describe, expect, it } from "../test.js"
import { agy } from "./agents/agy.js"
import { credentialTargets, harnessLogins } from "./credentials.js"

const antigravity = { service: "gemini", account: "antigravity" }

describe("a harness's login in the system's store", () => {
  it("is one of its targets, as Windows names them", () => {
    expect(harnessLogins([agy], ["gemini:antigravity", "git:https://github.com"])).toEqual([
      "gemini:antigravity",
    ])
    expect(harnessLogins([agy], ["git:https://github.com"])).toEqual([])
  })

  it("is asked of the Keychain only for the item each harness names", () => {
    expect(agy.keychain).toEqual([antigravity])
  })
})

describe.runIf(process.platform === "darwin")("a harness's login in the macOS Keychain", () => {
  it("is a target, named as on Windows, while the Keychain holds its item", () => {
    const asked: unknown[] = []
    const holds = (item: unknown) => {
      asked.push(item)
      return true
    }

    expect(credentialTargets([agy], holds)).toEqual(["gemini:antigravity"])
    expect(asked).toEqual([antigravity])
    expect(harnessLogins([agy], credentialTargets([agy], holds))).toEqual(["gemini:antigravity"])
  })

  it("is none while the Keychain doesn't hold it, nor for a harness that names none", () => {
    expect(credentialTargets([agy], () => false)).toEqual([])
    expect(credentialTargets([{}], () => true)).toEqual([])
  })
})
