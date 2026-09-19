import { waitForTurn } from "./queue.ts"

export async function main(): Promise<void> {
  await waitForTurn(process.env)
  console.log("No earlier release runs are active.")
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
