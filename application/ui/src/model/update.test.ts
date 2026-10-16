import { describe, expect, it } from "../test"
import { offerToFetch, type UpdateOffer } from "./update"

const offer = (kind: UpdateOffer["kind"], version = "0.0.80"): UpdateOffer => ({
  kind,
  version,
  notes: [],
})

describe("the release a chip is shown for", () => {
  it("is an available release this page never saw downloading", () => {
    expect(offerToFetch(offer("available"), null)).toEqual(offer("available"))
    expect(offerToFetch(offer("available", "0.0.81"), "0.0.80")).toEqual(
      offer("available", "0.0.81"),
    )
  })

  it("is none for a download that failed, as the host tries again by itself", () => {
    expect(offerToFetch(offer("available"), "0.0.80")).toBeUndefined()
  })

  it("is none for an update downloading or ready, or no offer", () => {
    expect(offerToFetch(offer("downloading"), null)).toBeUndefined()
    expect(offerToFetch(offer("ready"), null)).toBeUndefined()
    expect(offerToFetch(null, null)).toBeUndefined()
  })
})
