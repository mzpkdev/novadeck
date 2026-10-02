import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  companionKeyId,
  type CompanionKey,
  type CompanionWindow,
  type Companions,
} from "../../model/companion"
import type { Messages } from "../../model/messages"
import type { ViewMode } from "../../model/types"
import { usePresence, type Presence } from "../../ui-toolkit/presence"
import type { TerminalLayoutControls } from "../WindowShell"
import { CompanionPane } from "./CompanionPane"
import { useDragOver } from "./drag-over"
import type { Guest } from "./guests"
import { useMail, type MailHandle } from "./mail"
import { arrived, mailTab, planTab, type Shown } from "./pane"
import { guestId, usePlacements } from "./placement"
import { titleOf } from "./plan-text"
import {
  companionActions,
  placeItem,
  presentationOf,
  shownTab,
  useCompanion,
  useCompanionPanes,
  type CompanionHandle,
  type PlanDoc,
} from "./state"
import { Taskbar } from "./Taskbar"

import "./companion.css"

const noneUndocked: readonly string[] = []

// A terminal as it's named: its title, and its handle where it has one.
export type TerminalName = { readonly name: string; readonly handle?: string | undefined }

const clamp = (value: number): number => Math.min(0.7, Math.max(0.22, value))

// What the pane reads besides its plans and what was shown, and what undocks what it
// shows into a window of its own: something the agent showed, or the messages.
type MailProps = {
  mail: MailHandle
  peerName: (handle: string) => string | undefined
  openWindow: ((artifact: Shown) => void) | undefined
  undockMessages: (() => void) | undefined
  undockPlan: ((plan: PlanDoc) => void) | undefined
  // Other terminals' items placed on this one's bar, and the messages they read from.
  guests: readonly Guest[]
  messages: Messages | undefined
}

// Terminal left, plan right, inside the terminal's own window. The divider drags.
const SplitPlan = ({
  companion,
  mail,
  peerName,
  openWindow,
  undockMessages,
  undockPlan,
  guests,
  messages,
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
        <CompanionPane
          companion={companion}
          mail={mail}
          peerName={peerName}
          presentation="split"
          openWindow={openWindow}
          undockMessages={undockMessages}
          undockPlan={undockPlan}
          guests={guests}
          messages={messages}
        />
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
  openWindow,
  undockMessages,
  undockPlan,
  guests,
  messages,
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
        openWindow={openWindow}
        undockMessages={undockMessages}
        undockPlan={undockPlan}
        guests={guests}
        messages={messages}
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
  undock,
  undocked = noneUndocked,
  terminalOf,
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
  // Undocks something the agent showed, or the messages, into a window of its own.
  undock?: ((item: CompanionWindow["item"]) => void) | undefined
  // What of the companion is undocked now, by its id in the pane: plan tabs, artifact
  // ids, the messages' tab.
  undocked?: readonly string[] | undefined
  // A terminal in this session by its id, as it's named, for what's placed from it.
  terminalOf?: ((terminalId: string) => TerminalName | undefined) | undefined
}): React.JSX.Element => {
  const terminalCompanion = useCompanion(companions, companionKey)
  const placements = usePlacements(companions)
  const panes = useCompanionPanes(companions)
  const own = companionKeyId(companionKey)
  // What's out lives elsewhere until it comes back: undocked in its window, or placed on
  // another terminal's bar. The pane neither lists nor shows it.
  const out = useMemo(
    () =>
      new Set([
        ...undocked,
        ...placements.filter((each) => companionKeyId(each.from) === own).map((each) => each.item),
      ]),
    [undocked, placements, own],
  )
  const companion = useMemo(() => {
    if (!out.size) return terminalCompanion
    const { pane } = terminalCompanion
    const plans = pane.plans.filter((plan) => !out.has(planTab(plan.ref)))
    const artifacts = pane.artifacts.filter((shown) => !out.has(shown.id))
    return {
      ...terminalCompanion,
      pane: { ...pane, plans, artifacts },
      present: plans.length > 0 || artifacts.length > 0,
    }
  }, [terminalCompanion, out])
  // Other terminals' items placed on this one's bar, as their terminals have them now.
  const guests = useMemo(
    (): readonly Guest[] =>
      placements.flatMap((placement): Guest[] => {
        if (companionKeyId(placement.to) !== own) return []
        const pane = panes[companionKeyId(placement.from)]
        const origin = terminalOf?.(placement.from.terminalId)
        if (!origin) return []
        const base = {
          id: guestId(placement.from, placement.item),
          from: placement.from,
          item: placement.item,
          origin,
          companion: {
            ...companionActions(companions, placement.from),
            pane: pane ?? terminalCompanion.pane,
            present: true,
          },
        }
        if (placement.item === mailTab) return messages ? [{ ...base, kind: "mail" }] : []
        if (!pane) return []
        const plan = pane.plans.find((each) => planTab(each.ref) === placement.item)
        if (plan) return [{ ...base, kind: "plan", plan }]
        const artifact = pane.artifacts.find((each) => each.id === placement.item)
        return artifact ? [{ ...base, kind: "artifact", artifact }] : []
      }),
    [placements, panes, own, terminalOf, companions, messages, terminalCompanion.pane],
  )
  const guestIds = useMemo(() => guests.map((guest) => guest.id), [guests])
  // Places one of this bar's items, or a guest, on another terminal's bar by its id.
  const placeOn = (from: CompanionKey, item: string, terminalId: string): void =>
    placeItem(companions, from, item, { ...companionKey, terminalId })
  // An icon dragged over this terminal: the bar a drop would land on.
  const over = useDragOver()
  const hovered =
    over !== null &&
    over.source !== companionKey.terminalId &&
    over.terminal === companionKey.terminalId
  const terminalMail = useMail(messages, companionKey)
  // The messages join the taskbar's order when the terminal first has them, after what
  // came before.
  const mailKnown = terminalCompanion.pane.order?.includes(mailTab) ?? false
  useEffect(() => {
    if (terminalMail.present && !mailKnown)
      terminalCompanion.update((pane) => arrived(pane, mailTab))
  }, [terminalMail.present, mailKnown, terminalCompanion])
  const mail = out.has(mailTab) ? { ...terminalMail, present: false } : terminalMail
  const moveToWindow =
    undock &&
    (({ fresh: _fresh, at: _at, ...ref }: Shown): void => undock({ kind: "artifact", ref }))
  const undockMessages = undock && ((): void => undock({ kind: "messages" }))
  const undockPlan =
    undock &&
    ((plan: PlanDoc): void =>
      undock({ kind: "plan", ref: plan.ref, name: titleOf(plan.path, plan.text) }))
  const trigger = useRef<HTMLButtonElement>(null)
  const presentation = presentationOf(view)
  const present = companion.present || mail.present || guests.length > 0
  // Open while there's something to show, the messages among it.
  const open =
    companion.pane.open && !minimized && shownTab(companion.pane, mail.present, guestIds) !== ""
  // The pane stays while it animates out. Only the pane animates: the terminal beside
  // it takes its new size once, never frame by frame.
  const shown = usePresence(open)
  // The taskbar too, once the terminal first has something to show.
  const bar = usePresence(present)
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
          openWindow={moveToWindow}
          undockMessages={undockMessages}
          undockPlan={undockPlan}
          guests={guests}
          messages={messages}
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
      {bar.mounted && (
        <Taskbar
          companion={companion}
          mail={mail}
          peerName={peerName}
          openWindow={moveToWindow}
          undockMessages={undockMessages}
          undockPlan={undockPlan}
          guests={guests}
          messages={messages}
          placeOn={placeOn}
          dropTarget={hovered && over.onBar}
          trigger={trigger}
          open={open}
          presence={bar}
        />
      )}
      {/* Nothing to show yet, but an icon is dragged over: an empty bar to drop it on. */}
      {hovered && !bar.mounted && (
        <div
          className="plan-taskbar plan-taskbar-empty nodrag nopan"
          data-drop-target={over.onBar || undefined}
        >
          <span className="plan-tb-empty-hint">Drop here to show it on this terminal</span>
        </div>
      )}
      {shown.mounted && presentation === "attached" && (
        <AttachedPlan
          companion={companion}
          mail={mail}
          peerName={peerName}
          openWindow={moveToWindow}
          undockMessages={undockMessages}
          undockPlan={undockPlan}
          guests={guests}
          messages={messages}
          onReveal={onReveal}
          presence={shown}
        />
      )}
    </div>
  )
}
