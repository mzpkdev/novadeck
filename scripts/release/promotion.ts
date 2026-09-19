import { compareVersions, parseVersion } from "./model.ts"

interface Asset {
  name: string
}

export interface CandidateRelease {
  assets: Asset[]
  isDraft: boolean
  isPrerelease: boolean
  tagName: string
}

const requiredAssets = [
  { label: "Linux AppImage", matches: (name: string) => name.endsWith(".AppImage") },
  { label: "Linux DEB", matches: (name: string) => name.endsWith(".deb") },
  { label: "macOS DMG", matches: (name: string) => name.endsWith(".dmg") },
  { label: "macOS ZIP", matches: (name: string) => name.endsWith(".zip") },
  { label: "Windows installer", matches: (name: string) => name.endsWith(".exe") },
  { label: "checksums", matches: (name: string) => name === "SHA256SUMS" },
]

export function validatePromotion(
  requestedTag: string,
  release: CandidateRelease,
  latestStableTag: string | null,
): void {
  const candidate = parseVersion(requestedTag)
  if (!candidate || release.tagName !== requestedTag) {
    throw new Error(`Promotion requires an existing vX.Y.Z release, received ${requestedTag}.`)
  }

  if (release.isDraft || !release.isPrerelease) {
    throw new Error(`${requestedTag} must be a published GitHub prerelease.`)
  }

  if (latestStableTag) {
    const stable = parseVersion(latestStableTag)
    if (!stable) {
      throw new Error(`The latest stable tag ${latestStableTag} is not valid SemVer.`)
    }

    if (compareVersions(candidate, stable) <= 0) {
      throw new Error(`${requestedTag} must be newer than stable ${latestStableTag}.`)
    }
  }

  const names = release.assets.map((asset) => asset.name)
  const missing = requiredAssets
    .filter((asset) => !names.some(asset.matches))
    .map((asset) => asset.label)

  if (missing.length > 0) {
    throw new Error(`${requestedTag} is missing: ${missing.join(", ")}.`)
  }
}
