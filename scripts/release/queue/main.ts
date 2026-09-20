import { appendFileSync } from "node:fs"

import { releaseTurnReady } from "./queue.ts"

export async function main(): Promise<void> {
  const ready = await releaseTurnReady(process.env)
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error("GITHUB_OUTPUT is missing.")

  appendFileSync(output, `ready=${ready}\n`)
  console.log(
    ready
      ? "No earlier release-worthy commit is waiting for publication."
      : "Deferring until the earlier release-worthy commit is published.",
  )
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
