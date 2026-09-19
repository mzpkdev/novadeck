import { validatePromotion, type CandidateRelease } from "./promotion.ts"

const requestedTag = process.env.RELEASE_TAG ?? ""
const latestStableTag = process.env.LATEST_STABLE_TAG || null
const release = JSON.parse(process.env.RELEASE_JSON ?? "null") as CandidateRelease | null

if (!release) {
  throw new Error(`GitHub release ${requestedTag} does not exist.`)
}

validatePromotion(requestedTag, release, latestStableTag)
console.log(`${requestedTag} is ready to promote.`)
