import { useEffect, useRef, useState, type ReactNode } from "react"

import type { CompanionKey, Companions } from "../../model/companion"
import type { Messages } from "../../model/messages"
import type { ViewMode } from "../../model/types"
import { usePresence, type Presence } from "../../ui-toolkit/presence"
import type { TerminalLayoutControls } from "../WindowShell"
import { CompanionPane } from "./CompanionPane"
import { useMail, type MailHandle } from "./mail"
import { presentationOf, shownTab, useCompanion, type CompanionHandle } from "./state"
import { Taskbar } from "./Taskbar"

import "./companion.css"

const clamp = (value: number): number => Math.min(0.7, Math.max(0.22, value))

// What the pane reads besides its plans and what was shown.
type MailProps = {
  mail: MailHandle
  peerName: (handle: string) => string | undefined
}

// Terminal left, plan right, inside the terminal's own window. The divider drags.
const SplitPlan = ({
  companion,
  mail,
  peerName,
  view,
  presence,
  children,
}: MailProps & {
  companion: CompanionHandle
  view: ViewMode
  presence: Presence
  children: ReactNode
}): React.JSX.Element => {
  const [ratio, setRatio] = useState(view === "focus" ? 0.36 : 0.42)
  const frame = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={frame}
      className="plan-split"
      style={{ "--plan-terminal": `${ratio * 100}%` } as React.CSSProperties}
    >
      <div className="plan-split-terminal">{children}</div>
      <div
        className="plan-divider nodrag nopan"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize plan"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={22}
        aria-valuemax={70}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setRatio((value) => clamp(value - 0.04))
          if (event.key === "ArrowRight") setRatio((value) => clamp(value + 0.04))
        }}
        onPointerDown={(event) => {
          const bounds = frame.current?.getBoundingClientRect()
          if (!bounds) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const move = (next: PointerEvent): void =>
            setRatio(clamp((next.clientX - bounds.left) / bounds.width))
          const target = event.currentTarget
          target.addEventListener("pointermove", move)
          target.addEventListener(
            "pointerup",
            () => target.removeEventListener("pointermove", move),
            { once: true },
          )
        }}
      />
      <div {...presence.props} className="plan-split-reader nodrag nopan nowheel">
        <CompanionPane companion={companion} mail={mail} peerName={peerName} presentation="split" />
      </div>
    </div>
  )
}

// Canvas units, matching .plan-attached.
const attachedExtent = { right: 20 + 720, height: 560 }

// A sheet hanging off the canvas node's right edge, so it pans and zooms with it. It is
// positioned against the node, outside the window's clipping.
const AttachedPlan = ({
  companion,
  mail,
  peerName,
  onReveal,
  presence,
}: MailProps & {
  companion: CompanionHandle
  onReveal: TerminalLayoutControls["onReveal"]
  presence: Presence
}): React.JSX.Element => {
  // Frame once as the sheet opens, not whenever the canvas hands over a new callback.
  const reveal = useRef(onReveal)
  useEffect(() => reveal.current?.(attachedExtent), [])
  return (
    <div {...presence.props} className="plan-attached nodrag nopan nowheel">
      <CompanionPane
        companion={companion}
        mail={mail}
        peerName={peerName}
        presentation="attached"
      />
    </div>
  )
}

// A terminal's companion: its taskbar, and the pane it opens in the terminal's own
// window or beside its canvas node. It wraps every terminal of a backend that reports
// companions or messages, so the terminal keeps its content when its agent first shows
// something.
export const TerminalCompanion = ({
  companions,
  messages,
  peerName,
  companionKey,
  view,
  onReveal,
  children,
  minimized,
  clipContent,
}: {
  companions: Companions
  messages?: Messages | undefined
  // The name of the terminal in this session with that handle, if it has one.
  peerName: (handle: string) => string | undefined
  companionKey: CompanionKey
  view: ViewMode
  onReveal?: TerminalLayoutControls["onReveal"]
  children: ReactNode
  minimized?: boolean | undefined
  clipContent?: boolean | undefined
}): React.JSX.Element => {
  const companion = useCompanion(companions, companionKey)
  const mail = useMail(messages, companionKey)
  const trigger = useRef<HTMLButtonElement>(null)
  const presentation = presentationOf(view)
  const present = companion.present || mail.present
  // Open while there's something to show, the messages among it.
  const open = companion.pane.open && !minimized && shownTab(companion.pane, mail.present) !== ""
  // The pane stays while it animates out. Only the pane animates: the terminal beside
  // it takes its new size once, never frame by frame.
  const shown = usePresence(open)
  const wasOpen = useRef(open)
  // Opening leaves focus on the taskbar. Hiding the pane from inside it (Escape) would
  // drop focus with the pane, so it goes back to the taskbar.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body
    if (!open && wasOpen.current && lost) trigger.current?.focus({ preventScroll: true })
    wasOpen.current = open
  }, [open])
  return (
    <div
      className="terminal-plan"
      data-plan-open={open}
      hidden={minimized && !clipContent}
      aria-hidden={minimized}
      inert={minimized}
    >
      {shown.mounted && presentation === "split" ? (
        <SplitPlan
          companion={companion}
          mail={mail}
          peerName={peerName}
          view={view}
          presence={shown}
        >
          {children}
        </SplitPlan>
      ) : (
        children
      )}
      {/* A terminal gains its taskbar once its agent has a plan, shows something, or can
          message others. */}
      {present && (
        <Taskbar
          companion={companion}
          mail={mail}
          peerName={peerName}
          trigger={trigger}
          open={open}
        />
      )}
      {shown.mounted && presentation === "attached" && (
        <AttachedPlan
          companion={companion}
          mail={mail}
          peerName={peerName}
          onReveal={onReveal}
          presence={shown}
        />
      )}
    </div>
  )
}
