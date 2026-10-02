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
import { FileStack, FileText, MessagesSquare, Pause } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"

import type { ArtifactKind, CompanionKey, UndockPlace } from "../../model/companion"
import { mailBadgeLabel, type Messages } from "../../model/messages"
import { ContextMenu, type ContextMenuItem } from "../../ui-toolkit/ContextMenu"
import { HoverCard } from "../../ui-toolkit/HoverCard"
import type { Presence } from "../../ui-toolkit/presence"
import { dropPreview, dropSpaceAt, requestDropPlace } from "../drop-space"
import { ArtifactThumb, kindIcons } from "./ArtifactViewer"
import { dragOver, dragTargetAt } from "./drag-over"
import type { Guest } from "./guests"
import { useMail, type MailHandle } from "./mail"
import {
  arrange,
  dismiss,
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

// One slot as the taskbar's drag reorders it: its own box, a direct child of the bar,
// so the drag moves the whole slot. Its icon button is the handle, which carries what
// dnd-kit tells assistive technology, so no second button wraps the first.
const SortableSlot = ({
  id,
  index,
  children,
}: {
  id: string
  index: number
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
  })
  return (
    <span className="plan-tb-sortable" ref={setElement} data-dragging={isDragSource || undefined}>
      {children}
    </span>
  )
}

// The pane's taskbar along the terminal's bottom: its plans, what the agent showed, an
// icon each with images and files grouped, and its messages, in the order they came or
// the person dragged them into. Hover peeks, click opens or hides, the menu opens or
// dismisses. Nothing opens on its own.
export const Taskbar = ({
  companion,
  mail,
  peerName,
  trigger,
  open,
  presence,
  openWindow,
  undockMessages,
  undockPlan,
  guests,
  messages,
  placeOn,
  dropTarget,
}: {
  companion: CompanionHandle
  mail: MailHandle
  peerName: (handle: string) => string | undefined
  // Undock something shown, or the messages, into a window of its own; absent where
  // there's no such window.
  // `place`, where its window opens when it was dropped on the empty canvas.
  openWindow: ((artifact: Shown, place?: UndockPlace) => void) | undefined
  undockMessages: ((place?: UndockPlace) => void) | undefined
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
  const dismissing = (id: string, label = "Dismiss"): ContextMenuItem => ({
    value: `dismiss-${id}`,
    label,
    onSelect: () => companion.update((next) => dismiss(next, id)),
  })
  const peekOf = (artifact: Shown): PeekEntry => {
    const Icon = kindIcons[artifact.kind]
    return {
      id: artifact.id,
      name: artifact.name,
      icon: <Icon size={13} strokeWidth={1.5} />,
      preview: <ArtifactPreview companion={companion} artifact={artifact} />,
      state: state(artifact.id, artifact.fresh),
      onOpen: () => companion.update((next) => openTab(next, artifact.id)),
      onDismiss: () => companion.update((next) => dismiss(next, artifact.id)),
    }
  }
  const agent = pane.plans[0]?.agent ?? "The agent"
  // Everything on the bar, in the order things came or the person dragged them into.
  const bar = arrange(pane, [
    ...pane.plans.map((plan): BarSlot => ({ kind: "plan", tab: planTab(plan.ref) })),
    ...slotsOf(pane.artifacts),
    ...(mail.present ? [{ kind: "mail" } as const] : []),
    ...guests.map((guest): BarSlot => ({ kind: "guest", guest })),
  ])
  const move = (from: number, to: number): void =>
    companion.update((next) => reorderBar(next, moveSlot(bar, from, to)))
  // Ends following the pointer once a drag ends.
  const stopFollowing = useRef<(() => void) | undefined>(undefined)
  // Where the dragged slot's window would open in the view's free space, if it's over it.
  const space = useRef<UndockPlace | null>(null)
  // What a drop on the view's free space undocks: one plan, one thing shown, or the messages.
  // A group would be several windows; another terminal's item isn't this bar's to undock.
  const undockable = (entry: BarSlot): boolean =>
    entry.kind === "plan"
      ? Boolean(undockPlan)
      : entry.kind === "mail"
        ? Boolean(undockMessages)
        : entry.kind === "one" && Boolean(openWindow)
  // What a slot's window would be called, for the ghost of where it would open.
  const slotName = (entry: BarSlot): string => {
    if (entry.kind === "mail") return "Messages"
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
    } else if (entry.kind === "mail") undockMessages?.(place)
    else if (entry.kind === "one") openWindow?.(entry.artifact, place)
  }
  // Dropped on another terminal's bar, a slot shows there: each of a group, one by one; a
  // guest dropped on its own terminal's bar goes home.
  const placeSlot = (entry: BarSlot, terminalId: string): void => {
    const own = pane.key
    if (entry.kind === "guest") placeOn(entry.guest.from, entry.guest.item, terminalId)
    else if (entry.kind === "plan") placeOn(own, entry.tab, terminalId)
    else if (entry.kind === "mail") placeOn(own, mailTab, terminalId)
    else if (entry.kind === "one") placeOn(own, entry.artifact.id, terminalId)
    else for (const shown of entry.artifacts) placeOn(own, shown.id, terminalId)
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
            : kindIcons[guest.artifact.kind]
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
          <b className="plan-tb-origin" aria-hidden="true">
            {guest.origin.handle ?? guest.origin.name.slice(0, 2)}
          </b>
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
            },
          ]}
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
            },
          ]}
        />,
      )
    }
    if (entry.kind === "mail")
      return slot(
        mailTab,
        "Messages",
        [
          opening(mailTab),
          ...(undockMessages
            ? [
                {
                  value: "window-mail",
                  label: "Undock to its own window",
                  onSelect: () => undockMessages(),
                },
              ]
            : []),
          ...moving,
        ],
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
            },
          ]}
        />,
      )
    if (entry.kind === "one") {
      const { artifact } = entry
      const Icon = kindIcons[artifact.kind]
      return slot(
        artifact.id,
        artifact.name,
        [opening(artifact.id), ...windowing(artifact), ...moving, dismissing(artifact.id)],
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
        <Peek entries={[peekOf(artifact)]} />,
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
        ...group.flatMap((shown) => [
          opening(shown.id, `Open ${shown.name}`),
          ...windowing(shown, `Undock ${shown.name} to its own window`),
          dismissing(shown.id, `Dismiss ${shown.name}`),
        ]),
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
      <Peek entries={group.map(peekOf)} />,
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
          // Where the pointer is on screen: over which terminal, and on its bar, or over the
          // empty canvas. The drag's own position is the dragged slot's, and it keeps the
          // pointer's moves to itself, so this listens ahead of it.
          const source = pane.key.terminalId
          const dragged = bar.find((each) => slotKey(each) === String(event.operation.source?.id))
          const follow = (pointer: PointerEvent): void => {
            const target = dragTargetAt(pointer.clientX, pointer.clientY)
            dragOver.update(() => ({ source, ...target }))
            // Over a view's free space only: over a window, nothing makes room, so the
            // window stays put for a drop on its bar.
            const free =
              !target.terminal && dragged && undockable(dragged)
                ? dropSpaceAt(pointer.clientX, pointer.clientY)
                : null
            space.current = free?.place ?? null
            dropPreview.update(() =>
              free && dragged ? { ...free.outline, label: slotName(dragged) } : null,
            )
          }
          window.addEventListener("pointermove", follow, { capture: true })
          stopFollowing.current = () =>
            window.removeEventListener("pointermove", follow, { capture: true })
        }}
        onDragEnd={(event) => {
          stopFollowing.current?.()
          stopFollowing.current = undefined
          const over = dragOver.getSnapshot()
          dragOver.update(() => null)
          const place = space.current
          space.current = null
          dropPreview.update(() => null)
          if (event.canceled) return
          const { source } = event.operation
          if (!isSortable(source)) return
          // Where the bar's own drag left it, so the bar stays as its DOM shows it.
          if (source.initialIndex !== source.index) move(source.initialIndex, source.index)
          const entry = bar.find((each) => slotKey(each) === String(source.id))
          if (entry && over?.onBar && over.terminal && over.terminal !== pane.key.terminalId)
            placeSlot(entry, over.terminal)
          // Dropped on the view's free space: it undocks, its window where it was dropped.
          else if (entry && place && undockable(entry)) {
            // The canvas places a new window where it was asked to; the grid, as its
            // layout says.
            if ("canvas" in place) requestDropPlace(place.canvas)
            undockAt(entry, place)
          }
        }}
      >
        <span className="plan-tb-slots">
          {bar.map((entry, index) => (
            <SortableSlot key={slotKey(entry)} id={slotKey(entry)} index={index}>
              {render(entry, index)}
            </SortableSlot>
          ))}
        </span>
      </DragDropProvider>
    </div>
  )
}
