import { X } from "lucide-react"
import { useEffect, useId, useRef } from "react"

import { Progress } from "./Progress"

// The fixed bottom-right stack the app's corner cards sit in, newest last. Mounted once
// (app/WorkspaceOverlays); a card is a child of it, and an empty stack shows nothing.
// `beside` says another panel holds the corner's right edge (the footer's update or sandbox
// notice): the stack sits to its left, and on a narrow page gives way until it closes.
// `returnFocus` is called when the control that had focus inside a card goes (a button the
// card swaps for another, or the card leaving), so focus does not drop to the page.
export const CornerCardStack = ({
  children,
  beside = false,
  returnFocus,
}: {
  readonly children?: React.ReactNode
  readonly beside?: boolean
  readonly returnFocus?: () => void
}): React.JSX.Element => {
  const stack = useRef<HTMLDivElement>(null)
  const back = useRef(returnFocus)
  useEffect(() => {
    back.current = returnFocus
  }, [returnFocus])
  useEffect(() => {
    const element = stack.current
    if (!element) return undefined
    // The control that holds focus in the stack, until it leaves it by choice.
    let held: EventTarget | null = null
    const focused = (event: FocusEvent): void => {
      held = event.target
    }
    const left = (event: FocusEvent): void => {
      const target = event.target
      // A control that went with its card is still gone a moment on; one the person left is not.
      queueMicrotask(() => {
        if (held === target && target instanceof Node && target.isConnected) held = null
      })
    }
    const observer = new MutationObserver(() => {
      if (!(held instanceof Node) || held.isConnected) return
      held = null
      if (!document.activeElement || document.activeElement === document.body) back.current?.()
    })
    element.addEventListener("focusin", focused)
    element.addEventListener("focusout", left)
    observer.observe(element, { childList: true, subtree: true })
    return () => {
      element.removeEventListener("focusin", focused)
      element.removeEventListener("focusout", left)
      observer.disconnect()
    }
  }, [])
  return (
    <div ref={stack} className="corner-stack" data-corner-stack data-beside={beside || undefined}>
      {children}
    </div>
  )
}

export type CornerCardProps = {
  readonly title: string
  // The card's words: paragraphs, or `<p className="corner-card-quiet">` for a quiet line,
  // `<p className="corner-card-error">` for a failure.
  readonly children?: React.ReactNode
  // Bar for work; `label` names it for assistive technology. `indeterminate` is work with no
  // size to show.
  readonly progress?: {
    readonly label: string
    readonly value: number
    readonly max: number
    readonly indeterminate?: boolean
  }
  // Buttons, laid out at the card's end.
  readonly actions?: React.ReactNode
  // A few words beside the buttons that stand in, on a page too narrow for a tall card, for
  // the body marked `corner-card-detail`.
  readonly note?: React.ReactNode
  // Shows a close button that calls this; without it the card has none.
  readonly onClose?: () => void
  // What assistive technology is told when the card arrives or this changes; the title (itself
  // the live text) when omitted. Keep it stable: progress and detail in the card are not announced as they change.
  readonly announce?: string
  // The card reports a problem: announced at once instead of politely.
  readonly urgent?: boolean
}

// A calm, non-modal card for something the person may take up or ignore: it never takes
// focus, intercepts keys, or blocks the page, and a press on it leaves focus where it was
// (in a terminal). Reachable by Tab like any control. Only a short summary is live, so a
// progress bar ticking does not read out again and again.
export const CornerCard = ({
  title,
  children,
  progress,
  actions,
  note,
  onClose,
  announce,
  urgent = false,
}: CornerCardProps): React.JSX.Element => {
  const titleId = useId()
  return (
    <section
      className="corner-card floating"
      aria-labelledby={titleId}
      // A click anywhere on it leaves focus where it was.
      onMouseDown={(event) => event.preventDefault()}
    >
      {announce === undefined ? (
        <p id={titleId} role={urgent ? "alert" : "status"} className="corner-card-title">
          {title}
        </p>
      ) : (
        <>
          <span role={urgent ? "alert" : "status"} className="sr-only">
            {announce}
          </span>
          <p id={titleId} className="corner-card-title">
            {title}
          </p>
        </>
      )}
      {children && <div className="corner-card-body">{children}</div>}
      {progress && <Progress {...progress} />}
      {(actions || note) && (
        <div className="corner-card-actions">
          {note && <span className="corner-card-note">{note}</span>}
          {actions}
        </div>
      )}
      {onClose && (
        <button
          type="button"
          className="icon-button corner-card-close size-7"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      )}
    </section>
  )
}
