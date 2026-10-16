import { vi } from "vitest"

import type { VoiceChange } from "../model/voice"
import { describe, expect, it } from "../test"
import { createUiStore, initialUi } from "./ui-store"
import { acceptVoiceOffer, declineVoiceOffer, dismissVoiceOffer, offerVoice } from "./voice-offer"

const store = () =>
  createUiStore(
    initialUi({
      location: {
        route: { dialog: null } as never,
        dialogDepth: 0,
        navigationType: "POP",
      },
      preferences: {} as never,
    }),
  )

describe("voice input's offer", () => {
  it("opens, and counts as this run's addon offer", () => {
    const ui = store()
    expect(ui.getSnapshot()).toMatchObject({ voiceOffer: false, addonOfferShown: false })
    offerVoice(ui)
    expect(ui.getSnapshot()).toMatchObject({ voiceOffer: true, addonOfferShown: true })
  })

  it("closes on Esc or a click outside without installing or declining", () => {
    const ui = store()
    offerVoice(ui)
    dismissVoiceOffer(ui)
    expect(ui.getSnapshot().voiceOffer).toBe(false)
    // Still counted as shown, so no other addon offers itself unasked this run.
    expect(ui.getSnapshot().addonOfferShown).toBe(true)
    offerVoice(ui)
    expect(ui.getSnapshot().voiceOffer).toBe(true)
  })

  it("installs on Turn on", () => {
    const ui = store()
    const install = vi.fn<() => void>()
    offerVoice(ui)
    acceptVoiceOffer(ui, { install })
    expect(install).toHaveBeenCalledOnce()
    expect(ui.getSnapshot().voiceOffer).toBe(false)
  })

  it("turns voice input off by choice on No thanks", () => {
    const ui = store()
    const set = vi.fn<(change: VoiceChange) => void>()
    offerVoice(ui)
    declineVoiceOffer(ui, { set })
    expect(set).toHaveBeenCalledWith({ enabled: false })
    expect(ui.getSnapshot().voiceOffer).toBe(false)
  })
})
