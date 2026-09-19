import { context, describe, expect, it } from "../../src/test"

import {
  analyzeRelease,
  compareVersions,
  latestVersion,
  parseVersion,
  planRelease,
} from "./model"

describe("release model", () => {
  context("when commits follow Conventional Commits", () => {
    it.each([
      ["fix: prevent a startup crash", "patch"],
      ["perf: reduce startup work", "patch"],
      ["build(deps): update Electron", "patch"],
      ["feat: add workspace tabs", "minor"],
      ["feat!: replace the workspace format", "major"],
      ["docs!: remove a supported API", "major"],
    ])("maps %s to a %s release", (message, expected) => {
      expect(analyzeRelease([message])).toBe(expected)
    })

    it.each([
      "build: update packaging",
      "chore: organize scripts",
      "ci: pin an action",
      "docs: explain releases",
      "refactor: extract a function",
      "style: format sources",
      "test: cover release planning",
    ])("does not release for %s", (message) => {
      expect(analyzeRelease([message])).toBeNull()
    })

    it("uses the highest release type across unreleased commits", () => {
      expect(
        analyzeRelease([
          "fix: prevent a startup crash",
          "feat: add workspace tabs",
          "docs: explain tabs",
        ]),
      ).toBe("minor")
    })

    it("recognizes a breaking-change footer", () => {
      expect(
        analyzeRelease([
          "feat: replace storage\n\nBREAKING CHANGE: existing workspaces must be migrated",
        ]),
      ).toBe("major")
    })
  })

  context("when planning the next immutable build", () => {
    it("starts at the configured initial version", () => {
      expect(
        planRelease([], ["feat: scaffold the application"], {
          initialVersion: "0.0.0",
          patchOnly: true,
        }),
      ).toEqual({
        release: true,
        previousTag: null,
        tag: "v0.0.0",
        type: "patch",
        version: "0.0.0",
      })
    })

    it("increments from the highest normal version tag", () => {
      expect(
        planRelease(
          ["not-a-release", "v0.3.0", "v0.2.9", "v0.3.1"],
          ["fix: restore tabs"],
        ),
      ).toEqual({
        release: true,
        previousTag: "v0.3.1",
        tag: "v0.3.2",
        type: "patch",
        version: "0.3.2",
      })
    })

    it("does not plan a release without a releasable commit", () => {
      expect(planRelease(["v0.3.1"], ["docs: explain tabs"])).toEqual({
        release: false,
      })
    })

    it.each([
      "fix: prevent a startup crash",
      "feat: add workspace tabs",
      "feat!: replace the workspace format",
    ])("converts %s to a patch bump while patch-only mode is enabled", (message) => {
      expect(planRelease(["v0.4.2"], [message], { patchOnly: true })).toEqual({
        release: true,
        previousTag: "v0.4.2",
        tag: "v0.4.3",
        type: "patch",
        version: "0.4.3",
      })
    })

    it("restores normal Conventional Commit bumps when patch-only mode is disabled", () => {
      expect(planRelease(["v0.4.2"], ["feat!: replace storage"])).toMatchObject({
        tag: "v1.0.0",
        type: "major",
      })
    })
  })

  context("when comparing release tags", () => {
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
