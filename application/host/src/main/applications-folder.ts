/** What decides whether a launch offers to move the app to the Applications folder. */
export type MoveBuild = {
  readonly packaged: boolean
  readonly version: string
  readonly platform: NodeJS.Platform
  readonly env: Readonly<Record<string, string | undefined>>
  /** Electron's `app.isInApplicationsFolder()`; only macOS has an answer. */
  readonly inApplications: boolean
  /** Whether the person asked not to be offered the move again. */
  readonly declined: boolean
}

/**
 * Whether a launch offers to move the app to Applications. macOS updates an app only in
 * place, and cannot replace one that runs from a disk image or, after a download, from a
 * randomized read-only copy, so the offer is made on a packaged macOS launch from any
 * other folder, until the person asks not to be asked again. A development run, a build
 * that carries version 0.0.0 (it never updates), and a launch with `NOVADECK_UPDATES=off`,
 * as the smoke tests give, never ask.
 */
export const shouldOfferMove = ({
  packaged,
  version,
  platform,
  env,
  inApplications,
  declined,
}: MoveBuild): boolean =>
  platform === "darwin" &&
  packaged &&
  version !== "0.0.0" &&
  env.NOVADECK_UPDATES !== "off" &&
  !inApplications &&
  !declined

/** The person's answer to the offer. */
export type MoveAnswer = {
  readonly move: boolean
  /** Whether "Don't ask again" was ticked, whichever button was pressed. */
  readonly dontAskAgain: boolean
}

/**
 * What Electron's `moveToApplicationsFolder` does when the Applications folder already
 * holds an app of the same name: replace a copy that is not running, as the person asked
 * for this one to take its place, and leave one that runs, which this must not quit.
 */
export const resolveMoveConflict = (conflict: "exists" | "existsAndRunning"): boolean =>
  conflict === "exists"

/**
 * Offers the move on a launch that should, and does it when accepted. Returns whether the
 * app is on its way to restart from Applications, in which case the launch goes no
 * further. A move that fails or is turned down lets the launch go on where it is. "Don't
 * ask again" is kept whatever else happens; the buttons alone ask again at the next launch.
 */
export const offerMove = async ({
  build,
  ask,
  decline,
  move,
  log,
}: {
  readonly build: MoveBuild
  readonly ask: () => Promise<MoveAnswer>
  readonly decline: () => Promise<void>
  /** Electron's `moveToApplicationsFolder`, true once the move has started. */
  readonly move: () => boolean
  readonly log: (message: string, error: unknown) => void
}): Promise<boolean> => {
  if (!shouldOfferMove(build)) return false
  try {
    const answer = await ask()
    if (answer.dontAskAgain)
      await decline().catch((error: unknown) => log("The choice was not kept.", error))
    return answer.move && move()
  } catch (error) {
    log("Moving to Applications failed.", error)
    return false
  }
}
