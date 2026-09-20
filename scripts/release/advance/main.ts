import { dispatchNextRelease } from "./advance.ts"

export async function main(): Promise<void> {
  const sha = await dispatchNextRelease(process.env)
  console.log(sha ? `Dispatched the next release for ${sha}.` : "No deferred release is ready.")
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
