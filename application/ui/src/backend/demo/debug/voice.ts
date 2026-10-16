import type { DemoVoice } from "../voice"
import type { DemoActionGroup } from "./types"

// Presses Ctrl+Shift+M as a person would, which opens the offer while voice input is not
// installed; the window's keyboard routing takes it as it takes the keys themselves.
const pressChord = (): void => {
  const init = { key: "M", code: "KeyM", ctrlKey: true, shiftKey: true, bubbles: true }
  window.dispatchEvent(new KeyboardEvent("keydown", init))
  window.dispatchEvent(new KeyboardEvent("keyup", init))
}

// The panel's Voice input group: the states of the offer the mic and Ctrl+Shift+M open, of
// the install card in the corner, and of the mic once declined.
export const voiceGroups = (voice: DemoVoice | undefined): readonly DemoActionGroup[] =>
  voice
    ? [
        {
          section: "App",
          title: "Voice input",
          actions: [
            {
              label: "Installed",
              hint: "On; the mic and Ctrl+Shift+M dictate; no offer",
              run: () => voice.show("installed"),
            },
            {
              label: "Not installed",
              hint: "The mic or Ctrl+Shift+M opens the offer; Esc or a click outside offers again next time",
              run: () => voice.show("uninstalled"),
            },
            {
              label: "Offer dialog",
              hint: "Opens the offer: Voice input, its size, Turn on and No thanks",
              run: () => {
                voice.show("uninstalled")
                pressChord()
              },
            },
            {
              label: "Software rendering",
              hint: "Not installed; the offer quotes small's smaller size and Turn on installs small only",
              run: () => voice.show("software-graphics"),
            },
            {
              label: "Installing",
              hint: "Corner card shows Downloading model, half there, with Cancel",
              run: () => voice.show("installing"),
            },
            {
              label: "Install, then ready",
              hint: "Corner card follows the steps, then says Voice input ready for a few seconds",
              run: () => voice.show("install-and-finish"),
            },
            {
              label: "Install, turbo too slow",
              hint: "Corner card follows turbo, then small's model and check, then says ready; turbo is gone",
              run: () => voice.show("install-fallback"),
            },
            {
              label: "Install fails (network)",
              hint: "Corner card shows the failure with Try again, not a decline",
              run: () => voice.show("network-failure"),
            },
            {
              label: "Declined",
              hint: "No mic in agent terminals, and Ctrl+Shift+M reaches the terminal; Addons still offers it",
              run: () => voice.show("declined"),
            },
          ],
        },
      ]
    : []
