import { useSyncExternalStore } from "react"

import { companionKeyId, type CompanionKey, type Companions } from "../../model/companion"
import { createStore, type MutableStore } from "../../model/store"

// Where a terminal's taskbar item is shown when it isn't on its own terminal's bar: the
// person dragged it onto another terminal's. It stays its terminal's (a plan's edits save
// to that agent, the messages are that agent's), so it wears where it's from; only where
// it's shown moves. `item` is its id in its own terminal's pane: a plan's tab, an
// artifact's id, the messages' tab.
// TODO: connect to the backends, which neither keep nor restore placements yet.
export type Placement = {
  readonly from: CompanionKey
  readonly item: string
  readonly to: CompanionKey
}

const stores = new WeakMap<Companions, MutableStore<readonly Placement[]>>()

const storeOf = (companions: Companions): MutableStore<readonly Placement[]> => {
  const known = stores.get(companions)
  if (known) return known
  const store = createStore<readonly Placement[]>([])
  stores.set(companions, store)
  return store
}

const same = (a: CompanionKey, b: CompanionKey): boolean => companionKeyId(a) === companionKeyId(b)

export const placementsOf = (companions: Companions): readonly Placement[] =>
  storeOf(companions).getSnapshot()

export const usePlacements = (companions: Companions): readonly Placement[] => {
  const store = storeOf(companions)
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

// The item shows on `to`'s bar from now on; on its own terminal's, it goes home.
export const place = (
  companions: Companions,
  from: CompanionKey,
  item: string,
  to: CompanionKey,
): void => {
  storeOf(companions).update((placements) => {
    const rest = placements.filter((each) => !(same(each.from, from) && each.item === item))
    return same(from, to) ? rest : [...rest, { from, item, to }]
  })
}

// A terminal closed: what came from it is gone, and what was on its bar goes home.
export const forgetTerminal = (companions: Companions, key: CompanionKey): void => {
  storeOf(companions).update((placements) => {
    const rest = placements.filter((each) => !same(each.from, key) && !same(each.to, key))
    return rest.length === placements.length ? placements : rest
  })
}

// A placed item's id on the bar it's shown on, apart from that terminal's own items.
export const guestId = (from: CompanionKey, item: string): string =>
  `guest:${companionKeyId(from)}#${item}`

export const isGuest = (id: string): boolean => id.startsWith("guest:")
