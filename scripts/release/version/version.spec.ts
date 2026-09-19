import { context, describe, expect, it } from "../../../src/test"

import { compareVersions, latestVersion, parseVersion } from "./version"

describe("release versions", () => {
  context("when parsing tags", () => {
    it("rejects incomplete and prerelease versions", () => {
      expect(parseVersion("v1.2")).toBeNull()
      expect(parseVersion("v1.2.3-dev.1")).toBeNull()
    })

    it("compares numeric components instead of tag text", () => {
      const lower = parseVersion("v1.9.0")
      const higher = parseVersion("v1.10.0")

      expect(lower).not.toBeNull()
      expect(higher).not.toBeNull()
      expect(compareVersions(lower!, higher!)).toBeLessThan(0)
      expect(latestVersion(["v1.9.0", "v1.10.0"])?.tag).toBe("v1.10.0")
    })
  })
})
