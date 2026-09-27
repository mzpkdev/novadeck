import { useRef, useState } from "react"

import type { TerminalMetadata } from "../model/types"
import { Dialog, DialogCloseTrigger, DialogDescription, DialogTitle } from "../ui-toolkit/Dialog"

import motion from "../ui-toolkit/ModalMotion.module.css"

export type CloseTerminalDialogProps = {
  // The terminal waiting to close, or null when nothing asks.
  readonly terminal: Pick<TerminalMetadata, "id" | "name" | "process"> | null
  readonly onConfirm: () => void
  readonly onCancel: () => void
  // Where focus goes back when the person keeps the terminal.
  readonly returnFocus: (terminalId: string) => HTMLElement | null
}

// Asks before closing a terminal a program still runs in, since closing ends it.
// Cancel is focused first, as the safe choice; Escape and a click outside cancel too.
export const CloseTerminalDialog = ({
  terminal,
  onConfirm,
  onCancel,
  returnFocus,
}: CloseTerminalDialogProps): React.JSX.Element => {
  // Keeps the question on screen while the dialog animates out.
  const [shown, setShown] = useState(terminal)
  if (terminal && terminal !== shown) setShown(terminal)
  const confirmed = useRef(false)
  const name = shown?.name ?? ""
  const program = shown?.process || "A program"
  return (
    <Dialog
      open={terminal !== null}
      role="alertdialog"
      closeOnInteractOutside
      onOpenChange={(open) => {
        if (!open && !confirmed.current) onCancel()
      }}
      onExitComplete={() => {
        confirmed.current = false
      }}
      label={`Close "${name}"?`}
      finalFocusEl={() => (confirmed.current || !shown ? null : returnFocus(shown.id))}
      backdropClassName={`${motion.backdrop} fixed inset-0 z-50 bg-scrim backdrop-blur-[3px]`}
      positionerClassName="fixed inset-0 z-50 flex items-center justify-center px-5"
      className={`${motion.dialog} flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 rounded-popover border border-line-strong bg-paper p-5 text-ink shadow-modal`}
    >
      <DialogTitle className="m-0 text-[14px] font-medium tracking-[-0.2px]">
        Close “{name}”?
      </DialogTitle>
      <DialogDescription className="m-0 text-[12px] leading-[1.5] text-muted">
        {program} is still running in it.
      </DialogDescription>
      <div className="mt-3 flex justify-end gap-2">
        <DialogCloseTrigger className="rounded-control border border-line-strong bg-paper px-3 py-1.5 text-[12px] text-ink shadow-control transition-[background] duration-(--motion-feedback) hover:bg-soft">
          Cancel
        </DialogCloseTrigger>
        <button
          type="button"
          className="rounded-control border border-strong bg-strong px-3 py-1.5 text-[12px] text-white shadow-control transition-[opacity] duration-(--motion-feedback) hover:opacity-90"
          onClick={() => {
            confirmed.current = true
            onConfirm()
          }}
        >
          Close terminal
        </button>
      </div>
    </Dialog>
  )
}
