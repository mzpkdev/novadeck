import type { ArtifactKind, ArtifactRef } from "../../model/companion"
import type { Guest } from "./guests"

// What a terminal's companion pane holds besides its plans: what the agent showed, in
// the order it came, and which tab is open.

// An artifact as the pane holds it: new until the user looks at it.
export type Shown = ArtifactRef & { readonly fresh: boolean; readonly at: string }

// A plan's tab, by its ref, apart from the artifacts' tabs.
export const planTab = (ref: string): string => `plan:${ref}`

export const planRefOf = (tab: string): string | null =>
  tab.startsWith("plan:") ? tab.slice("plan:".length) : null

// The terminal's messages with other agents, a tab of their own.
export const mailTab = "mail:"

export type Companion = {
  readonly open: boolean
  readonly tab: string
  // Where the pane goes when what it showed goes: the terminal's main plan.
  readonly home: string
  readonly artifacts: readonly Shown[]
  // The taskbar's items, plan tabs, what was shown and the messages, by id, in the order
  // they first came or the person since dragged them into.
  readonly order?: readonly string[]
}

// Something came to the taskbar: it joins the end of its order, unless it has a place.
export const arrived = <C extends Companion>(companion: C, id: string): C =>
  companion.order?.includes(id)
    ? companion
    : { ...companion, order: [...(companion.order ?? []), id] }

// The agent put something in front of the user, or showed it again with new content.
// It waits in the taskbar unless the user asked for it, and then it opens. Something
// already `seen`, shown before this session, is listed and nothing more.
export const show = <C extends Companion>(
  companion: C,
  artifact: ArtifactRef,
  asked: boolean,
  seen = false,
): C => {
  const opens = asked && !seen
  const shown: Shown = { ...artifact, fresh: !asked && !seen, at: "just now" }
  const known = companion.artifacts.some((existing) => existing.id === artifact.id)
  return {
    ...arrived(companion, artifact.id),
    artifacts: known
      ? companion.artifacts.map((existing) => (existing.id === artifact.id ? shown : existing))
      : [...companion.artifacts, shown],
    ...(opens ? { tab: artifact.id, open: true } : {}),
  }
}

// Looking at an artifact makes it old news.
export const selectTab = <C extends Companion>(companion: C, tab: string): C => ({
  ...companion,
  tab,
  open: true,
  artifacts: companion.artifacts.map((shown) =>
    shown.id === tab && shown.fresh ? { ...shown, fresh: false } : shown,
  ),
})

// Opening the pane without choosing a tab goes to what's new, if anything is, but never
// to something held, which waits to be picked.
export const openCompanion = <C extends Companion>(companion: C): C => {
  const fresh = companion.artifacts.findLast((shown) => shown.fresh && !shown.held)
  return fresh ? selectTab(companion, fresh.id) : { ...companion, open: true }
}

// The user is done with it: it leaves the pane, and the pane falls back to the plan, or
// as `shownTab` does.
export const dismiss = <C extends Companion>(companion: C, id: string): C => ({
  ...companion,
  tab: companion.tab === id ? companion.home : companion.tab,
  artifacts: companion.artifacts.filter((shown) => shown.id !== id),
  // Shown again, it comes last, as anything new does.
  ...(companion.order ? { order: companion.order.filter((each) => each !== id) } : {}),
})

// The kinds the taskbar groups. Each page keeps its own slot, as a browser window would.
export const groupedKinds: ReadonlySet<ArtifactKind> = new Set(["image", "file"])

// A taskbar slot: one artifact, or every image or every file, grouped as a taskbar
// groups an app's windows once there are several. Slots keep the order things first
// arrived in, a group where its first one arrived.
export type Slot =
  | { readonly kind: "one"; readonly artifact: Shown }
  | { readonly kind: "group"; readonly of: ArtifactKind; readonly artifacts: readonly Shown[] }

export const slotsOf = (artifacts: readonly Shown[]): readonly Slot[] => {
  const ofKind = (kind: ArtifactKind): readonly Shown[] =>
    artifacts.filter((shown) => shown.kind === kind)
  return artifacts.flatMap((artifact): Slot[] => {
    const group = groupedKinds.has(artifact.kind) ? ofKind(artifact.kind) : []
    if (group.length < 2) return [{ kind: "one", artifact }]
    return artifact === group[0] ? [{ kind: "group", of: artifact.kind, artifacts: group }] : []
  })
}

// Everything on the taskbar: each plan, what was shown (one or a group), the messages.
export type BarSlot =
  | Slot
  | { readonly kind: "plan"; readonly tab: string }
  | { readonly kind: "mail" }
  | { readonly kind: "guest"; readonly guest: Guest }

// The items a slot stands for in the taskbar's order.
const itemsOf = (slot: BarSlot): readonly string[] =>
  slot.kind === "guest"
    ? [slot.guest.id]
    : slot.kind === "plan"
      ? [slot.tab]
      : slot.kind === "mail"
        ? [mailTab]
        : slot.kind === "one"
          ? [slot.artifact.id]
          : slot.artifacts.map((shown) => shown.id)

// A slot's identity on the taskbar, which stays the same as it moves.
export const slotKey = (slot: BarSlot): string =>
  slot.kind === "guest"
    ? slot.guest.id
    : slot.kind === "plan"
      ? slot.tab
      : slot.kind === "mail"
        ? mailTab
        : slot.kind === "one"
          ? slot.artifact.id
          : `group-${slot.of}`

// The slots in the taskbar's order: each where its earliest item is, a group where its
// first one came; anything the order doesn't know yet follows, as given.
export const arrange = (companion: Companion, slots: readonly BarSlot[]): readonly BarSlot[] => {
  const order = companion.order ?? []
  const rank = (slot: BarSlot, given: number): number => {
    const places = itemsOf(slot)
      .map((id) => order.indexOf(id))
      .filter((place) => place >= 0)
    return places.length ? Math.min(...places) : order.length + given
  }
  return slots
    .map((slot, given) => ({ slot, rank: rank(slot, given) }))
    .toSorted((a, b) => a.rank - b.rank)
    .map(({ slot }) => slot)
}

// The slot at `from` moved to `to`, the others keeping their order.
export const moveSlot = <T>(slots: readonly T[], from: number, to: number): readonly T[] => {
  const moved = [...slots]
  const [slot] = moved.splice(from, 1)
  if (slot !== undefined) moved.splice(to, 0, slot)
  return moved
}

// The taskbar's slots in a new order: their items move with them, a group's together
// and in its own order. Anything not on the taskbar, as what's undocked, keeps its place.
export const reorderBar = <C extends Companion>(companion: C, slots: readonly BarSlot[]): C => {
  const placed = slots.flatMap(itemsOf)
  const moving = new Set(placed)
  const known = companion.order ?? []
  const all = [...known, ...placed.filter((id) => !known.includes(id))]
  let next = 0
  return { ...companion, order: all.map((id) => (moving.has(id) ? placed[next++]! : id)) }
}

// Which of a group a click opens: what's new, else the one already open, else the latest;
// a held one only when the group holds nothing else, as the click then picks it.
export const pickFromGroup = (companion: Companion, group: readonly Shown[]): Shown =>
  group.findLast((shown) => shown.fresh && !shown.held) ??
  group.find((shown) => shown.id === companion.tab) ??
  group.findLast((shown) => !shown.held) ??
  group.at(-1)!

export const freshCount = (companion: Companion): number =>
  companion.artifacts.filter((shown) => shown.fresh).length
