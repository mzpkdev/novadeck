import { useEffect, useId, useRef, useState } from "react"

const copiedMs = 1500

// The fix to copy: a button that puts it on the clipboard and says so for a moment.
const CopyFix = ({ fix }: { readonly fix: string }): React.JSX.Element => {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), copiedMs)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className="button min-h-8 px-3"
      onClick={() => {
        void navigator.clipboard?.writeText(fix).then(
          () => setCopied(true),
          () => undefined,
        )
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

// Novadeck running without Electron's security sandbox, beside the footer's status: a
// chip, "No sandbox", and the notice above it, which says why and gives the one command
// that fixes it (`fix`, empty where none is known). Quiet like the update's chip: it
// never opens by itself, and the notice is a plain panel that takes no focus until the
// person opens it from the chip, where Escape closes it and returns.
export const FooterSandbox = ({
  fix,
  hidden,
}: {
  // Undefined while the app is sandboxed, or the host does not say.
  readonly fix: string | undefined
  readonly hidden: boolean
}): React.JSX.Element | null => {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  const requested = useRef(false)
  const titleId = useId()
  const panelId = useId()
  const visible = open && !hidden
  useEffect(() => {
    if (!visible || !requested.current) return
    // A frame on, after the click that asked has been through the workspace's own click
    // handling, which would hand focus back to the terminal from a panel focused too soon.
    const frame = requestAnimationFrame(() => {
      requested.current = false
      panel.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [visible])
  if (fix === undefined) return null
  const close = (): void => {
    const inside = panel.current?.contains(document.activeElement) === true
    requested.current = false
    setOpen(false)
    if (inside) chip.current?.focus()
  }
  return (
    <>
      <button
        ref={chip}
        type="button"
        className="footer-action footer-update cursor-pointer font-bold"
        aria-label="Running without the security sandbox"
        aria-expanded={visible}
        aria-controls={visible ? panelId : undefined}
        onClick={() => {
          if (visible) {
            close()
            return
          }
          requested.current = true
          setOpen(true)
        }}
      >
        <span className="max-[701px]:hidden">No sandbox</span>
        <span className="hidden max-[701px]:inline">Sandbox</span>
      </button>
      {visible && (
        <section
          ref={panel}
          id={panelId}
          data-workspace-notice
          aria-labelledby={titleId}
          className="floating update-panel"
          tabIndex={-1}
          // A click anywhere on it leaves focus where it was, in a terminal.
          onMouseDown={(event) => event.preventDefault()}
          // Plain Escape closes it; with Shift it goes on to the workspace, which
          // starts navigating.
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.shiftKey) return
            event.preventDefault()
            event.stopPropagation()
            close()
          }}
        >
          <p id={titleId} className="update-title">
            Novadeck is running without its security sandbox
          </p>
          <p className="sandbox-text">
            This system blocks the sandbox.
            {fix !== "" && " Run this command, then restart Novadeck."}
          </p>
          {fix !== "" && (
            <>
              <code className="sandbox-command">{fix}</code>
              <div className="update-actions">
                <CopyFix fix={fix} />
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}
