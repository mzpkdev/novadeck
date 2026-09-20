import { dispatchReleaseAfterMerge } from "./release.ts"

export async function main(): Promise<void> {
  const sha = await dispatchReleaseAfterMerge(process.env)
  console.log(`Dispatched release for ${sha}.`)
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
