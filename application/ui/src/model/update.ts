// An update the desktop app tells of. `downloading`: one the app is downloading, `percent`
// (a whole number from 0 to 100) along, which turns `ready` once downloaded, or
// `available` should the download fail. `ready`: downloaded, and installed on a restart.
// `available`: a newer release the app can't install itself, which the person gets from
// its release page. `notes` are the release's notes as plain-text lines.
export type UpdateOffer = {
  readonly kind: "downloading" | "ready" | "available"
  readonly version: string
  readonly notes: readonly string[]
  // Set only for `downloading`.
  readonly percent?: number
}

// Which releases the desktop app follows: stable ones, or every release as it is published.
export type UpdateChannel = "stable" | "early"
