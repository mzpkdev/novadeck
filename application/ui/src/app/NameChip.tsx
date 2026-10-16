import { Sparkles } from "lucide-react"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"

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
  const { backend, commands, ui } = useWorkspaceServices()
  const { murmur } = backend
  const murmurState = useSyncExternalStore(murmur?.state.subscribe ?? never, () =>
    murmur?.state.getSnapshot(),
  )
  const target = useUiState((state) => state.nameOffer)
  // Whether another offer (voice input's) has taken the run's mark.
  const taken = useUiState((state) => state.addonOfferShown)
  const view = useWorkspaceState((workspace) => currentState(workspace).view)
  const [open, setOpen] = useState(false)
  // Whether the popover closed by a press outside it, where focus belongs to whatever was pressed.
  const outside = useRef(false)
  const titleId = useId()
  const drawn =
    murmur !== undefined &&
    murmurState !== undefined &&
    target?.id === terminalId &&
    target.context === context &&
    offerable(murmurState) &&
    // Once counted the chip is the one the run's mark is for; before that, a mark someone
    // else took means the chip never comes up.
    (target.counted === true || !taken)
  // The chip's own button, once it is drawn.
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  // Counted once it is seen, not when it was meant to be: a window panned out of the Canvas's
  // view draws it unseen. The run's mark keeps voice input's offer from coming up too, and the
  // runner counts the session.
  useEffect(() => {
    if (!drawn || !button || ui.getSnapshot().addonOfferShown) return undefined
    const count = (): void => {
      if (ui.getSnapshot().addonOfferShown) return
      // Counted first, so the mark taken next never reads as another offer's.
      if (target) commands.offerNameTo({ ...target, counted: true })
      commands.markAddonOfferShown()
      murmur?.set({ offered: true })
    }
    // Where nothing can say what is in view, it is counted as drawn.
    if (typeof IntersectionObserver === "undefined") {
      count()
      return undefined
    }
    const watching = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      watching.disconnect()
      count()
    })
    watching.observe(button)
    return () => watching.disconnect()
  }, [drawn, button, ui, commands, murmur, target])
  if (!drawn || !murmur || !murmurState) return null
  // The terminal gets typing focus back once the popover is gone by an answer or Esc; one
  // that closed by a press elsewhere leaves focus where the person put it.
  const back = (): void => {
    if (outside.current) {
      outside.current = false
      return
    }
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
      // Not on a button: a reflexive Enter must not turn Murmur down for good.
      initialFocus={() => document.getElementById(titleId)}
      restoreFocus={false}
      onInteractOutside={() => {
        outside.current = true
      }}
      trigger={
        <button
          ref={setButton}
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
      {/* Presses in this portal reach the window's header through React, which a right-click
          here must not: the terminal's own menu is not this popover's. */}
      <div className="name-popover-body" onContextMenu={(event) => event.stopPropagation()}>
        <p id={titleId} tabIndex={-1} className="update-title">
          {offerText.title}
        </p>
        <p>{offerText.body(murmurState)}</p>
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
      </div>
    </Popover>
  )
}
