import { execFileSync } from "node:child_process"

import type { TestProject } from "vitest/node"

export function build(): void {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  execFileSync(command, ["run", "build"], { stdio: "inherit" })
}

export default function setup(project: TestProject): void {
  build()
  project.onTestsRerun(() => build())
}
