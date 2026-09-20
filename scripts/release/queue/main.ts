import { waitForReleaseTurn } from "./queue.ts"

export async function main(): Promise<void> {
  await waitForReleaseTurn(process.env)
  console.log("No earlier release-worthy commit is waiting for publication.")
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
