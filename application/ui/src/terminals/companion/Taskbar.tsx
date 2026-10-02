import {
  Accessibility,
  AutoScroller,
  Cursor,
  Feedback,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { FileStack, FileText, MessagesSquare, Pause, type LucideIcon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"

import type { ArtifactKind, CompanionKey, UndockPlace } from "../../model/companion"
import { mailBadgeLabel, type Messages } from "../../model/messages"
import { ContextMenu, type ContextMenuItem } from "../../ui-toolkit/ContextMenu"
import { HoverCard } from "../../ui-toolkit/HoverCard"
import { Portal } from "../../ui-toolkit/Portal"
import type { Presence } from "../../ui-toolkit/presence"
import { dropPreview, dropSpaceAt, requestDropPlace } from "../drop-space"
import { ArtifactThumb, iconOf, kindIcons } from "./ArtifactViewer"
import { dragOver, dragTargetAt } from "./drag-over"
import type { Guest } from "./guests"
import { useMail, type MailHandle } from "./mail"
import {
  arrange,
  close,
  mailTab,
  moveSlot,
  pickFromGroup,
  planTab,
  reorderBar,
  slotKey,
  slotsOf,
  type BarSlot,
  type Shown,
} from "./pane"
import { Peek, type Indicator, type PeekEntry } from "./Peek"
import { headingsOf, titleOf } from "./plan-text"
import {
  closePane,
  openTab,
  shownTab,
  unread,
  useArtifactContent,
  type CompanionHandle,
  type PlanDoc,
} from "./state"
import { beyond, refuseDrop, tether, tetherPoint } from "./tether"

// The plan in miniature: its title over its sections.
const PlanThumb = ({ plan }: { plan: PlanDoc }): React.JSX.Element => (
  <span className="peek-plan">
    <b>{titleOf(plan.path, plan.text)}</b>
    {headingsOf(plan.text)
      .slice(0, 4)
      .map((heading) => (
        <span key={heading.at}>{heading.text}</span>
      ))}
  </span>
)

const LoadedPreview = ({
  companion,
  artifact,
}: {
  companion: CompanionHandle
  artifact: Shown
}): React.JSX.Element | null => <ArtifactThumb load={useArtifactContent(companion, artifact)} />

// The threads in miniature: the agents they're with, latest first.
const MailThumb = ({
  mail,
  peerName,
}: {
  mail: MailHandle
  peerName: (handle: string) => string | undefined
}): React.JSX.Element => {
  const threads = mail.mail?.threads ?? []
  return (
    <span className="peek-plan peek-mail">
      <b>{threads.length ? "Threads" : "No messages yet"}</b>
      {threads.slice(0, 4).map((thread) => (
        <span key={thread.id}>
          {peerName(thread.peer) ?? thread.peer} · {thread.peer}
        </span>
      ))}
    </span>
  )
}

// Another terminal's messages, placed on this bar: what waits for its agent, and its
// threads in miniature.
const GuestMailCount = ({
  messages,
  from,
}: {
  messages: Messages
  from: CompanionKey
}): React.JSX.Element | null => {
  const { badge } = useMail(messages, from)
  return badge ? (
    <b className="plan-tb-count" data-mail={badge.kind} aria-hidden="true">
      {badge.count}
    </b>
  ) : null
}

const GuestMailThumb = ({
  messages,
  from,
  peerName,
}: {
  messages: Messages
  from: CompanionKey
  peerName: (handle: string) => string | undefined
}): React.JSX.Element => <MailThumb mail={useMail(messages, from)} peerName={peerName} />

// An artifact in miniature, once it loads; a held one is never loaded for a peek, which
// a passing pointer opens.
const ArtifactPreview = ({
  companion,
  artifact,
}: {
  companion: CompanionHandle
  artifact: Shown
}): React.JSX.Element | null =>
  artifact.held ? (
    <span className="peek-held">May hold secrets. Click to open.</span>
  ) : (
    <LoadedPreview companion={companion} artifact={artifact} />
  )

// A group's name, as its menu and its count say it.
const groupNames: Record<ArtifactKind, { readonly one: string; readonly many: string }> = {
  image: { one: "image", many: "Images" },
  file: { one: "file", many: "Files" },
  page: { one: "page", many: "Pages" },
}

// A taskbar slot: its icon, the peek above it, and its menu, which is also the
// keyboard's way to everything the peek offers.
const slot = (
  key: string,
  label: string,
  items: ContextMenuItem[],
  button: React.ReactElement,
  peek: React.ReactNode,
): React.JSX.Element => (
  <ContextMenu
    key={key}
    label={`${label} actions`}
    items={items}
    trigger={
      <span className="plan-tb-slot">
        <HoverCard trigger={button} className="plan-tb-peek">
          {peek}
        </HoverCard>
      </span>
    }
  />
)

// Dragging an icon reorders the taskbar: from 6px of movement with a mouse, a
// quarter second's press on touch, so a click still opens and a press still peeks. The
// keyboard's way is the slot's menu: Move left and Move right.
const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 6 })],
  }),
]
const accessibility = Accessibility.configure({
  screenReaderInstructions: {
    draggable: "Drag to reorder, or use Move left and Move right in its menu.",
  },
})
const feedback = Feedback.configure({
  dropAnimation: { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
})
const cursor = Cursor.configure({ cursor: "grabbing" })

// The messages' drag stays on their terminal's bar.
const onBar = [tether((operation) => operation.source?.element?.closest(".plan-taskbar") ?? null)]

// One slot as the taskbar's drag reorders it: its own box, a direct child of the bar,
// so the drag moves the whole slot. Its icon button is the handle, which carries what
// dnd-kit tells assistive technology, so no second button wraps the first.
const SortableSlot = ({
  id,
  index,
  tethered,
  children,
}: {
  id: string
  index: number
  // Held to its terminal's bar, as the messages are.
  tethered: boolean
  children: ReactNode
}): React.JSX.Element => {
  const [element, setElement] = useState<HTMLSpanElement | null>(null)
  const handle = element?.querySelector<HTMLElement>(".plan-tb-item") ?? undefined
  const { isDragSource } = useSortable({
    id,
    index,
    element: element ?? undefined,
    handle,
    transition: { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    modifiers: tethered ? onBar : [],
  })
  return (
    <span
      className="plan-tb-sortable"
      ref={setElement}
      data-slot={id}
      data-dragging={isDragSource || undefined}
    >
      {children}
    </span>
  )
}

// A plan as a stack's peek and menu name it: by its file.
const fileOf = (plan: PlanDoc): string => plan.path.split("/").at(-1)!

// A plan in a stack: the terminal's own, or one placed here from `guest`'s terminal.
type PlanMember = {
  readonly id: string
  readonly plan: PlanDoc
  readonly guest: Guest | undefined
}

type Grabbed = { readonly icon: LucideIcon; readonly from: DOMRect | undefined }

// A card pulled out of a peek, turned into an icon of its own.
const GrabbedIcon = ({ icon: Icon }: { icon: LucideIcon }): React.JSX.Element => (
  <span className="plan-tb-item" data-state="seen">
    <Icon size={20} strokeWidth={1.5} />
  </span>
)

// The pane's taskbar along the terminal's bottom: its plans, what the agent showed, an
// icon each with images and files grouped, and its messages, in the order they came or
// the person dragged them into. Hover peeks, click opens or hides, the menu opens or
// closes. Nothing opens on its own.
export const Taskbar = ({
  companion,
  mail,
  peerName,
  trigger,
  open,
  presence,
  openWindow,
  undockPlan,
  guests,
  messages,
  placeOn,
  dropTarget,
}: {
  companion: CompanionHandle
  mail: MailHandle
  peerName: (handle: string) => string | undefined
  // Undock something shown into a window of its own; absent where there's no such window.
  // `place`, where its window opens when it was dropped on the empty canvas.
  openWindow: ((artifact: Shown, place?: UndockPlace) => void) | undefined
  undockPlan: ((plan: PlanDoc, place?: UndockPlace) => void) | undefined
  trigger: React.RefObject<HTMLButtonElement | null>
  open: boolean
  // How the bar comes and goes with what the terminal has to show.
  presence: Presence
  // Other terminals' items placed on this bar, and the messages they read from.
  guests: readonly Guest[]
  messages: Messages | undefined
  // Shows an item, this bar's own or a guest, on another terminal's bar by its id.
  placeOn: (from: CompanionKey, item: string, terminalId: string) => void
  // An icon from another terminal's bar is over this one: a drop lands here.
  dropTarget: boolean
}): React.JSX.Element => {
  const { pane } = companion
  const current = shownTab(
    pane,
    mail.present,
    guests.map((guest) => guest.id),
  )
  const showing = (tab: string): boolean => open && current === tab
  const state = (tab: string, fresh: boolean): Indicator =>
    fresh ? "new" : showing(tab) ? "open" : "seen"
  // Clicking what the pane is showing hides it, as a taskbar minimizes the active window.
  const activate = (tab: string): void =>
    companion.update((next) => (showing(tab) ? closePane(next) : openTab(next, tab)))
  const opening = (tab: string, label = "Open"): ContextMenuItem => ({
    value: `open-${tab}`,
    label,
    onSelect: () => companion.update((next) => openTab(next, tab)),
  })
  const windowing = (artifact: Shown, label = "Undock to its own window"): ContextMenuItem[] =>
    openWindow
      ? [{ value: `window-${artifact.id}`, label, onSelect: () => openWindow(artifact) }]
      : []
  // Closed, it leaves the bar until the agent shows it again: a plan's next iteration, the
  // next message.
  const closing = (id: string, label = "Close"): ContextMenuItem => ({
    value: `close-${id}`,
    label,
    onSelect: () => companion.update((next) => close(next, id)),
  })
  const peekOf = (artifact: Shown): PeekEntry => {
    const Icon = iconOf(artifact)
    return {
      id: artifact.id,
      name: artifact.name,
      icon: <Icon size={13} strokeWidth={1.5} />,
      preview: <ArtifactPreview companion={companion} artifact={artifact} />,
      state: state(artifact.id, artifact.fresh),
      onOpen: () => companion.update((next) => openTab(next, artifact.id)),
      onClose: () => companion.update((next) => close(next, artifact.id)),
    }
  }
  // Another terminal's image or file in a stack here: it loads from that terminal, and
  // says whose it is.
  const guestPeekOf = (guest: Guest, artifact: Shown): PeekEntry => {
    const Icon = iconOf(artifact)
    return {
      id: guest.id,
      name: `${artifact.name} · from ${guest.origin.name}`,
      icon: <Icon size={13} strokeWidth={1.5} />,
      preview: <ArtifactPreview companion={guest.companion} artifact={artifact} />,
      state: state(guest.id, artifact.fresh),
      onOpen: () => companion.update((next) => openTab(next, guest.id)),
      onClose: () => closeGuest(guest),
    }
  }
  const agent = pane.plans[0]?.agent ?? "The agent"
  // Everything on the bar, in the order things came or the person dragged them into.
  // Images and files placed here from other terminals stack with this bar's own, by
  // their ids here, in the order they came; on their own, they're guests as any other.
  const guestOf = new Map(guests.map((guest) => [guest.id, guest]))
  const order = pane.order ?? []
  const rank = (id: string): number => {
    const place = order.indexOf(id)
    return place < 0 ? order.length : place
  }
  const stacking = [
    ...pane.artifacts,
    ...guests.flatMap((guest) =>
      guest.kind === "artifact" ? [{ ...guest.artifact, id: guest.id }] : [],
    ),
  ].toSorted((a, b) => rank(a.id) - rank(b.id))
  // Plans stack the same way: the terminal's own and those placed here, once there are
  // several.
  const planMembers = [
    ...pane.plans.map((plan) => planTab(plan.ref)),
    ...guests.flatMap((guest) => (guest.kind === "plan" ? [guest.id] : [])),
  ].toSorted((a, b) => rank(a) - rank(b))
  const bar = arrange(pane, [
    ...(planMembers.length > 1
      ? [{ kind: "plans", members: planMembers } as const]
      : planMembers.map((id): BarSlot => {
          const guest = guestOf.get(id)
          return guest ? { kind: "guest", guest } : { kind: "plan", tab: id }
        })),
    ...slotsOf(stacking).map((each): BarSlot => {
      const guest = each.kind === "one" ? guestOf.get(each.artifact.id) : undefined
      return guest ? { kind: "guest", guest } : each
    }),
    ...(mail.present ? [{ kind: "mail" } as const] : []),
    ...guests.flatMap((guest): BarSlot[] =>
      guest.kind === "mail" ? [{ kind: "guest", guest }] : [],
    ),
  ])
  // A guest is its terminal's to close: it goes home, closed there.
  const closeGuest = (guest: Guest): void => {
    placeOn(guest.from, guest.item, guest.from.terminalId)
    guest.companion.update((next) => close(next, guest.item))
  }
  const move = (from: number, to: number): void =>
    companion.update((next) => reorderBar(next, moveSlot(bar, from, to)))
  // Ends following the pointer once a drag ends.
  const stopFollowing = useRef<(() => void) | undefined>(undefined)
  // Where the dragged slot's window would open in the view's free space, if it's over it.
  const space = useRef<UndockPlace | null>(null)
  // A card pulled out of a group's peek, as the icon it turned into: what it is, and where
  // its group's icon is, which it goes back into if it lands nowhere. The icon follows the
  // pointer by its style, not by rendering.
  const [grabbedNow, setGrabbedNow] = useState<Grabbed | null>(null)
  const grabbed = useRef<Grabbed | null>(null)
  const setGrabbed = (next: Grabbed | null): void => {
    grabbed.current = next
    setGrabbedNow(next)
  }
  const grabbedIcon = useRef<HTMLDivElement | null>(null)
  const grabbedAt = useRef({ x: 0, y: 0 })
  // What a drop on the view's free space undocks: one plan, or one thing shown. A group
  // would be several windows; another terminal's item isn't this bar's to undock, and the
  // messages stay with their terminal.
  const undockable = (entry: BarSlot): boolean =>
    entry.kind === "plan" ? Boolean(undockPlan) : entry.kind === "one" && Boolean(openWindow)
  // What a slot's window would be called, for the ghost of where it would open.
  const slotName = (entry: BarSlot): string => {
    if (entry.kind === "one") return entry.artifact.name
    if (entry.kind === "plan") {
      const plan = pane.plans.find((each) => planTab(each.ref) === entry.tab)
      return plan ? titleOf(plan.path, plan.text) : "Plan"
    }
    return ""
  }
  const undockAt = (entry: BarSlot, place: UndockPlace): void => {
    if (entry.kind === "plan") {
      const plan = pane.plans.find((each) => planTab(each.ref) === entry.tab)
      if (plan) undockPlan?.(plan, place)
    } else if (entry.kind === "one") openWindow?.(entry.artifact, place)
  }
  // Dropped on another terminal's bar, a slot shows there: each of a group, one by one; a
  // guest dropped on its own terminal's bar goes home.
  const placeSlot = (entry: BarSlot, terminalId: string): void => {
    const own = pane.key
    if (entry.kind === "guest") placeOn(entry.guest.from, entry.guest.item, terminalId)
    else if (entry.kind === "plan") placeOn(own, entry.tab, terminalId)
    else if (entry.kind === "mail") return
    else if (entry.kind === "plans")
      for (const id of entry.members) {
        const guest = guestOf.get(id)
        if (guest) placeOn(guest.from, guest.item, terminalId)
        else placeOn(own, id, terminalId)
      }
    else if (entry.kind === "one") placeOn(own, entry.artifact.id, terminalId)
    else
      for (const shown of entry.artifacts) {
        const guest = guestOf.get(shown.id)
        if (guest) placeOn(guest.from, guest.item, terminalId)
        else placeOn(own, shown.id, terminalId)
      }
  }

  // This terminal's bar, which the messages stay on.
  const barOf = (): DOMRect | undefined =>
    document
      .querySelector(
        `section.terminal-window[data-terminal="${pane.key.terminalId}"] .plan-taskbar`,
      )
      ?.getBoundingClientRect()

  // Where the pointer is on screen while an icon is dragged: over which terminal, and on
  // its bar, or over the view's free space, where its window would open.
  const followPointer = (pointer: PointerEvent, dragged: BarSlot | undefined): void => {
    // The messages stay: nothing out there lights up for them, and off their bar the
    // pointer says so.
    if (dragged?.kind === "mail") {
      const own = barOf()
      refuseDrop(Boolean(own && beyond(pointer.clientX, pointer.clientY, own)))
      return
    }
    const target = dragTargetAt(pointer.clientX, pointer.clientY)
    dragOver.update(() => ({ source: pane.key.terminalId, ...target }))
    // Over a view's free space only: over a window, nothing makes room, so the window
    // stays put for a drop on its bar.
    const free =
      !target.terminal && dragged && undockable(dragged)
        ? dropSpaceAt(pointer.clientX, pointer.clientY)
        : null
    space.current = free?.place ?? null
    dropPreview.update(() =>
      free && dragged ? { ...free.outline, label: slotName(dragged) } : null,
    )
  }
  // The drag ended: `entry` lands where the pointer left it, or nothing does. Whether it
  // landed anywhere.
  const land = (entry: BarSlot | undefined): boolean => {
    refuseDrop(false)
    const over = dragOver.getSnapshot()
    dragOver.update(() => null)
    const place = space.current
    space.current = null
    dropPreview.update(() => null)
    if (entry && over?.onBar && over.terminal && over.terminal !== pane.key.terminalId) {
      placeSlot(entry, over.terminal)
      return true
    }
    // Dropped on the view's free space: it undocks, its window where it was dropped.
    if (entry && place && undockable(entry)) {
      // The canvas places a new window where it was asked to; the grid, as its layout says.
      if ("canvas" in place) requestDropPlace(place.canvas)
      undockAt(entry, place)
      return true
    }
    return false
  }
  // A card pulled out of a peek turns into an icon, `icon`, of its own, and goes where any
  // icon dragged off the bar would: `entry`, one of a group on its own. Back on its own
  // bar, it goes back into the icon it came from, the slot `slotId`.
  const grab = (
    start: React.PointerEvent<HTMLElement>,
    entry: BarSlot,
    icon: LucideIcon,
    slotId: string,
  ): void => {
    if (start.button !== 0 || start.ctrlKey) return
    const touch = start.pointerType === "touch"
    const from = { x: start.clientX, y: start.clientY }
    // Its icon on this terminal's bar; the peek it's pulled from is elsewhere.
    const home = document.querySelector(
      `section.terminal-window[data-terminal="${pane.key.terminalId}"] [data-slot="${slotId}"] .plan-tb-item`,
    )
    // As on the bar: from 6px of movement with a mouse, a quarter second's press on touch.
    let armed = !touch
    let dragging = false
    const press = touch ? setTimeout(() => (armed = true), 250) : undefined
    const moved = (pointer: PointerEvent): void => {
      if (pointer.pointerId !== start.pointerId) return
      const distance = Math.hypot(pointer.clientX - from.x, pointer.clientY - from.y)
      if (!dragging) {
        if (touch && !armed && distance > 5) return stop()
        if (!armed || (!touch && distance < 6)) return
        dragging = true
        grabbedAt.current = { x: pointer.clientX, y: pointer.clientY }
        setGrabbed({ icon, from: home?.getBoundingClientRect() })
      }
      pointer.preventDefault()
      grabbedAt.current = { x: pointer.clientX, y: pointer.clientY }
      const track = entry.kind === "mail" ? barOf() : undefined
      // The messages' icon stays on its bar, its middle where an icon's would be.
      const middle = track && (track.top + track.bottom) / 2
      const at =
        track && middle !== undefined
          ? tetherPoint(pointer.clientX, pointer.clientY, {
              left: track.left + 18,
              top: middle,
              right: track.right - 18,
              bottom: middle,
            })
          : { x: pointer.clientX, y: pointer.clientY }
      grabbedIcon.current?.style.setProperty("translate", `${at.x}px ${at.y}px`)
      followPointer(pointer, entry)
    }
    const released = (pointer: PointerEvent): void => {
      if (pointer.pointerId !== start.pointerId) return
      stop()
      if (dragging) settle(land(entry))
    }
    const cancelled = (key: KeyboardEvent): void => {
      if (key.key !== "Escape" || !dragging) return
      key.stopPropagation()
      stop()
      land(undefined)
      settle(false)
    }
    const stop = (): void => {
      clearTimeout(press)
      window.removeEventListener("pointermove", moved, { capture: true })
      window.removeEventListener("pointerup", released, { capture: true })
      window.removeEventListener("pointercancel", released, { capture: true })
      window.removeEventListener("keydown", cancelled, { capture: true })
    }
    window.addEventListener("pointermove", moved, { capture: true })
    window.addEventListener("pointerup", released, { capture: true })
    window.addEventListener("pointercancel", released, { capture: true })
    window.addEventListener("keydown", cancelled, { capture: true })
  }
  // The grabbed icon goes: at once where it landed, which shows it there; back into its
  // group's icon where it didn't.
  const settle = (landed: boolean): void => {
    const icon = grabbedIcon.current
    const to = grabbed.current?.from
    if (landed || !icon || !to || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return setGrabbed(null)
    icon.dataset.settling = ""
    icon.style.setProperty("translate", `${to.left + to.width / 2}px ${to.top + to.height / 2}px`)
    setTimeout(() => setGrabbed(null), 180)
  }

  // One slot's menu, icon and peek, where it stands on the bar.
  const render = (entry: BarSlot, index: number): React.JSX.Element => {
    // Focus comes back to the first icon when the pane hides.
    const buttonRef = index === 0 ? trigger : undefined
    const moving: ContextMenuItem[] = [
      ...(index > 0
        ? [{ value: "move-left", label: "Move left", onSelect: () => move(index, index - 1) }]
        : []),
      ...(index < bar.length - 1
        ? [{ value: "move-right", label: "Move right", onSelect: () => move(index, index + 1) }]
        : []),
    ]
    if (entry.kind === "guest") {
      const { guest } = entry
      const from = `from ${guest.origin.name}`
      const Icon =
        guest.kind === "plan"
          ? FileText
          : guest.kind === "mail"
            ? MessagesSquare
            : iconOf(guest.artifact)
      const name =
        guest.kind === "plan"
          ? guest.plan.path.split("/").at(-1)!
          : guest.kind === "mail"
            ? "Messages"
            : guest.artifact.name
      const label =
        guest.kind === "plan"
          ? `Plan: ${titleOf(guest.plan.path, guest.plan.text)}`
          : guest.kind === "mail"
            ? "Messages"
            : guest.artifact.name
      return slot(
        guest.id,
        `${name} ${from}`,
        [
          opening(guest.id),
          {
            value: `send-back-${guest.id}`,
            label: `Send back to ${guest.origin.name}`,
            onSelect: () => placeOn(guest.from, guest.item, guest.from.terminalId),
          },
          ...moving,
          { value: `close-${guest.id}`, label: "Close", onSelect: () => closeGuest(guest) },
        ],
        <button
          ref={buttonRef}
          className="plan-tb-item"
          data-state={state(guest.id, guest.kind === "artifact" && guest.artifact.fresh)}
          data-guest=""
          aria-label={`${label}, ${from}`}
          aria-pressed={showing(guest.id)}
          onClick={() => activate(guest.id)}
        >
          <Icon size={20} strokeWidth={1.5} />
          {guest.kind === "mail" && messages && (
            <GuestMailCount messages={messages} from={guest.from} />
          )}
        </button>,
        <Peek
          entries={[
            {
              id: guest.id,
              name: `${name} · ${from}`,
              icon: <Icon size={13} strokeWidth={1.5} />,
              preview:
                guest.kind === "plan" ? (
                  <PlanThumb plan={guest.plan} />
                ) : guest.kind === "mail" ? (
                  messages && (
                    <GuestMailThumb messages={messages} from={guest.from} peerName={peerName} />
                  )
                ) : (
                  <ArtifactPreview companion={guest.companion} artifact={guest.artifact} />
                ),
              state: state(guest.id, false),
              onOpen: () => companion.update((next) => openTab(next, guest.id)),
              onClose: () => closeGuest(guest),
              onGrab: (event) => grab(event, entry, Icon, guest.id),
            },
          ]}
        />,
      )
    }
    if (entry.kind === "plans") {
      // Each plan in the stack: the terminal's own, or one placed here, saying whose.
      const members = entry.members.flatMap((id): PlanMember[] => {
        const guest = guestOf.get(id)
        if (guest?.kind === "plan") return [{ id, plan: guest.plan, guest }]
        const plan = pane.plans.find((each) => planTab(each.ref) === id)
        return plan ? [{ id, plan, guest: undefined }] : []
      })
      const fresh = members.some((member) => unread(member.plan))
      const openOne = members.find((member) => showing(member.id))
      const pick = members.find((member) => unread(member.plan)) ?? openOne ?? members[0]
      return slot(
        "group-plans",
        "Plans",
        [
          ...members.flatMap(({ id, plan, guest }): ContextMenuItem[] => {
            const name = fileOf(plan)
            const from = guest ? ` from ${guest.origin.name}` : ""
            return [
              opening(id, `Open ${name}${from}`),
              ...(guest
                ? [
                    {
                      value: `send-back-${id}`,
                      label: `Send ${name} back to ${guest.origin.name}`,
                      onSelect: () => placeOn(guest.from, guest.item, guest.from.terminalId),
                    },
                  ]
                : undockPlan
                  ? [
                      {
                        value: `window-${id}`,
                        label: `Undock ${name} to its own window`,
                        onSelect: () => undockPlan(plan),
                      },
                    ]
                  : []),
              guest
                ? {
                    value: `close-${id}`,
                    label: `Close ${name}${from}`,
                    onSelect: () => closeGuest(guest),
                  }
                : closing(id, `Close ${name}`),
            ]
          }),
          ...moving,
        ],
        <button
          ref={buttonRef}
          className="plan-tb-item"
          data-state={fresh ? "new" : openOne ? "open" : "seen"}
          aria-label={`${members.length} plans${fresh ? ", new" : ""}`}
          aria-pressed={Boolean(openOne)}
          onClick={() => pick && activate(pick.id)}
        >
          <FileText size={20} strokeWidth={1.5} />
          <b className="plan-tb-count" aria-hidden="true">
            {members.length}
          </b>
        </button>,
        <Peek
          entries={members.map(({ id, plan, guest }): PeekEntry => {
            const Icon = plan.role === "root" ? FileText : FileStack
            return {
              id,
              name: guest ? `${fileOf(plan)} · from ${guest.origin.name}` : fileOf(plan),
              icon: <Icon size={13} strokeWidth={1.5} />,
              preview: <PlanThumb plan={plan} />,
              state: state(id, unread(plan)),
              onOpen: () => companion.update((next) => openTab(next, id)),
              onClose: () =>
                guest ? closeGuest(guest) : companion.update((next) => close(next, id)),
              onGrab: (event) =>
                grab(
                  event,
                  guest ? { kind: "guest", guest } : { kind: "plan", tab: id },
                  Icon,
                  "group-plans",
                ),
            }
          })}
        />,
      )
    }
    if (entry.kind === "plan") {
      const plan = pane.plans.find((each) => planTab(each.ref) === entry.tab)!
      const { tab } = entry
      const title = titleOf(plan.path, plan.text)
      const fresh = unread(plan)
      const Icon = plan.role === "root" ? FileText : FileStack
      const kind = plan.role === "root" ? "Plan" : "Subagent plan"
      return slot(
        tab,
        kind,
        [
          opening(tab),
          ...(undockPlan
            ? [
                {
                  value: `window-${tab}`,
                  label: "Undock to its own window",
                  onSelect: () => undockPlan(plan),
                },
              ]
            : []),
          ...moving,
          closing(tab),
        ],
        <button
          ref={buttonRef}
          className="plan-tb-item"
          data-state={state(tab, fresh)}
          aria-label={`${kind}: ${title}${fresh ? ", new" : ""}`}
          aria-pressed={showing(tab)}
          onClick={() => activate(tab)}
        >
          <Icon size={20} strokeWidth={1.5} />
        </button>,
        <Peek
          entries={[
            {
              id: tab,
              // Named by its file, like everything else; the preview carries the title.
              name: plan.path.split("/").at(-1)!,
              icon: <Icon size={13} strokeWidth={1.5} />,
              preview: <PlanThumb plan={plan} />,
              state: state(tab, fresh),
              onOpen: () => companion.update((next) => openTab(next, tab)),
              onClose: () => companion.update((next) => close(next, tab)),
              onGrab: (event) => grab(event, entry, Icon, tab),
            },
          ]}
        />,
      )
    }
    if (entry.kind === "mail")
      return slot(
        mailTab,
        "Messages",
        [opening(mailTab), ...moving, closing(mailTab)],
        <button
          ref={buttonRef}
          className="plan-tb-item"
          data-state={state(mailTab, false)}
          aria-label={`Messages${mail.badge ? `, ${mailBadgeLabel(mail.badge)}` : mail.paused ? ", messaging paused" : ""}`}
          aria-pressed={showing(mailTab)}
          onClick={() => activate(mailTab)}
        >
          <MessagesSquare size={20} strokeWidth={1.5} />
          {mail.badge ? (
            <b className="plan-tb-count" data-mail={mail.badge.kind} aria-hidden="true">
              {mail.badge.count}
            </b>
          ) : (
            mail.paused && (
              <b className="plan-tb-count" data-mail="paused" aria-hidden="true">
                <Pause size={8} strokeWidth={2.5} />
              </b>
            )
          )}
        </button>,
        <Peek
          entries={[
            {
              id: mailTab,
              name: "Messages",
              icon: <MessagesSquare size={13} strokeWidth={1.5} />,
              preview: <MailThumb mail={mail} peerName={peerName} />,
              state: state(mailTab, false),
              onOpen: () => companion.update((next) => openTab(next, mailTab)),
              onClose: () => companion.update((next) => close(next, mailTab)),
              onGrab: (event) => grab(event, entry, MessagesSquare, mailTab),
            },
          ]}
        />,
      )
    if (entry.kind === "one") {
      const { artifact } = entry
      const Icon = iconOf(artifact)
      return slot(
        artifact.id,
        artifact.name,
        [opening(artifact.id), ...windowing(artifact), ...moving, closing(artifact.id)],
        <button
          ref={buttonRef}
          className="plan-tb-item"
          data-state={state(artifact.id, artifact.fresh)}
          aria-label={`${artifact.name}${artifact.fresh ? ", new" : ""}`}
          aria-pressed={showing(artifact.id)}
          onClick={() => activate(artifact.id)}
        >
          <Icon size={20} strokeWidth={1.5} />
        </button>,
        <Peek
          entries={[
            { ...peekOf(artifact), onGrab: (event) => grab(event, entry, Icon, artifact.id) },
          ]}
        />,
      )
    }
    const group = entry.artifacts
    const names = groupNames[entry.of]
    const Icon = kindIcons[entry.of]
    const fresh = group.some((shown) => shown.fresh)
    const openOne = group.find((shown) => showing(shown.id))
    return slot(
      `group-${entry.of}`,
      names.many,
      [
        ...group.flatMap((shown) => {
          const guest = guestOf.get(shown.id)
          if (guest)
            return [
              opening(shown.id, `Open ${shown.name} from ${guest.origin.name}`),
              {
                value: `send-back-${guest.id}`,
                label: `Send ${shown.name} back to ${guest.origin.name}`,
                onSelect: () => placeOn(guest.from, guest.item, guest.from.terminalId),
              },
              {
                value: `close-${guest.id}`,
                label: `Close ${shown.name} from ${guest.origin.name}`,
                onSelect: () => closeGuest(guest),
              },
            ]
          return [
            opening(shown.id, `Open ${shown.name}`),
            ...windowing(shown, `Undock ${shown.name} to its own window`),
            closing(shown.id, `Close ${shown.name}`),
          ]
        }),
        ...moving,
      ],
      <button
        ref={buttonRef}
        className="plan-tb-item"
        data-state={fresh ? "new" : openOne ? "open" : "seen"}
        aria-label={`${group.length} ${names.one}s${fresh ? ", new" : ""}`}
        aria-pressed={Boolean(openOne)}
        onClick={() => activate(pickFromGroup(pane, group).id)}
      >
        <Icon size={20} strokeWidth={1.5} />
        <b className="plan-tb-count" aria-hidden="true">
          {group.length}
        </b>
      </button>,
      <Peek
        entries={group.map((shown) => {
          const guest = guestOf.get(shown.id)
          return {
            ...(guest?.kind === "artifact" ? guestPeekOf(guest, guest.artifact) : peekOf(shown)),
            onGrab: (event: React.PointerEvent<HTMLElement>) =>
              grab(
                event,
                guest ? { kind: "guest", guest } : { kind: "one", artifact: shown },
                Icon,
                `group-${entry.of}`,
              ),
          }
        })}
      />,
    )
  }

  return (
    <div
      {...presence.props}
      className="plan-taskbar nodrag nopan"
      data-drop-target={dropTarget || undefined}
      data-workspace-companion
      role="group"
      aria-label={`What ${agent} showed you`}
      // Opening leaves focus here, so Escape hides the pane from here too.
      onKeyDown={(event) => {
        // Keys from its menus and peeks bubble here through React's portals; theirs is
        // their own Escape.
        if (event.key !== "Escape" || !open) return
        if (!event.currentTarget.contains(event.target as Node)) return
        event.stopPropagation()
        companion.update(closePane)
      }}
    >
      <DragDropProvider
        sensors={sensors}
        // No scrolling the view under a dragged icon: where it would drop must stay where
        // its outline shows.
        plugins={(defaults) => [
          ...defaults.filter((plugin) => plugin !== AutoScroller),
          accessibility,
          feedback,
          cursor,
        ]}
        onDragStart={(event) => {
          // The drag's own position is the dragged slot's, and it keeps the pointer's moves
          // to itself, so this listens ahead of it.
          const dragged = bar.find((each) => slotKey(each) === String(event.operation.source?.id))
          const follow = (pointer: PointerEvent): void => followPointer(pointer, dragged)
          window.addEventListener("pointermove", follow, { capture: true })
          stopFollowing.current = () =>
            window.removeEventListener("pointermove", follow, { capture: true })
        }}
        onDragEnd={(event) => {
          stopFollowing.current?.()
          stopFollowing.current = undefined
          const { source } = event.operation
          const sortable = !event.canceled && isSortable(source)
          // Where the bar's own drag left it, so the bar stays as its DOM shows it.
          if (sortable && source.initialIndex !== source.index)
            move(source.initialIndex, source.index)
          land(sortable ? bar.find((each) => slotKey(each) === String(source.id)) : undefined)
        }}
      >
        <span className="plan-tb-slots">
          {bar.map((entry, index) => (
            <SortableSlot
              key={slotKey(entry)}
              id={slotKey(entry)}
              index={index}
              tethered={entry.kind === "mail"}
            >
              {render(entry, index)}
            </SortableSlot>
          ))}
        </span>
      </DragDropProvider>
      {grabbedNow && (
        <Portal>
          <div
            ref={(element) => {
              grabbedIcon.current = element
              // Placed once here; from then on it follows the pointer by its style.
              if (element && !element.style.translate)
                element.style.translate = `${grabbedAt.current.x}px ${grabbedAt.current.y}px`
            }}
            className="plan-tb-grabbed"
            aria-hidden="true"
          >
            <GrabbedIcon icon={grabbedNow.icon} />
          </div>
        </Portal>
      )}
    </div>
  )
}
