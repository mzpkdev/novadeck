import { useEffect, useRef, useState, type ReactNode } from "react"

import type { ViewMode } from "../../model/types"
import type { TerminalLayoutControls } from "../WindowShell"
import { presentationOf, usePlan } from "./plan-state"
import { PlanReader } from "./PlanReader"
import { Taskbar } from "./Taskbar"

import "./plan.css"

const clamp = (value: number): number => Math.min(0.7, Math.max(0.22, value))

// Terminal left, plan right, inside the terminal's own window. The divider drags.
const SplitPlan = ({
  planId,
  view,
  children,
}: {
  planId: string
  view: ViewMode
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
      <div className="plan-split-reader nodrag nopan nowheel">
        <PlanReader planId={planId} presentation="split" />
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
  onReveal,
}: {
  planId: string
  onReveal: TerminalLayoutControls["onReveal"]
}): React.JSX.Element => {
  // Frame once as the sheet opens, not whenever the canvas hands over a new callback.
  const reveal = useRef(onReveal)
  useEffect(() => reveal.current?.(attachedExtent), [])
  return (
    <div className="plan-attached nodrag nopan nowheel">
      <PlanReader planId={planId} presentation="attached" />
    </div>
  )
}

// UI-only plan review, in the terminal's own window or beside its canvas node.
export const TerminalPlan = ({
  planId,
  view,
  onReveal,
  children,
  minimized,
  clipContent,
}: {
  planId: string
  view: ViewMode
  onReveal?: TerminalLayoutControls["onReveal"]
  children: ReactNode
  minimized?: boolean | undefined
  clipContent?: boolean | undefined
}): React.JSX.Element => {
  const plan = usePlan(planId)
  const trigger = useRef<HTMLButtonElement>(null)
  const presentation = presentationOf(view)
  const open = plan.open && !minimized
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
      {open && presentation === "split" ? (
        <SplitPlan planId={planId} view={view}>
          {children}
        </SplitPlan>
      ) : (
        children
      )}
      <Taskbar planId={planId} trigger={trigger} open={open} />
      {open && presentation === "attached" && <AttachedPlan planId={planId} onReveal={onReveal} />}
    </div>
  )
}
