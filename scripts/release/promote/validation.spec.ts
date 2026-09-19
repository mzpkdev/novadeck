import { context, describe, expect, it } from "../../../src/test"

import { type CandidateRelease, validatePromotion } from "./validation"

function candidate(overrides: Partial<CandidateRelease> = {}): CandidateRelease {
  return {
    assets: [
      { name: "NovaDeck-0.3.2-linux-x86_64.AppImage" },
      { name: "NovaDeck-0.3.2-linux-amd64.deb" },
      { name: "NovaDeck-0.3.2-mac-universal.dmg" },
      { name: "NovaDeck-0.3.2-mac-universal.zip" },
      { name: "NovaDeck-0.3.2-win-x64.exe" },
      { name: "SHA256SUMS" },
    ],
    isDraft: false,
    isPrerelease: true,
    tagName: "v0.3.2",
    ...overrides,
  }
}

describe("release promotion", () => {
  context("when a complete prerelease is newer than stable", () => {
    it("accepts the candidate", () => {
      expect(() => validatePromotion("v0.3.2", candidate(), "v0.2.0")).not.toThrow()
    })

    it("accepts the first stable release", () => {
      expect(() => validatePromotion("v0.3.2", candidate(), null)).not.toThrow()
    })
  })

  context("when the candidate cannot be promoted safely", () => {
    it("rejects a normal release", () => {
      expect(() =>
        validatePromotion("v0.3.2", candidate({ isPrerelease: false }), "v0.2.0"),
      ).toThrow("must be a published GitHub prerelease")
    })

    it("rejects a version older than stable", () => {
      expect(() => validatePromotion("v0.3.2", candidate(), "v0.4.0")).toThrow(
        "must be newer than stable",
      )
    })

    it("rejects a release without every platform", () => {
      const assets = candidate().assets.filter((asset) => !asset.name.endsWith(".exe"))

      expect(() => validatePromotion("v0.3.2", candidate({ assets }), "v0.2.0")).toThrow(
        "Windows installer",
      )
    })

    it("rejects a tag that does not match the release", () => {
      expect(() => validatePromotion("v0.3.1", candidate(), "v0.2.0")).toThrow(
        "requires an existing vX.Y.Z release",
      )
    })
  })
})
