import type { DemoMurmur } from "../murmur"
import type { DemoActionGroup } from "./types"

// The panel's Murmur group: the states of Preferences' Addons card, which shows each at once,
// and of the one-time offer card. The offer comes up on its own at the next agent finish
// (Agents > Completes) while Murmur is not installed, once per page load; once it is open it
// follows the states below (installing, failure, Not available), so set Not installed, finish
// a turn, then pick them.
export const murmurGroups = (murmur: DemoMurmur | undefined): readonly DemoActionGroup[] =>
  murmur
    ? [
        {
          section: "App",
          title: "Murmur",
          actions: [
            {
              label: "Installed",
              hint: "On, Runs on Intel Arc Graphics; no offer",
              run: () => murmur.show("installed"),
            },
            {
              label: "Not installed",
              hint: "Offer card at the next agent finish (once per page load); Addons shows Install",
              run: () => murmur.show("uninstalled"),
            },
            {
              label: "Installing",
              hint: "Addons, and the offer card once open, show Downloading model, half there, with Cancel",
              run: () => murmur.show("installing"),
            },
            {
              label: "Install fails (network)",
              hint: "Addons, and the offer card once open, show the failure with Try again, not a decline",
              run: () => murmur.show("network-failure"),
            },
            {
              label: "Install ends Not available",
              hint: "Not installed; the next Turn on or Install ends in Not available (the card leaves)",
              run: () => murmur.show("unsupported-after-install"),
            },
            {
              label: "Not available",
              hint: "Addons shows Not available on this computer, with Details and Check again; no offer",
              run: () => murmur.show("unsupported"),
            },
            {
              label: "Not available, files left",
              hint: "Addons shows Not available with Details and Check again beside Uninstall, no switch",
              run: () => murmur.show("unsupported-with-files"),
            },
            {
              label: "Not available (software rendering)",
              hint: "As Not available, from the host: Details has the reason, no Check again",
              run: () => murmur.show("unsupported-host"),
            },
          ],
        },
      ]
    : []
