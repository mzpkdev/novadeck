import { useSyncExternalStore } from "react"

import { dictationKeys, installSize, formatSize } from "../preferences/voice-addon"
import { VoiceOfferDialog } from "../voice/VoiceOfferDialog"
import { useUiState, useWorkspaceServices } from "./controller/context"
import { acceptVoiceOffer, declineVoiceOffer, dismissVoiceOffer } from "./voice-offer"
import { VoiceInstallCard } from "./VoiceInstallCard"

const never = (): (() => void) => () => {}

// Voice input's one-time offer and its install card. The offer opens when the person
// reaches for the mic or Ctrl+Shift+M before voice input is installed; the card, in the
// corner stack, follows its first install.
export const VoiceOffer = (): React.JSX.Element | null => {
  const { backend, ui } = useWorkspaceServices()
  const { voice } = backend
  const state = useSyncExternalStore(voice?.state.subscribe ?? never, () =>
    voice?.state.getSnapshot(),
  )
  const open = useUiState((current) => current.voiceOffer)
  if (!voice || !state) return null
  const keys = dictationKeys()
  return (
    <>
      <VoiceOfferDialog
        open={open}
        keys={keys}
        size={formatSize(installSize(state))}
        onTurnOn={() => acceptVoiceOffer(ui, voice)}
        onNoThanks={() => declineVoiceOffer(ui, voice)}
        onDismiss={() => dismissVoiceOffer(ui)}
      />
      <VoiceInstallCard
        state={state}
        keys={keys}
        onInstall={voice.install}
        onCancel={voice.cancel}
      />
    </>
  )
}
