import { FileText, Terminal } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import type { ViewMode } from "../../model/types"
import { Dialog, DialogTitle } from "../../ui-toolkit/Dialog"
import type { TerminalLayoutControls } from "../WindowShell"
import { notesIn, samplePlans, titleOf } from "./plan-content"
import { closePlan, openPlan, planActions, usePlan, usePresentations } from "./plan-state"
import { PlanReader } from "./PlanReader"

import "./plan.css"

// The plan's footprint in the terminal: what it is, whether it changed, the next move.
const PlanStrip = ({
  planId,
  trigger,
  open,
}: {
  planId: string
  trigger: React.RefObject<HTMLButtonElement | null>
  open: boolean
}): React.JSX.Element => {
  const file = samplePlans[planId]!
  const plan = usePlan(planId)
  const unread = plan.seen < plan.revision
  const changes = plan.changes
  const notes = notesIn(plan.text)
  const summary = [
    `v${plan.revision + 1}`,
    unread && changes ? `${changes} changes` : "",
    notes ? `${notes} note${notes > 1 ? "s" : ""} in the plan` : "",
  ]
    .filter(Boolean)
    .join(" · ")
  const toggle = (): void => planActions.update(planId, open ? closePlan : openPlan)
  return (
    <div className="plan-strip nodrag nopan" data-open={open}>
      <button
        ref={trigger}
        className="plan-strip-main"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="plan-strip-icon" aria-hidden="true">
          <FileText size={13} strokeWidth={1.5} />
          {unread && <i className="plan-strip-new" />}
        </span>
        <span className="plan-strip-text">
          <span className="plan-strip-title">
            {titleOf(file.path, plan.text)}
            {unread && <span className="sr-only"> (unread)</span>}
          </span>
          <span className="plan-strip-summary">{summary}</span>
        </span>
      </button>
      <button className="plan-button" onClick={toggle}>
        {open ? "Hide plan" : "Review"}
      </button>
    </div>
  )
}

const clamp = (value: number): number => Math.min(0.7, Math.max(0.22, value))

// Terminal left, plan right, inside the terminal's own window. The divider drags.
const SplitPlan = ({
  planId,
  view,
  children,
  closeRef,
}: {
  planId: string
  view: ViewMode
  children: ReactNode
  closeRef: React.RefObject<HTMLButtonElement | null>
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
      <div className="plan-split-reader nodrag nopan nowheel">
        <PlanReader planId={planId} view={view} presentation="split" closeRef={closeRef} />
      </div>
    </div>
  )
}

// Canvas units, matching .plan-attached.
const attachedExtent = { right: 20 + 720, height: 560 }

// A sheet hanging off the canvas node's right edge, so it pans and zooms with it. It is
// positioned against the node, outside the window's clipping.
const AttachedPlan = ({
  planId,
  closeRef,
  onReveal,
}: {
  planId: string
  closeRef: React.RefObject<HTMLButtonElement | null>
  onReveal: TerminalLayoutControls["onReveal"]
}): React.JSX.Element => {
  // Frame once as the sheet opens, not whenever the canvas hands over a new callback.
  const reveal = useRef(onReveal)
  useEffect(() => reveal.current?.(attachedExtent), [])
  return (
    <div className="plan-attached nodrag nopan nowheel">
      <PlanReader planId={planId} view="canvas" presentation="attached" closeRef={closeRef} />
    </div>
  )
}

// UI-only plan review. The originating terminal renders in one place at a time.
export const TerminalPlan = ({
  planId,
  terminalName,
  view,
  onReveal,
  children,
  minimized,
  clipContent,
}: {
  planId: string
  terminalName: string
  view: ViewMode
  onReveal?: TerminalLayoutControls["onReveal"]
  children: ReactNode
  minimized?: boolean | undefined
  clipContent?: boolean | undefined
}): React.JSX.Element => {
  const plan = usePlan(planId)
  const file = samplePlans[planId]!
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const presentation = usePresentations()[view]
  const open = plan.open && !minimized
  const inline = open && presentation !== "overlay"
  const wasOpen = useRef(open)
  // Inline presentations have no dialog to move focus, so do it here.
  useEffect(() => {
    if (inline && !wasOpen.current) close.current?.focus({ preventScroll: true })
    if (!open && wasOpen.current && presentation !== "overlay")
      trigger.current?.focus({ preventScroll: true })
    wasOpen.current = open
  }, [inline, open, presentation])
  return (
    <>
      <div
        className="terminal-plan"
        data-plan-open={open}
        hidden={minimized && !clipContent}
        aria-hidden={minimized}
        inert={minimized}
      >
        {open && presentation === "split" ? (
          <SplitPlan planId={planId} view={view} closeRef={close}>
            {children}
          </SplitPlan>
        ) : open && presentation === "overlay" ? (
          <div className="plan-open-placeholder">
            <FileText size={20} strokeWidth={1} />
            <span>Reviewing plan</span>
          </div>
        ) : (
          children
        )}
        <PlanStrip planId={planId} trigger={trigger} open={open} />
        {open && presentation === "attached" && view === "canvas" && (
          <AttachedPlan planId={planId} closeRef={close} onReveal={onReveal} />
        )}
      </div>
      <Dialog
        open={open && presentation === "overlay"}
        onOpenChange={(next) => planActions.update(planId, next ? openPlan : closePlan)}
        label={`Plan from ${file.agent}`}
        className="plan-dialog"
        backdropClassName="plan-backdrop"
        positionerClassName="plan-positioner"
        initialFocusEl={() => close.current}
        finalFocusEl={() => trigger.current}
        onEscapeKeyDown={(event) => {
          // Escape in a table's cell or row note cancels that, not the review.
          if ((event.target as Element | null)?.closest?.(".cm-plan-table-widget"))
            event.preventDefault()
        }}
      >
        <DialogTitle className="sr-only">Review plan</DialogTitle>
        <div className="plan-overlay">
          <section className="plan-terminal" aria-label={`${terminalName} terminal in plan review`}>
            <header className="plan-panel-heading">
              <Terminal size={13} />
              <span>{terminalName}</span>
              <span className="plan-panel-meta">{file.agent}</span>
            </header>
            <div className="plan-terminal-body">
              {open && presentation === "overlay" && children}
            </div>
          </section>
          <PlanReader planId={planId} view={view} presentation="overlay" closeRef={close} />
        </div>
      </Dialog>
    </>
  )
}
