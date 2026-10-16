import type { Voice } from "../model/voice"
import type { UiStore } from "./ui-store"

// Voice input is offered once, when the person reaches for the mic or its shortcut before
// it is installed. Nothing downloads without a click: Turn on installs it, No thanks turns
// it off by choice (the mic goes, and the shortcut is the terminal's again), and anything
// else, such as Esc, leaves it for the next time they reach for it.

// Opens the offer. It counts as this run's one unasked addon offer (see `addonOfferShown`).
export const offerVoice = (ui: UiStore): void =>
  void ui.update((state) =>
    state.voiceOffer && state.addonOfferShown
      ? state
      : { ...state, voiceOffer: true, addonOfferShown: true },
  )

const close = (ui: UiStore): void =>
  void ui.update((state) => (state.voiceOffer ? { ...state, voiceOffer: false } : state))

// Esc or a click outside: not an answer.
export const dismissVoiceOffer = close

// Turn on: the install starts, and its card shows how it goes.
export const acceptVoiceOffer = (ui: UiStore, voice: Pick<Voice, "install">): void => {
  close(ui)
  voice.install()
}

// No thanks: remembered, as voice input being off.
export const declineVoiceOffer = (ui: UiStore, voice: Pick<Voice, "set">): void => {
  close(ui)
  voice.set({ enabled: false })
}
