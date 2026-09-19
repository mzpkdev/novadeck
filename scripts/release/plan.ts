import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"

import { latestVersion, planRelease } from "./model.ts"

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function readTags(): string[] {
  return git("tag", "--list").split("\n").filter(Boolean)
}

function readMessages(previousTag: string | null): string[] {
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD"
  const output = git("log", "--format=%B%x00", range)

  return output.split("\0").map((message) => message.trim()).filter(Boolean)
}

function writeOutput(name: string, value: string): void {
  const output = process.env.GITHUB_OUTPUT
  if (!output) return

  appendFileSync(output, `${name}=${value}\n`)
}

const tags = readTags()
const previousTag = latestVersion(tags)?.tag ?? null
const plan = planRelease(tags, readMessages(previousTag))

if (!plan.release) {
  writeOutput("package", "false")
  writeOutput("publish", "false")
  console.log("No release-worthy commits found.")
} else {
  writeOutput("package", "true")
  writeOutput("previous_tag", plan.previousTag ?? "")
  writeOutput("publish", "true")
  writeOutput("tag", plan.tag)
  writeOutput("version", plan.version)
  console.log(JSON.stringify(plan, null, 2))
}
