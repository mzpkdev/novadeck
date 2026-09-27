import type { TerminalChange } from "@novadeck/protocol"
import {
  hasCode,
  type AttachedTerminal,
  type Runner,
  type RunnerStatus,
} from "@novadeck/protocol/client"

import { createStore } from "../../model/store"
import type {
  TerminalMetadata,
  TerminalStatus,
  Workspace,
  WorkspaceSession,
} from "../../model/types"
import type {
  Backend,
  BackendAction,
  BackendConnectionState,
  BackendSink,
  TerminalKey,
} from "../port"
import { createTerminalRegistry } from "../registry"
import { terminalActivity, type TerminalActivity } from "./activity"
import { createRunnerTerminal } from "./RunnerTerminal"
import { runnerSeed, startingTerminal, type RunnerListing } from "./seed"
import { encodeSession } from "./session-state"

// The part of the runner client the adapter uses.
export type RunnerApi = Pick<Runner, "watch" | "projects" | "sessions" | "terminals">

export type RunnerBackendOptions = {
  readonly newId?: () => string
  // How long saving waits for more changes, in milliseconds.
  readonly saveDelay?: number
  readonly pickDirectory?: () => Promise<string | null>
}

// One terminal the workspace holds, whichever view shows it.
export type RunnerEntry = {
  readonly key: TerminalKey
  // True once the runner has the terminal; false when it could not be created or the
  // runner lost it before the app started.
  ready: Promise<boolean>
  // The runner has reported or created it, so its absence from a listing means it ended.
  confirmed: boolean
  // The watch round in which it was confirmed; a round only speaks for terminals
  // confirmed before it began. Seeded terminals count from before the first.
  confirmedIn: number
  // Failed or ended here, which later activity reports must not undo.
  settled: boolean
  closed: boolean
  // The surface's attachment while one is mounted.
  attachment: AttachedTerminal | undefined
  // What the adapter last reported, so each change reaches the store once.
  status: string
  process: string
}

// What a mounted surface needs from the adapter.
export type SurfaceRuntime = {
  readonly entry: (key: TerminalKey) => RunnerEntry | undefined
  readonly attach: (terminalId: string) => Promise<AttachedTerminal>
  // Resolves once the runner is reachable again, or closed for good.
  readonly connected: () => Promise<void>
  // Reports why the surface could not follow its terminal.
  readonly lost: (key: TerminalKey, error: unknown) => void
  // Counts the promise as outstanding I/O until it settles.
  readonly track: <T>(work: Promise<T>) => Promise<T>
}

export type RunnerBackend = {
  readonly backend: Backend
  // For tests: whether the adapter holds the terminal, and a wait for its I/O to land
  // (pending saves are sent at once).
  readonly holds: (key: TerminalKey) => boolean
  readonly idle: () => Promise<void>
}

const statusKey = (status: TerminalStatus): string => {
  if (status.state === "exited") return `exited:${status.exitCode}`
  if (status.state === "failed") return `failed:${status.message}`
  return status.state
}
const processKey = ({ process, kind }: { process: string; kind: string }): string =>
  `${kind}:${process}`

const connectionState = (status: RunnerStatus): BackendConnectionState => {
  if (status.state === "connected") return "connected"
  return status.state === "reconnecting" ? "reconnecting" : "unavailable"
}

// Failures of the whole link, which the footer reports; they say nothing about a terminal.
const linkFailures = ["DISCONNECTED", "CLOSED", "UNAUTHORIZED", "INCOMPATIBLE_PROTOCOL"] as const

const lostStatus = (error: unknown): TerminalStatus | undefined => {
  if (hasCode(error, ...linkFailures)) return undefined
  if (hasCode(error, "TERMINAL_NOT_FOUND")) return { state: "ended" }
  if (hasCode(error, "CONTROL_IN_USE"))
    return { state: "failed", message: "Another window controls this terminal." }
  return { state: "failed", message: error instanceof Error ? error.message : String(error) }
}

// Where the session stands in the workspace, so a reload can tell apart sessions
// visited at the same moment: 2 for the open one, 1 for its project's last one.
const findSession = (
  workspace: Workspace | undefined,
  id: string,
): { readonly session: WorkspaceSession; readonly rank: number } | undefined => {
  for (const project of workspace?.projects ?? []) {
    const session = project.history.find((item) => item.id === id)
    if (!session) continue
    const current = project.activeSessionId === id
    return { session, rank: current ? (workspace!.activeProjectId === project.id ? 2 : 1) : 0 }
  }
  return undefined
}

// The runner accepts at most 196,608 characters of state, and a WebSocket message of
// 256 KiB carries it JSON-escaped inside the request; leave room for the envelope.
const maxStateLength = 196_608
const maxMessageBytes = 256 * 1024 - 8 * 1024
const fitsRunner = (state: string): boolean =>
  state.length <= maxStateLength &&
  new TextEncoder().encode(JSON.stringify(state)).length <= maxMessageBytes

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const consume = async <T>(
  changes: AsyncIterable<T>,
  handle: (change: T) => void,
): Promise<void> => {
  try {
    for await (const change of changes) handle(change)
  } catch {
    // The runner closed for good; the connection store already says so.
  }
}

const target = ({ projectId, workspaceSessionId }: TerminalKey) => ({
  projectId,
  workspaceSessionId,
})

const defaultSaveDelay = 800
const failedToCreate: TerminalStatus = { state: "failed", message: "Could not start the terminal." }

// A backend over a connected runner and what it listed at startup. Creating it starts
// nothing: I/O begins with the first commit that changes the workspace, or `start`.
export const runnerBackend = (
  runner: RunnerApi,
  listing: RunnerListing,
  options: RunnerBackendOptions = {},
): RunnerBackend => {
  const newId = options.newId ?? (() => crypto.randomUUID())
  const saveDelay = options.saveDelay ?? defaultSaveDelay
  const seed = runnerSeed(listing)
  const connection = createStore<BackendConnectionState>("connected")
  const pending = new Set<Promise<unknown>>()
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work)
    const settled = (): void => void pending.delete(work)
    work.then(settled, settled)
    return work
  }
  const created = Promise.resolve(true)
  // What the runner holds for each session, so an unchanged state is not sent again.
  const saved = new Map(
    listing.flatMap(({ sessions: listed }) =>
      listed.flatMap(({ session }) =>
        session.state === null ? [] : [[session.id, session.state]],
      ),
    ),
  )
  // Whether each project and session exists on the runner yet; seeded ones already do.
  const projects = new Map(seed.projects.map((project) => [project.id, created]))
  const sessions = new Map(
    seed.projects.flatMap((project) => project.sessions.map((session) => [session.id, created])),
  )
  const entries = new Map<string, RunnerEntry>()
  let sink: BackendSink | undefined
  // Counts watch rounds: each `synced`, and each disconnection, starts a new one.
  let round = 0
  let latest: Workspace | undefined

  const dispatch = (actions: readonly BackendAction[]): void => {
    if (actions.length) sink?.dispatch(actions)
  }
  const statusAction = (entry: RunnerEntry, status: TerminalStatus): BackendAction[] => {
    const next = statusKey(status)
    if (entry.status === next) return []
    entry.status = next
    const { terminalId } = entry.key
    return [{ type: "terminal/status", target: target(entry.key), terminalId, status }]
  }
  const settle = (entry: RunnerEntry, status: TerminalStatus): void => {
    if (entry.closed) return
    entry.settled = true
    dispatch(statusAction(entry, status))
  }
  const activityActions = (entry: RunnerEntry, activity: TerminalActivity): BackendAction[] => {
    if (entry.settled) return []
    const actions = statusAction(entry, activity.status)
    const { process } = activity
    if (!process || entry.process === processKey(process)) return actions
    entry.process = processKey(process)
    const { terminalId } = entry.key
    return [
      ...actions,
      { type: "terminal/process", target: target(entry.key), terminalId, process },
    ]
  }

  // Resolves once the runner is reachable again, or closed for good.
  const connected = async (): Promise<void> => {
    // The status can still say connected for a moment after the link dropped.
    await pause(250)
    for await (const status of runner.watch()) if (status.state !== "reconnecting") return
  }

  // Repeats `operation` after each reconnection until the runner answers. `done` names
  // the errors that mean it already happened, such as CONFLICT for a create whose
  // response was lost; any other error rejects.
  const persist = async (
    operation: () => Promise<unknown>,
    ...done: Parameters<typeof hasCode>[1][]
  ): Promise<void> => {
    for (;;) {
      try {
        // eslint-disable-next-line no-await-in-loop -- One attempt at a time.
        await operation()
        return
      } catch (error) {
        if (done.length && hasCode(error, ...done)) return
        if (!hasCode(error, "DISCONNECTED")) throw error
        // eslint-disable-next-line no-await-in-loop -- Wait for the runner to come back.
        await connected()
      }
    }
  }

  // Runs `operation` once `ready` settles well; resolves whether both succeeded.
  const after = (ready: Promise<boolean>, operation: () => Promise<unknown>): Promise<boolean> =>
    track(
      ready.then((ok) =>
        ok
          ? persist(operation, "CONFLICT").then(
              () => true,
              () => false,
            )
          : false,
      ),
    )

  // Ends the shell, retrying while the runner is unreachable. A terminal already gone,
  // or one another window controls, is left as it is.
  const endShell = async (entry: RunnerEntry): Promise<void> => {
    if (!(await entry.ready)) return
    await persist(
      () => runner.terminals.close(entry.key.terminalId),
      "TERMINAL_NOT_FOUND",
      "TERMINAL_EXITED",
      "NOT_FOUND",
    ).catch(() => {})
  }

  // Starts the shell once its session exists; a failure shows on the terminal's tab.
  const createTerminal = (entry: RunnerEntry): Promise<boolean> => {
    const { terminalId, workspaceSessionId } = entry.key
    const session = sessions.get(workspaceSessionId) ?? created
    return track(
      session.then(async (ok) => {
        if (!ok) throw new Error("The runner could not create this session.")
        await persist(
          () =>
            runner.terminals.create({
              id: terminalId,
              sessionId: workspaceSessionId,
              cols: 80,
              rows: 24,
            }),
          "CONFLICT",
        )
        entry.confirmed = true
        entry.confirmedIn = round
        return true
      }),
    ).catch((error: unknown) => {
      settle(entry, lostStatus(error) ?? failedToCreate)
      return false
    })
  }

  const registry = createTerminalRegistry<RunnerEntry>({
    open: (key, terminal: TerminalMetadata, isNew) => {
      const entry: RunnerEntry = {
        key,
        ready: Promise.resolve(terminal.state !== "ended"),
        confirmed: !isNew && terminal.state !== "ended",
        confirmedIn: -1,
        settled: terminal.state === "ended",
        closed: false,
        attachment: undefined,
        status: statusKey(terminal),
        process: processKey(terminal),
      }
      if (isNew) entry.ready = createTerminal(entry)
      entries.set(key.terminalId, entry)
      return entry
    },
    close: (entry, key) => {
      entry.closed = true
      entries.delete(key.terminalId)
      void track(endShell(entry))
    },
  })

  // Saving: every changed session is sent after a quiet spell, or at once on pagehide.
  const seen = new Map<string, WorkspaceSession>()
  const dirty = new Set<string>()
  let baseline = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = (): void => {
    clearTimeout(timer)
    timer = undefined
    for (const id of dirty) {
      dirty.delete(id)
      const found = findSession(latest, id)
      const ready = sessions.get(id)
      if (!found || !ready) continue
      const state = encodeSession(found.session, found.rank)
      // Unchanged, or more than the runner accepts: a state it would reject is dropped.
      if (saved.get(id) === state || !fitsRunner(state)) continue
      void track(
        ready.then(async (ok) => {
          if (!ok) return
          try {
            await runner.sessions.save({ sessionId: id, state })
            saved.set(id, state)
          } catch (error) {
            // Unreachable: try again after the next change or reconnection.
            if (hasCode(error, "DISCONNECTED")) dirty.add(id)
          }
        }),
      )
    }
  }
  const schedule = (): void => {
    if (dirty.size && !timer) timer = setTimeout(flush, saveDelay)
  }
  const noteChanges = (workspace: Workspace): void => {
    for (const session of workspace.projects.flatMap((project) => project.history)) {
      if (seen.get(session.id) === session) continue
      seen.set(session.id, session)
      if (baseline) dirty.add(session.id)
    }
    baseline = true
    schedule()
  }

  const commit: Backend["commit"] = (workspace, actions) => {
    latest = workspace
    for (const project of workspace.projects) {
      if (!projects.has(project.id))
        projects.set(
          project.id,
          after(created, () =>
            runner.projects.create({ id: project.id, name: project.name, cwd: project.directory }),
          ),
        )
      for (const session of project.history)
        if (!sessions.has(session.id))
          sessions.set(
            session.id,
            after(projects.get(project.id)!, () =>
              runner.sessions.create({ id: session.id, projectId: project.id, name: session.name }),
            ),
          )
    }
    registry.reconcile(workspace, actions)
    noteChanges(workspace)
  }

  const runtime: SurfaceRuntime = {
    entry: (key) => registry.get(key)?.entry,
    attach: (terminalId) => runner.terminals.attach(terminalId),
    connected,
    lost: (key, error) => {
      const entry = registry.get(key)?.entry
      const status = lostStatus(error)
      if (entry && status) settle(entry, status)
    },
    track,
  }

  const start: NonNullable<Backend["start"]> = (next) => {
    sink = next
    let live = true
    // Terminals the runner reported since its last `synced`, which lists them all.
    const reported = new Set<string>()
    const onChange = (change: TerminalChange): void => {
      if (!live) return
      if (change.type === "removed") {
        // Another client closed it; a lagging watch may skip straight past its exit.
        const entry = entries.get(change.terminalId)
        if (entry?.confirmed && !entry.closed) settle(entry, { state: "ended" })
        return
      }
      if (change.type === "changed") {
        const entry = entries.get(change.terminal.id)
        reported.add(change.terminal.id)
        if (!entry || entry.closed) return
        if (!entry.confirmed) entry.confirmedIn = round
        entry.confirmed = true
        dispatch(activityActions(entry, terminalActivity(change.terminal)))
        return
      }
      // Terminals confirmed during this round may have been created after the runner
      // listed its terminals for it, so only earlier ones can be missing.
      const ended = [...entries.values()].filter(
        (entry) =>
          entry.confirmed && entry.confirmedIn < round && !reported.has(entry.key.terminalId),
      )
      reported.clear()
      round += 1
      for (const entry of ended) {
        entry.confirmed = false
        settle(entry, { state: "ended" })
      }
    }
    const onStatus = (status: RunnerStatus): void => {
      if (!live) return
      connection.update(() => connectionState(status))
      // A new connection lists every terminal again before its `synced`.
      if (status.state === "reconnecting") {
        reported.clear()
        round += 1
      }
      if (status.state === "connected") schedule()
    }
    const changes = runner.terminals.watch()
    const statuses = runner.watch()
    void consume(changes, onChange)
    void consume(statuses, onStatus)
    window.addEventListener("pagehide", flush)
    return () => {
      live = false
      if (sink === next) sink = undefined
      void changes.return?.()
      void statuses.return?.()
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }

  const backend: Backend = {
    seed,
    newTerminal: ({ number, directory }) => startingTerminal(newId(), number, directory),
    commit,
    TerminalSurface: createRunnerTerminal(runtime),
    start,
    connection,
    ...(options.pickDirectory ? { pickDirectory: options.pickDirectory } : {}),
  }
  return {
    backend,
    holds: (key) => registry.get(key) !== undefined,
    idle: async () => {
      const busy = (): boolean => timer !== undefined || pending.size > 0
      while (busy()) {
        flush()
        // eslint-disable-next-line no-await-in-loop -- Settled work may start more.
        await Promise.allSettled(pending)
      }
    },
  }
}
