import { verifyPullRequest } from "./verification.ts"

export const main = (): void => {
  const result = verifyPullRequest(process.env.PR_TITLE ?? "", process.env.PR_BODY ?? "")

  for (const message of result.titleErrors) {
    console.error(`::error title=Invalid pull request title::${message}`)
  }
  for (const message of result.descriptionErrors) {
    console.error(`::error title=Missing pull request section::${message}`)
  }

  process.exitCode = result.titleErrors.length > 0 || result.descriptionErrors.length > 0 ? 1 : 0
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
