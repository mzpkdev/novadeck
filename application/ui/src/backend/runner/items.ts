import type {
  CompanionItem as RunnerItem,
  CompanionWindow as RunnerWindow,
} from "@novadeck/protocol"
import type { CompanionWatchItem, Runner } from "@novadeck/protocol/client"

import type { ItemId } from "../../model/companion"
import { hasWindow } from "../../model/roster"
import type { WorkspaceAction } from "../../model/state"
import type { Workspace, WorkspaceTarget } from "../../model/types"
import type { BackendAction } from "../port"
import { itemOf, windowOf } from "./companions"
import type { RunnerListing } from "./seed"

// The runner's companion items and windows, kept in step with the workspace: what the
// runner reports reaches the store as `item/*` and `window/*` actions, and what the
// person does to them reaches the runner in the order they did it, each once the
// session exists there. A call the runner refuses puts back what it last confirmed.

export type ItemsApi = Pick<
  Runner["companions"],
  "watch" | "move" | "undock" | "close" | "renameWindow" | "resetWindowTitle"
>

export type RunnerItems = {
  // The person's changes to items and windows, as a commit carries them.
  readonly commit: (actions: readonly WorkspaceAction[]) => void
  // Follows the runner's items and windows; returns the stop.
  readonly watch: () => () => void
  // Gives a window its item's name again.
  readonly resetWindow: (target: WorkspaceTarget, windowId: string) => void
  // Whether the workspace holds a window by this id.
  readonly isWindow: (target: WorkspaceTarget, id: string) => boolean
}

// Whether two reports of an item or window say the same.
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export const createRunnerItems = ({
  runner,
  listing,
  latest,
  ready,
  call,
  dispatch,
  consume,
}: {
  readonly runner: ItemsApi
  readonly listing: RunnerListing
  readonly latest: () => Workspace | undefined
  // Resolves whether the session exists on the runner.
  readonly ready: (sessionId: string) => Promise<boolean>
  // Calls the runner until it answers; rejects with what it refused, or with something
  // `unwanted` recognizes once the work is no longer wanted.
  readonly call: <T>(
    operation: () => Promise<T>,
    done: readonly ("NOT_FOUND" | "CONFLICT")[],
  ) => Promise<T | undefined>
  readonly dispatch: (actions: readonly BackendAction[]) => void
  readonly consume: <T>(changes: AsyncIterable<T>, handle: (change: T) => void) => Promise<void>
}): RunnerItems => {
  // What the runner last confirmed of each item and window.
  const items = new Map<string, RunnerItem>(
    listing.flatMap(({ sessions }) =>
      sessions.flatMap(({ companions }) =>
        (companions?.items ?? []).map((item) => [item.id, item]),
      ),
    ),
  )
  const windows = new Map<string, RunnerWindow>(
    listing.flatMap(({ sessions }) =>
      sessions.flatMap(({ companions }) =>
        (companions?.windows ?? []).map((window) => [window.id, window]),
      ),
    ),
  )
  // The workspace's place for a runner session, while the workspace holds it.
  const targetOf = (sessionId: string): WorkspaceTarget | undefined => {
    const project = latest()?.projects.find((each) =>
      each.history.some((session) => session.id === sessionId),
    )
    return project && { projectId: project.id, workspaceSessionId: sessionId }
  }

  const itemUpsert = (item: RunnerItem): BackendAction[] => {
    const target = targetOf(item.sessionId)
    return target ? [{ type: "item/upsert", target, item: itemOf(item) }] : []
  }
  const windowUpsert = (window: RunnerWindow): BackendAction[] => {
    const target = targetOf(window.sessionId)
    return target ? [{ type: "window/upsert", target, window: windowOf(window) }] : []
  }

  // The latest of each item and window the runner reports, which reaches the store only
  // where it changed. A round that lists everything again is applied whole at `synced`.
  let round: { items: Map<string, RunnerItem>; windows: Map<string, RunnerWindow> } | undefined
  const onChange = (change: CompanionWatchItem): void => {
    if (change.type === "reset") {
      round = { items: new Map(), windows: new Map() }
      return
    }
    if (round && change.type === "item") return void round.items.set(change.item.id, change.item)
    if (round && change.type === "window")
      return void round.windows.set(change.window.id, change.window)
    if (round && change.type === "synced") {
      const listed = round
      round = undefined
      // What's gone goes first: an item's removal takes its window with it, which the
      // round may list again, holding another.
      const removed: BackendAction[] = [
        ...[...items.values()].flatMap((item): BackendAction[] => {
          const target = listed.items.has(item.id) ? undefined : targetOf(item.sessionId)
          return target ? [{ type: "item/remove", target, itemId: item.id as ItemId }] : []
        }),
        ...[...windows.values()].flatMap((window): BackendAction[] => {
          const target = listed.windows.has(window.id) ? undefined : targetOf(window.sessionId)
          return target ? [{ type: "window/remove", target, windowId: window.id }] : []
        }),
      ]
      const changed: BackendAction[] = [
        ...[...listed.windows.values()].flatMap((window) =>
          same(windows.get(window.id), window) ? [] : windowUpsert(window),
        ),
        ...[...listed.items.values()].flatMap((item) =>
          same(items.get(item.id), item) ? [] : itemUpsert(item),
        ),
      ]
      items.clear()
      windows.clear()
      for (const [id, item] of listed.items) items.set(id, item)
      for (const [id, window] of listed.windows) windows.set(id, window)
      dispatch([...removed, ...changed])
      return
    }
    if (change.type === "item") {
      if (same(items.get(change.item.id), change.item)) return
      items.set(change.item.id, change.item)
      return dispatch(itemUpsert(change.item))
    }
    if (change.type === "window") {
      if (same(windows.get(change.window.id), change.window)) return
      windows.set(change.window.id, change.window)
      return dispatch(windowUpsert(change.window))
    }
    if (change.type === "itemRemoved") {
      items.delete(change.itemId)
      const target = targetOf(change.sessionId)
      return dispatch(
        target ? [{ type: "item/remove", target, itemId: change.itemId as ItemId }] : [],
      )
    }
    if (change.type === "windowRemoved") {
      windows.delete(change.windowId)
      const target = targetOf(change.sessionId)
      return dispatch(target ? [{ type: "window/remove", target, windowId: change.windowId }] : [])
    }
  }

  // The item as the runner last confirmed it, and its window, or its removal when the
  // runner has it no longer.
  const confirmed = (target: WorkspaceTarget, itemId: string): BackendAction[] => {
    const item = items.get(itemId)
    if (!item) return [{ type: "item/remove", target, itemId: itemId as ItemId }]
    const window = "windowId" in item.holder ? windows.get(item.holder.windowId) : undefined
    return [
      ...(window ? [{ type: "window/upsert", target, window: windowOf(window) } as const] : []),
      // Put back, it doesn't open again on its own.
      { type: "item/upsert", target, item: { ...itemOf(item), asked: false } },
    ]
  }
  const confirmedWindow = (target: WorkspaceTarget, windowId: string): BackendAction[] => {
    const window = windows.get(windowId)
    return window ? [{ type: "window/upsert", target, window: windowOf(window) }] : []
  }

  // The person's changes reach the runner one at a time, in the order they made them.
  let queue: Promise<unknown> = Promise.resolve()
  const send = <T>(
    target: WorkspaceTarget,
    operation: () => Promise<T>,
    {
      done = [],
      answered = () => {},
      refused,
    }: {
      readonly done?: readonly ("NOT_FOUND" | "CONFLICT")[]
      readonly answered?: (result: T | undefined) => void
      readonly refused: () => BackendAction[]
    },
  ): void => {
    queue = queue
      .then(() => ready(target.workspaceSessionId))
      .then(async (ok) => {
        if (!ok) throw new Error("The runner could not create this session.")
        answered(await call(operation, done))
      })
      .catch(() => dispatch(refused()))
  }

  const commit = (actions: readonly WorkspaceAction[]): void => {
    for (const action of actions) {
      if (action.type === "item/move")
        for (const itemId of action.itemIds)
          send(action.target, () => runner.move(itemId, action.terminalId), {
            answered: (item) => item && items.set(item.id, item),
            refused: () => confirmed(action.target, itemId),
          })
      if (action.type === "item/undock") {
        const { itemId, window } = action
        send(action.target, () => runner.undock(itemId, window.id), {
          answered: (made) => made && windows.set(made.id, made),
          refused: () => [
            { type: "window/remove", target: action.target, windowId: window.id },
            ...confirmed(action.target, itemId),
          ],
        })
      }
      if (action.type === "item/close")
        send(action.target, () => runner.close(action.itemId), {
          done: ["NOT_FOUND"],
          answered: () => items.delete(action.itemId),
          refused: () => confirmed(action.target, action.itemId),
        })
      if (action.type === "terminal/rename" && isWindow(action.target, action.terminalId))
        send(action.target, () => runner.renameWindow(action.terminalId, action.name), {
          refused: () => confirmedWindow(action.target, action.terminalId),
        })
    }
  }

  const isWindow = (target: WorkspaceTarget, id: string): boolean => {
    const roster = latest()
      ?.projects.find((project) => project.id === target.projectId)
      ?.history.find((session) => session.id === target.workspaceSessionId)?.state.roster
    return roster !== undefined && hasWindow(roster, id)
  }

  return {
    commit,
    watch: () => {
      const changes = runner.watch()
      void consume(changes, onChange)
      return () => void changes.return?.()
    },
    resetWindow: (target, windowId) =>
      send(target, () => runner.resetWindowTitle(windowId), {
        done: ["NOT_FOUND"],
        refused: () => confirmedWindow(target, windowId),
      }),
    isWindow,
  }
}
