import { Sparkles } from "lucide-react"
import { useId, useState, useSyncExternalStore } from "react"

import { Popover } from "../ui-toolkit/Popover"
import { useUiState, useWorkspaceServices, useWorkspaceState } from "./controller/context"
import { offerable, offerText } from "./murmur-offer"
import { currentState } from "./selectors"

const never = (): (() => void) => () => {}

// Murmur's one-time offer, as a chip beside the title of the terminal whose agent finished a
// turn first, while its title is still the plain name of the agent. It shows until it is
// answered, on that terminal alone; there is no ×, and ignoring it costs nothing. It opens a
// popover (taking focus as a popover does, and handing it back to the terminal): Turn on
// starts the install, whose progress is the footer's; No thanks turns Murmur down for good;
// Esc or a click outside only closes it.
export const NameChip = ({
  terminalId,
  context,
}: {
  readonly terminalId: string
  readonly context: string
}): React.JSX.Element | null => {
  const { backend, commands } = useWorkspaceServices()
  const { murmur } = backend
  const state = useSyncExternalStore(murmur?.state.subscribe ?? never, () =>
    murmur?.state.getSnapshot(),
  )
  const target = useUiState((ui) => ui.nameOffer)
  const view = useWorkspaceState((workspace) => currentState(workspace).view)
  const [open, setOpen] = useState(false)
  const titleId = useId()
  if (
    !murmur ||
    !state ||
    target?.id !== terminalId ||
    target.context !== context ||
    !offerable(state)
  )
    return null
  // The terminal gets typing focus back once the popover is gone, whichever way it went.
  const back = (): void => {
    requestAnimationFrame(() => commands.setKeyboardFocus({ id: terminalId, view }))
  }
  const close = (): void => {
    setOpen(false)
    back()
  }
  return (
    <Popover
      label={offerText.title}
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      tooltip={offerText.chip}
      className="name-popover"
      trigger={
        <button
          type="button"
          className="name-chip nodrag nopan"
          aria-label={offerText.chip}
          aria-haspopup="dialog"
        >
          <Sparkles size={12} aria-hidden="true" />
          <span className="name-chip-label">{offerText.chip}</span>
        </button>
      }
    >
      <p id={titleId} className="name-popover-title">
        {offerText.title}
      </p>
      <p>{offerText.body(state)}</p>
      <p className="name-popover-quiet">{offerText.quiet}</p>
      <div className="name-popover-actions">
        <button
          type="button"
          className="button min-h-8 px-3"
          onClick={() => {
            murmur.set({ enabled: false })
            commands.offerNameTo(null)
            setOpen(false)
            back()
          }}
        >
          {offerText.decline}
        </button>
        <button
          type="button"
          className="button primary min-h-8 px-3"
          onClick={() => {
            commands.offerNameTo(null)
            setOpen(false)
            murmur.install()
            back()
          }}
        >
          {offerText.accept}
        </button>
      </div>
    </Popover>
  )
}
