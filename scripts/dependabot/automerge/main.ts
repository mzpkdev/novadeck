import { appendFileSync } from "node:fs"

import { ready } from "./readiness.ts"

export const main = async (): Promise<void> => {
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error("GITHUB_OUTPUT is missing.")

  const enabled = await ready(process.env)
  appendFileSync(output, `ready=${enabled}\n`)
  console.log(
    enabled ? "Automerge is ready." : "Automerge needs required checks and repository settings.",
  )
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
