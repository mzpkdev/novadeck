export type ReleaseType = "major" | "minor" | "patch"

export interface Version {
  major: number
  minor: number
  patch: number
}

const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

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
