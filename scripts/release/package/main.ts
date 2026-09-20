import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"

import { readTags } from "../plan/main.ts"
import { formatVersion, latestVersion, parseVersion } from "../version/version.ts"

const git = (args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8" }).trim()

export function main(): void {
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error("GITHUB_OUTPUT is missing.")

  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { version?: unknown }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("package.json version is missing.")
  }

  const exact = latestVersion(git(["tag", "--points-at", "HEAD", "--list"]).split("\n"))
  const latest = latestVersion(readTags())
  const base = exact?.version ?? latest?.version ?? parseVersion(manifest.version)
  if (!base) throw new Error("package.json version is invalid.")

  const run = process.env.GITHUB_RUN_NUMBER
  if (!exact && (!run || !/^[1-9]\d*$/.test(run))) {
    throw new Error("GITHUB_RUN_NUMBER is missing.")
  }
  const version = exact ? formatVersion(base) : `${formatVersion(base)}-manual.${run}`

  appendFileSync(output, `package=true\nversion=${version}\n`)
  console.log(`Packaging NovaDeck ${version}.`)
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
