// The run of the app a portable copy's card came up in, as the host names it
// (`PortableState.run`). It lives in local storage, which every window of the app shares
// and a relaunch finds again, so the run it was written in tells whether it is this
// launch's: the card comes up by itself once per launch, not once per page or per window,
// which macOS closes and opens again without ending the app. Without storage it is kept in
// memory, and a reload is a launch.
const updateRaisedStorageKey = "novadeck.update-raised"
let raisedInMemory: string | null = null

/** Whether the card was shown in `run`. */
export const readUpdateRaised = (run: string): boolean => {
  try {
    return localStorage.getItem(updateRaisedStorageKey) === run
  } catch {
    return raisedInMemory === run
  }
}

export const clearUpdateRaised = (): void => {
  raisedInMemory = null
  try {
    localStorage.removeItem(updateRaisedStorageKey)
  } catch {
    /* Nothing is kept. */
  }
}

/** Notes that the card was shown in `run`. */
export const writeUpdateRaised = (run: string): void => {
  try {
    localStorage.setItem(updateRaisedStorageKey, run)
  } catch {
    raisedInMemory = run
  }
}
