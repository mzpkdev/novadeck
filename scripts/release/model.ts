import createPreset, { type CommitType } from "conventional-changelog-conventionalcommits"
import {
  CommitParser,
  type Commit,
  type ParserOptions,
} from "conventional-commits-parser"

export type ReleaseType = "major" | "minor" | "patch"

export interface Version {
  major: number
  minor: number
  patch: number
}

export type ReleasePlan =
  | { release: false }
  | {
      release: true
      previousTag: string | null
      tag: string
      type: ReleaseType
      version: string
    }

interface Bump {
  level: number
}

interface Preset {
  parser: ParserOptions
  whatBump: (commits: Commit[]) => Bump | null
}

const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const levels: Record<number, ReleaseType> = {
  0: "major",
  1: "minor",
  2: "patch",
}
const commitTypes: CommitType[] = [
  {
    type: "build",
    scope: "deps",
    section: "Dependencies",
    effect: "bump",
  },
  { type: "feat", section: "Features", effect: "bump" },
  { type: "feature", section: "Features", effect: "bump" },
  { type: "fix", section: "Bug Fixes", effect: "bump" },
  { type: "perf", section: "Performance Improvements", effect: "bump" },
  { type: "revert", section: "Reverts", effect: "bump" },
  { type: "build", section: "Build System", effect: "hidden" },
  { type: "chore", section: "Miscellaneous Chores", effect: "hidden" },
  { type: "ci", section: "Continuous Integration", effect: "hidden" },
  { type: "docs", section: "Documentation", effect: "hidden" },
  { type: "refactor", section: "Code Refactoring", effect: "hidden" },
  { type: "style", section: "Styles", effect: "hidden" },
  { type: "test", section: "Tests", effect: "hidden" },
]

export function parseVersion(value: string): Version | null {
  const match = versionPattern.exec(value)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function formatVersion(version: Version): string {
  return `${version.major}.${version.minor}.${version.patch}`
}

export function compareVersions(left: Version, right: Version): number {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  )
}

export function latestVersion(
  tags: string[],
): { tag: string; version: Version } | null {
  let latest: { tag: string; version: Version } | null = null

  for (const tag of tags) {
    const version = parseVersion(tag)
    if (!version) continue

    if (!latest || compareVersions(version, latest.version) > 0) {
      latest = { tag, version }
    }
  }

  return latest
}

export function incrementVersion(
  version: Version,
  type: ReleaseType,
): Version {
  if (type === "major") {
    return { major: version.major + 1, minor: 0, patch: 0 }
  }

  if (type === "minor") {
    return { major: version.major, minor: version.minor + 1, patch: 0 }
  }

  return { major: version.major, minor: version.minor, patch: version.patch + 1 }
}

export function analyzeRelease(messages: string[]): ReleaseType | null {
  const preset = createPreset({ types: commitTypes }) as Preset
  const parser = new CommitParser(preset.parser)
  const bump = preset.whatBump(messages.map((message) => parser.parse(message)))

  return bump ? (levels[bump.level] ?? null) : null
}

export function planRelease(tags: string[], messages: string[]): ReleasePlan {
  const type = analyzeRelease(messages)
  if (!type) return { release: false }

  const latest = latestVersion(tags)
  const base = latest?.version ?? { major: 0, minor: 0, patch: 0 }
  const version = formatVersion(incrementVersion(base, type))

  return {
    release: true,
    previousTag: latest?.tag ?? null,
    tag: `v${version}`,
    type,
    version,
  }
}
