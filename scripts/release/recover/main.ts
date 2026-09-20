import { recoverInterruptedRelease } from "./recover.ts"

export async function main(): Promise<void> {
  const tags = await recoverInterruptedRelease(process.env)
  console.log(tags.length ? `Removed interrupted draft(s): ${tags.join(", ")}.` : "No draft recovery needed.")
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
