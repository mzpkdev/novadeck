import { readLatestStableTag } from "./github.ts"
import { validatePromotion, type CandidateRelease } from "./validation.ts"

export async function main(): Promise<void> {
  const requestedTag = process.env.RELEASE_TAG ?? ""
  const release = JSON.parse(process.env.RELEASE_JSON ?? "null") as CandidateRelease | null

  if (!release) {
    throw new Error(`GitHub release ${requestedTag} does not exist.`)
  }

  validatePromotion(requestedTag, release, await readLatestStableTag(process.env))
  console.log(`${requestedTag} is ready to promote.`)
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
