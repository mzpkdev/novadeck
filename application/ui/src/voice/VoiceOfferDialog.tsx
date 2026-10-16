import { useRef } from "react"

import { Chord } from "../ui-toolkit/Chord"
import { Dialog, DialogDescription, DialogTitle } from "../ui-toolkit/Dialog"

// Voice input's one-time offer, shown when the person reaches for the mic or its shortcut
// before it is installed. Turn on and No thanks are answers; Esc and a click outside only
// close it, so the next reach offers again.
export const VoiceOfferDialog = ({
  open,
  keys,
  size,
  onTurnOn,
  onNoThanks,
  onDismiss,
}: {
  readonly open: boolean
  // The dictation shortcut's keys; absent when the app has none.
  readonly keys: readonly string[] | undefined
  // What the install downloads, as "602 MB".
  readonly size: string
  readonly onTurnOn: () => void
  readonly onNoThanks: () => void
  readonly onDismiss: () => void
}): React.JSX.Element => {
  const answered = useRef(false)
  const turnOn = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      closeOnInteractOutside
      onOpenChange={(next) => {
        if (!next && !answered.current) onDismiss()
      }}
      onExitComplete={() => {
        answered.current = false
      }}
      label="Voice input"
      initialFocusEl={() => turnOn.current}
      backdropClassName="overlay fixed inset-0 z-50"
      positionerClassName="fixed inset-0 z-50 flex items-center justify-center px-5"
      className="modal w-[min(380px,calc(100vw-32px))] flex flex-col gap-2 p-5"
    >
      <DialogTitle className="modal-title m-0 text-heading font-medium">Voice input</DialogTitle>
      <DialogDescription className="modal-description m-0 flex flex-col gap-2 text-body">
        <span>
          {keys ? (
            <>
              Hold <Chord keys={keys} /> or click the mic
            </>
          ) : (
            "Click the mic"
          )}{" "}
          and talk to your agents. It runs on this computer and downloads {size} once.
        </span>
        <span className="settings-description text-control">
          You can turn it on later in Preferences → Addons.
        </span>
      </DialogDescription>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="button"
          onClick={() => {
            answered.current = true
            onNoThanks()
          }}
        >
          No thanks
        </button>
        <button
          ref={turnOn}
          type="button"
          className="button primary"
          onClick={() => {
            answered.current = true
            onTurnOn()
          }}
        >
          Turn on
        </button>
      </div>
    </Dialog>
  )
}
