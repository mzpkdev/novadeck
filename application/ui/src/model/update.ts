// An update the desktop app tells of. `ready`: downloaded, and installed on a restart.
// `available`: a newer release the app can't install itself, which the person gets from
// its release page. `notes` are the release's notes as plain-text lines.
export type UpdateOffer = {
  readonly kind: "ready" | "available"
  readonly version: string
  readonly notes: readonly string[]
  // When the release was published, as an ISO 8601 date-time; absent when the host
  // couldn't read one.
  readonly releasedAt?: string
}

// Which releases the desktop app follows: stable ones, or every release as it is published.
export type UpdateChannel = "stable" | "early"

// What the person has been shown of an offer: its version and kind, so an update that
// turns from ready to available, which the person must now fetch by hand, tells again.
export const updateKey = ({ kind, version }: UpdateOffer): string => `${kind}:${version}`

// How far behind a portable copy may fall before its notice comes up at every launch.
export const staleAfterMs = 14 * 24 * 60 * 60 * 1000

// Whether the release the offer tells of is `staleAfterMs` old or more at `now`. A
// release with no readable date is not.
export const releaseStale = ({ releasedAt }: UpdateOffer, now: number): boolean => {
  const released = releasedAt === undefined ? Number.NaN : Date.parse(releasedAt)
  return now - released >= staleAfterMs
}

// Whether a portable copy is asked at every launch for this offer: a release to fetch,
// and a stale one.
export const portableNagged = (offer: UpdateOffer, now: number): boolean =>
  offer.kind === "available" && releaseStale(offer, now)

// Whether an offer's notice comes up as the offer is heard. It does once per version and
// kind (`seen` is what was shown last). A portable copy, which can't update itself, is
// asked again at every launch once its release is stale: `known` is whether this run has
// heard the offer already, so a repeated offer does not bring the notice back after Later.
export const noticeRaised = (
  offer: UpdateOffer,
  {
    seen,
    portable,
    known,
    now,
  }: {
    readonly seen: string | null
    readonly portable: boolean
    readonly known: boolean
    readonly now: number
  },
): boolean => updateKey(offer) !== seen || (portable && !known && portableNagged(offer, now))
