import { useRef, useState } from "react"

import { Dialog, DialogDescription, DialogTitle } from "../ui-toolkit/Dialog"

import motion from "../ui-toolkit/ModalMotion.module.css"

// Tells the person the backend stopped restarting their terminals after repeated crashes,
// and offers to try again. "Try again" is focused first, as retrying is the safe choice;
// "Not now", Escape and a click outside leave it until the next crash loop.
export const CrashLoopDialog = ({
  crashes,
  onRetry,
  onDismiss,
}: {
  // Crashes counted in the last minute; the dialog is open while this is set.
  readonly crashes: number | null
  readonly onRetry: () => void
  readonly onDismiss: () => void
}): React.JSX.Element => {
  // Keeps the text on screen while the dialog animates out.
  const [shown, setShown] = useState(crashes)
  if (crashes !== null && crashes !== shown) setShown(crashes)
  const retrying = useRef(false)
  const retry = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={crashes !== null}
      role="alertdialog"
      closeOnInteractOutside
      onOpenChange={(open) => {
        if (!open && !retrying.current) onDismiss()
      }}
      onExitComplete={() => {
        retrying.current = false
      }}
      label="The runner keeps crashing"
      initialFocusEl={() => retry.current}
      backdropClassName={`${motion.backdrop} fixed inset-0 z-50 bg-scrim backdrop-blur-[3px]`}
      positionerClassName="fixed inset-0 z-50 flex items-center justify-center px-5"
      className={`${motion.dialog} flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 rounded-popover border border-line-strong bg-paper p-5 text-ink shadow-modal`}
    >
      <DialogTitle className="m-0 text-[14px] font-medium tracking-[-0.2px]">
        The runner keeps crashing
      </DialogTitle>
      <DialogDescription className="m-0 text-[12px] leading-[1.5] text-muted">
        {shown
          ? `NovaDeck stopped restarting your terminals after ${shown} crashes in a minute.`
          : "NovaDeck stopped restarting your terminals after repeated crashes."}
      </DialogDescription>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-control border border-line-strong bg-paper px-3 py-1.5 text-[12px] text-ink shadow-control transition-[background] duration-(--motion-feedback) hover:bg-soft"
          onClick={onDismiss}
        >
          Not now
        </button>
        <button
          ref={retry}
          type="button"
          className="rounded-control border border-strong bg-strong px-3 py-1.5 text-[12px] text-white shadow-control transition-[opacity] duration-(--motion-feedback) hover:opacity-90"
          onClick={() => {
            retrying.current = true
            onRetry()
          }}
        >
          Try again
        </button>
      </div>
    </Dialog>
  )
}
