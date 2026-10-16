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

// The release a copy shows its footer chip for, to fetch by hand: an `available` offer, unless
// this page saw that version downloading (`downloaded`), as a copy that updates itself does
// before its download fails. That copy shows only its bar, as the host tries again by itself;
// the chip is for a copy that only tells (a release it can't install) and for an install on
// quit that failed, which a launch reports.
export const offerToFetch = (
  offer: UpdateOffer | null,
  downloaded: string | null,
): UpdateOffer | undefined =>
  offer?.kind === "available" && offer.version !== downloaded ? offer : undefined
