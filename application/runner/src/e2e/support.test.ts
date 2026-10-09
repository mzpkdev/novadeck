import { describe, expect, it } from "../test.js"
import { keychainOptIn, unsupported } from "./support.js"

describe("where the end-to-end suite runs", () => {
  it("runs on Linux and Windows", () => {
    expect(unsupported("linux", {})).toBeUndefined()
    expect(unsupported("win32", {})).toBeUndefined()
  })

  it("runs on macOS in CI, whose runners have nothing in their Keychain", () => {
    expect(unsupported("darwin", { CI: "true" })).toBeUndefined()
  })

  it("runs on a developer's Mac only when they accept the Keychain is in reach", () => {
    expect(unsupported("darwin", { [keychainOptIn]: "accept" })).toBeUndefined()
    expect(unsupported("darwin", {})).toContain(`${keychainOptIn}=accept`)
    expect(unsupported("darwin", { [keychainOptIn]: "1" })).toContain("CI only")
  })

  it("says it runs nowhere else", () => {
    expect(unsupported("freebsd", { CI: "true" })).toContain("not freebsd")
  })
})
