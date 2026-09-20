import createPreset, { type CommitType } from "conventional-changelog-conventionalcommits"
import {
  CommitParser,
  type Commit,
  type ParserOptions,
} from "conventional-commits-parser"

import {
  formatVersion,
  incrementVersion,
  latestVersion,
  parseVersion,
  type ReleaseType,
} from "../version/version.ts"

export type ReleasePlan =
  | { release: false }
  | {
      release: true
      previousTag: string | null
      tag: string
      type: ReleaseType
      version: string
    }

export interface ReleaseOptions {
  initialVersion?: string
  patchOnly?: boolean
}

interface Bump {
  level: number
}

interface Preset {
  parser: ParserOptions
  whatBump: (commits: Commit[]) => Bump | null
}

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

export function analyzeRelease(messages: string[]): ReleaseType | null {
  const preset = createPreset({ types: commitTypes }) as Preset
  const parser = new CommitParser(preset.parser)
  const bump = preset.whatBump(messages.map((message) => parser.parse(message)))

  return bump ? (levels[bump.level] ?? null) : null
}

export function planRelease(
  tags: string[],
  messages: string[],
  options: ReleaseOptions = {},
): ReleasePlan {
  const analyzedType = analyzeRelease(messages)
  if (!analyzedType) return { release: false }

  const latest = latestVersion(tags)
  const type = options.patchOnly ? "patch" : analyzedType
  const initial = options.initialVersion ? parseVersion(options.initialVersion) : null
  const next = latest
    ? incrementVersion(latest.version, type)
    : (initial ?? incrementVersion({ major: 0, minor: 0, patch: 0 }, type))
  const version = formatVersion(next)

  return {
    release: true,
    previousTag: latest?.tag ?? null,
    tag: `v${version}`,
    type,
    version,
  }
}
