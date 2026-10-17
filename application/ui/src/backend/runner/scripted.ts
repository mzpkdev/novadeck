import {
  contract,
  protocolVersion,
  type TerminalChange,
  type TerminalEvent,
  type TerminalSummary,
} from "@novadeck/protocol"
import {
  messagePort,
  type CompanionWatchItem,
  type MessagePortLike,
  type Runner,
  type RunnerStatus,
  type TerminalWatchItem,
} from "@novadeck/protocol/client"
import { implement, ORPCError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/message-port"

import { workspaceFromSeed } from "../../model/seed"
import { createTerminalState, workspaceReducer, type WorkspaceAction } from "../../model/state"
import type { Workspace } from "../../model/types"
import type { BackendAction } from "../port"
import { runnerBackend, type RunnerApi } from "./backend"
import { connectRunnerBackend } from "./index"
import { startingTerminal, type ListedCompanions, type RunnerListing } from "./seed"
import { encodeSession } from "./session-state"

// Test support: a runner adapter over a runner the test scripts step by step.

// Values pushed by the test, read by the adapter as a stream, until it ends.
export const channel = <T>() => {
  const queued: T[] = []
  let ended = false
  let wake: (() => void) | undefined
  const waiting = (): boolean => !queued.length && !ended
  const iterator: AsyncIterableIterator<T, undefined> = {
    [Symbol.asyncIterator]: () => iterator,
    next: async () => {
      // eslint-disable-next-line no-await-in-loop -- Waits for the next pushed value.
      while (waiting()) await new Promise<void>((resolve) => (wake = resolve))
      if (!queued.length) return { value: undefined, done: true }
      return { value: queued.shift()!, done: false }
    },
    return: async () => ({ value: undefined, done: true }),
  }
  return {
    iterator,
    push: (value: T) => {
      queued.push(value)
      wake?.()
    },
    end: () => {
      ended = true
      wake?.()
    },
  }
}

// A runner whose terminals' companions hold nothing and never change.
export const noCompanions = { watch: () => channel<never>().iterator }

const unused = (): never => {
  throw new Error("not used here")
}

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

type Saved = { readonly id: string; readonly lastProcess: string }
type Call = { readonly call: string; readonly input: unknown }

// A saved session laying out the terminals.
const state = (saved: readonly Saved[], visitedAt: number, name: string) => ({
  id: name,
  name,
  visitedAt,
  state: createTerminalState(
    saved.map((terminal) => startingTerminal(terminal.id, "/tmp")),
    "grid",
    "grid",
  ),
})

// A terminal the runner keeps without a shell, as after it restarted.
export const keptSummary = (
  terminalId: string,
  sessionId: string,
  change: Partial<TerminalSummary> = {},
): TerminalSummary => ({
  id: terminalId,
  sessionId,
  title: "Terminal",
  titleSource: { kind: "default" },
  handle: "moth",
  ledBy: null,
  openedBy: null,
  agentRan: false,
  started: false,
  command: null,
  lastProgram: null,
  cwd: "/tmp",
  cols: 80,
  rows: 24,
  run: 0,
  exit: null,
  process: null,
  agent: null,
  ready: null,
  activity: null,
  telemetry: null,
  ...change,
})

// The runner's terminals of a session: those it lists live, and the rest kept.
const terminalsOf = (
  saved: readonly Saved[],
  listed: readonly TerminalSummary[],
  sessionId: string,
): TerminalSummary[] =>
  saved.map(
    (terminal, index) =>
      listed.find((summary) => summary.id === terminal.id) ??
      keptSummary(terminal.id, sessionId, {
        title: "Terminal",
        handle: ["moth", "fox", "owl", "crow", "kite", "raven"][index] ?? `moth${index + 1}`,
        lastProgram: terminal.lastProcess || null,
      }),
  )

// A runner the test scripts: each session's saved terminals, what the runner still
// lists. Every call that could start a shell is noted.
export const scripted = ({
  shown,
  background = [],
  listed = [],
  restart = () => new Promise<TerminalSummary>(() => {}),
  saveSettings = async () => {},
  connect = async (agent: string, connected: boolean) => ({ agent, available: true, connected }),
  companions = { items: [], windows: [] },
  respond = async () => undefined,
  content = () => channel<never>().iterator,
  createSession = unused,
  apply = false,
}: {
  shown: readonly Saved[]
  background?: readonly Saved[]
  listed?: readonly TerminalSummary[]
  restart?: () => Promise<TerminalSummary>
  saveSettings?: () => Promise<void>
  connect?: (agent: string, connected: boolean) => Promise<unknown>
  // What the shown session's terminals hold as the runner lists it.
  companions?: ListedCompanions
  // How the runner answers each change to an item or window, by the call's name.
  respond?: (call: string, input: unknown) => Promise<unknown>
  content?: Runner["companions"]["content"]
  // How the runner answers creating a session this window adds.
  createSession?: () => Promise<unknown>
  // Whether what the backend reports reaches the workspace it sees, as in the app.
  apply?: boolean
}) => {
  const changes = channel<TerminalWatchItem>()
  const items = channel<CompanionWatchItem>()
  const received: BackendAction[] = []
  const statuses = channel<RunnerStatus>()
  const calls: Call[] = []
  const note =
    <T>(call: string, answer: (input: unknown) => Promise<T>) =>
    (...input: unknown[]) => {
      calls.push({ call, input: input.length === 1 ? input[0] : input })
      return answer(input)
    }
  const api = {
    watch: () => statuses.iterator,
    projects: { list: unused, create: unused, rename: unused, remove: unused },
    sessions: {
      list: unused,
      create: note("create session", createSession),
      rename: unused,
      save: async () => {},
    },
    settings: { get: unused, set: note("settings", saveSettings) },
    agents: {
      list: async () => [],
      // No agent is followed here; `prompt`, `interrupt` and `answer` are noted and take.
      detail: () => channel<never>().iterator,
      transcript: () => channel<never>().iterator,
      prompt: note("prompt", async () => {}),
      interrupt: note("interrupt", async () => {}),
      answer: note("answer", async () => {}),
      set: note("agents", (input) => {
        const [agent, connected] = input as [string, boolean]
        return connect(agent, connected)
      }),
    },
    terminals: {
      list: unused,
      watch: () => changes.iterator,
      // No agent asks for a terminal here.
      requests: () => channel<never>().iterator,
      // Never answers: a fresh shell stays starting.
      create: note("create", () => new Promise(() => {})),
      close: async () => {},
      rename: note("rename", async () => {}),
      restart: note("restart", restart),
      attach: () => new Promise(() => {}),
    },
    companions: {
      list: unused,
      watch: () => items.iterator,
      content: (...input: Parameters<typeof content>) => {
        calls.push({ call: "content", input })
        return content(...input)
      },
      attach: note("attach", (input) => respond("attach", input)),
      move: note("move", (input) => respond("move", input)),
      undock: note("undock", (input) => respond("undock", input)),
      close: note("close item", (input) => respond("close item", input)),
      renameWindow: note("rename window", (input) => respond("rename window", input)),
      resetWindowTitle: note("reset window", (input) => respond("reset window", input)),
    },
  } as unknown as RunnerApi
  const listing: RunnerListing = [
    {
      project: { id: "p", name: "P", cwd: "/tmp" },
      sessions: [
        {
          session: {
            id: id(8),
            projectId: "p",
            name: "Shown",
            state: encodeSession(state(shown, 5, id(8)), 2),
          },
          terminals: terminalsOf(shown, listed, id(8)),
          companions,
        },
        {
          session: {
            id: id(9),
            projectId: "p",
            name: "Background",
            state: encodeSession(state(background, 1, id(9)), 0),
          },
          terminals: terminalsOf(background, [], id(9)),
        },
      ],
    },
  ]
  const created = runnerBackend(api, listing, {
    saveDelay: 10,
    transcripts: true,
    agents: [
      { agent: "claude", available: true, connected: false },
      { agent: "agy", available: false, connected: false },
    ],
    welcomed: false,
  })
  let workspace = workspaceFromSeed(created.backend.seed, {
    view: "grid",
    windowedView: "grid",
    now: 1,
  })
  created.backend.commit(workspace, [])
  // Commits as the store would, with the backend seeing each commit.
  const commit = (...actions: WorkspaceAction[]): Workspace => {
    workspace = actions.reduce(workspaceReducer, workspace)
    created.backend.commit(workspace, actions)
    return workspace
  }
  const stop = created.backend.start!({
    dispatch: (actions) => {
      received.push(...actions)
      if (apply) commit(...actions)
    },
    open: () => {},
  })
  statuses.push({ state: "connected", runnerId: "runner-1" })
  const of = (call: string) => calls.filter((item) => item.call === call).map((item) => item.input)
  const key = (terminalId: string) => ({ projectId: "p", workspaceSessionId: id(8), terminalId })
  return {
    ...created,
    changes,
    items,
    received,
    calls,
    of,
    stop,
    key,
    listing,
    commit,
    workspace: () => workspace,
  }
}

// One end of a message channel held in memory: what one end posts, the other receives on
// a microtask, cloned as a real port would. Nothing waits on the browser's task queue, so
// the client and the server it carries trade messages in the same order every run.
const memoryChannel = (): readonly [MessagePortLike, MessagePortLike] => {
  const ends = [0, 1].map(() => ({
    message: new Set<(event: { data: unknown }) => void>(),
    close: new Set<() => void>(),
    open: true,
  }))
  const port = (own: (typeof ends)[number], peer: (typeof ends)[number]): MessagePortLike => ({
    postMessage: (message) => {
      if (!own.open || !peer.open) return
      const data = structuredClone(message)
      queueMicrotask(() => {
        if (peer.open) for (const listener of peer.message) listener({ data })
      })
    },
    start: () => {},
    close: () => {
      if (!own.open) return
      own.open = false
      peer.open = false
      for (const listener of [...own.close, ...peer.close]) listener()
    },
    addEventListener: (type: "message" | "close", listener: never) => {
      own[type].add(listener)
    },
  })
  return [port(ends[0]!, ends[1]!), port(ends[1]!, ends[0]!)]
}

// Waits for the next value of a channel, or undefined once the call is cancelled.
const nextOrAbort = async <T>(
  next: Promise<IteratorResult<T, undefined>>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<T, undefined> | undefined> => {
  if (signal?.aborted) return undefined
  let stop: (() => void) | undefined
  const aborted = new Promise<undefined>((resolve) => {
    stop = () => resolve(undefined)
    signal?.addEventListener("abort", stop, { once: true })
  })
  try {
    return await Promise.race([next, aborted])
  } finally {
    if (stop) signal?.removeEventListener("abort", stop)
  }
}

// A stream that yields nothing until the client lets go of it.
// eslint-disable-next-line require-yield -- It never has anything to yield.
const idle = async function* ({ signal }: { signal?: AbortSignal }) {
  await nextOrAbort(new Promise<never>(() => {}), signal)
}

// How many rows of each terminal's output its runner screen keeps for a snapshot.
const screenRows = 24
const handles = "moth fox owl crow kite raven wren lark finch heron swift robin hawk".split(" ")
const encoder = new TextEncoder()

// A runner the whole app boots over, at the wire: the whole contract served over an
// in-memory port, under the real client and the real adapter, so a procedure the contract
// adds or changes fails to compile here. It holds one project whose shown session holds
// `terminals` Claude Code agents, every one running, laid out in Grid. The test reports
// changes to a terminal through the runner's watch and writes output into its attached
// streams; the runner counts the bytes those streams send the UI and the streams open at
// once. A procedure the script doesn't play fails, and is noted in `unscripted`.
export const scriptedRunner = ({ terminals: count }: { readonly terminals: number }) => {
  const projectId = id(98)
  const sessionId = id(100)
  const terminalIds = Array.from({ length: count }, (_, index) => id(index + 1))
  const summaries = new Map(
    terminalIds.map((terminalId, index) => [
      terminalId,
      keptSummary(terminalId, sessionId, {
        title: `Agent ${index + 1}`,
        handle: handles[index] ?? `moth${index + 1}`,
        started: true,
        run: 1,
        agentRan: true,
        process: { name: "claude", argv: null },
        agent: "claude",
        activity: {
          state: "working",
          background: null,
          attention: { pending: 0, kind: null, headline: null },
          planning: false,
          subagents: [],
          lastTurn: null,
        },
        telemetry: {
          context: { occupied: 0, capacity: 200_000 },
          limits: [],
          model: "Opus",
          effort: null,
        },
      }),
    ]),
  )
  // Each terminal's screen: the rows of output it keeps for a snapshot.
  const screens = new Map(terminalIds.map((terminalId) => [terminalId, [] as string[]]))
  // Each attached stream's queue, by terminal.
  const streams = new Map<string, Set<ReturnType<typeof channel<TerminalEvent>>>>()
  const watchers = new Set<ReturnType<typeof channel<TerminalChange>>>()
  const unscripted: string[] = []
  let bytes = 0
  let written = 0
  let streaming = 0
  let sequence = 0
  const session = {
    id: sessionId,
    projectId,
    name: "Agents",
    state: encodeSession(
      state(
        terminalIds.map((terminalId) => ({ id: terminalId, lastProcess: "claude" })),
        5,
        sessionId,
      ),
      0,
    ),
  }
  // Tells every watcher of a change, as the runner announces one.
  const announce = (change: TerminalChange): void => {
    for (const watcher of watchers) watcher.push(change)
  }
  const toStreams = (terminalId: string, event: TerminalEvent): void => {
    for (const events of streams.get(terminalId) ?? []) events.push(event)
  }
  // The terminal goes: its streams end, and watchers hear of it.
  const remove = (terminalId: string): void => {
    summaries.delete(terminalId)
    for (const events of streams.get(terminalId) ?? []) events.end()
    announce({ type: "removed", terminalId, sessionId })
  }
  // Counts what a stream sends the UI.
  const sent = (event: TerminalEvent): TerminalEvent => {
    if (event.type === "snapshot" || event.type === "output")
      bytes += encoder.encode(event.data).length
    return event
  }
  const api = implement(contract)
  // A procedure the script doesn't play: noted, and failed.
  const unplayed = (name: string) => (): never => {
    unscripted.push(name)
    throw new Error(`The counter run doesn't script ${name}`)
  }
  const router = api.router({
    runner: {
      handshake: api.runner.handshake.handler(() => ({ runnerId: id(99), protocolVersion })),
    },
    projects: {
      list: api.projects.list.handler(() => [{ id: projectId, name: "Agents", cwd: "/tmp" }]),
      create: api.projects.create.handler(unplayed("projects.create")),
      rename: api.projects.rename.handler(unplayed("projects.rename")),
      remove: api.projects.remove.handler(unplayed("projects.remove")),
    },
    sessions: {
      list: api.sessions.list.handler(() => [session]),
      create: api.sessions.create.handler(unplayed("sessions.create")),
      rename: api.sessions.rename.handler(unplayed("sessions.rename")),
      save: api.sessions.save.handler(() => {}),
    },
    terminals: {
      list: api.terminals.list.handler(() => [...summaries.values()]),
      create: api.terminals.create.handler(unplayed("terminals.create")),
      requests: api.terminals.requests.handler(idle),
      answerRequest: api.terminals.answerRequest.handler(unplayed("terminals.answerRequest")),
      watch: api.terminals.watch.handler(async function* ({ signal }) {
        const changes = channel<TerminalChange>()
        watchers.add(changes)
        try {
          for (const terminal of summaries.values()) yield { type: "changed" as const, terminal }
          yield { type: "synced" as const }
          for (;;) {
            // eslint-disable-next-line no-await-in-loop -- Changes go out in order.
            const result = await nextOrAbort(changes.iterator.next(), signal)
            if (!result || result.done) return
            yield result.value
          }
        } finally {
          watchers.delete(changes)
        }
      }),
      attach: api.terminals.attach.handler(async function* ({ input, signal }) {
        const { terminalId } = input
        const summary = summaries.get(terminalId)
        if (!summary) throw new Error(`No terminal ${terminalId}`)
        const events = channel<TerminalEvent>()
        const held = streams.get(terminalId) ?? new Set()
        streams.set(terminalId, held.add(events))
        streaming += 1
        try {
          yield { terminalId, type: "attached" as const, mode: input.mode ?? "control" }
          // The screen as it is, at the size it is.
          yield sent({
            terminalId,
            sequence: (sequence += 1),
            type: "snapshot",
            data: (screens.get(terminalId) ?? []).join(""),
            cols: summary.cols,
            rows: summary.rows,
            exit: null,
          })
          for (;;) {
            // eslint-disable-next-line no-await-in-loop -- Output goes out in order.
            const result = await nextOrAbort(events.iterator.next(), signal)
            if (!result || result.done) return
            yield sent(result.value)
          }
        } finally {
          held.delete(events)
          streaming -= 1
        }
      }),
      write: api.terminals.write.handler(() => {}),
      // As the runner does: the terminal takes the size, the watch announces it, then its
      // streams hear of it, the same size included.
      resize: api.terminals.resize.handler(({ input: { terminalId, cols, rows } }) => {
        const current = summaries.get(terminalId)
        if (!current) throw new ORPCError("TERMINAL_NOT_FOUND", { status: 404 })
        const terminal = { ...current, cols, rows }
        summaries.set(terminalId, terminal)
        announce({ type: "changed", terminal })
        toStreams(terminalId, {
          terminalId,
          sequence: (sequence += 1),
          type: "resized",
          cols,
          rows,
        })
      }),
      ack: api.terminals.ack.handler(() => {}),
      // As the runner does: a terminal it has goes, and watchers hear of it; one it doesn't
      // is not found.
      close: api.terminals.close.handler(({ input: { terminalId } }) => {
        if (!summaries.has(terminalId)) throw new ORPCError("TERMINAL_NOT_FOUND", { status: 404 })
        remove(terminalId)
      }),
      rename: api.terminals.rename.handler(unplayed("terminals.rename")),
      resetTitle: api.terminals.resetTitle.handler(unplayed("terminals.resetTitle")),
      upload: api.terminals.upload.handler(unplayed("terminals.upload")),
      restart: api.terminals.restart.handler(unplayed("terminals.restart")),
    },
    agents: {
      list: api.agents.list.handler(() => [
        { agent: "claude" as const, available: true, connected: true },
      ]),
      detail: api.agents.detail.handler(idle),
      transcript: api.agents.transcript.handler(idle),
      prompt: api.agents.prompt.handler(unplayed("agents.prompt")),
      answer: api.agents.answer.handler(unplayed("agents.answer")),
      interrupt: api.agents.interrupt.handler(unplayed("agents.interrupt")),
      set: api.agents.set.handler(unplayed("agents.set")),
    },
    companions: {
      list: api.companions.list.handler(() => ({ items: [], windows: [] })),
      watch: api.companions.watch.handler(idle),
      content: api.companions.content.handler(unplayed("companions.content")),
      save: api.companions.save.handler(unplayed("companions.save")),
      attach: api.companions.attach.handler(unplayed("companions.attach")),
      move: api.companions.move.handler(unplayed("companions.move")),
      undock: api.companions.undock.handler(unplayed("companions.undock")),
      close: api.companions.close.handler(unplayed("companions.close")),
      renameWindow: api.companions.renameWindow.handler(unplayed("companions.renameWindow")),
      resetWindowTitle: api.companions.resetWindowTitle.handler(
        unplayed("companions.resetWindowTitle"),
      ),
    },
    asks: {
      list: api.asks.list.handler(unplayed("asks.list")),
      watch: api.asks.watch.handler(idle),
      answer: api.asks.answer.handler(unplayed("asks.answer")),
      read: api.asks.read.handler(unplayed("asks.read")),
    },
    messages: {
      list: api.messages.list.handler(unplayed("messages.list")),
      watch: api.messages.watch.handler(idle),
      pause: api.messages.pause.handler(unplayed("messages.pause")),
      release: api.messages.release.handler(unplayed("messages.release")),
      stop: api.messages.stop.handler(unplayed("messages.stop")),
    },
    voice: {
      watch: api.voice.watch.handler(idle),
      install: api.voice.install.handler(unplayed("voice.install")),
      cancel: api.voice.cancel.handler(unplayed("voice.cancel")),
      uninstall: api.voice.uninstall.handler(unplayed("voice.uninstall")),
      set: api.voice.set.handler(unplayed("voice.set")),
      record: api.voice.record.handler(unplayed("voice.record")),
      transcribe: api.voice.transcribe.handler(unplayed("voice.transcribe")),
      discard: api.voice.discard.handler(unplayed("voice.discard")),
    },
    murmur: {
      watch: api.murmur.watch.handler(idle),
      install: api.murmur.install.handler(unplayed("murmur.install")),
      cancel: api.murmur.cancel.handler(unplayed("murmur.cancel")),
      uninstall: api.murmur.uninstall.handler(unplayed("murmur.uninstall")),
      set: api.murmur.set.handler(unplayed("murmur.set")),
      noteOffered: api.murmur.noteOffered.handler(unplayed("murmur.noteOffered")),
      gist: api.murmur.gist.handler(unplayed("murmur.gist")),
    },
    settings: {
      get: api.settings.get.handler(() => ({ transcripts: true, welcomed: true })),
      set: api.settings.set.handler(() => {}),
    },
  })
  let connections = 0
  const connect = (signal: AbortSignal) => {
    const [server, client] = memoryChannel()
    connections += 1
    server.addEventListener("close", () => (connections -= 1))
    new RPCHandler(router).upgrade(server, { context: {} })
    return connectRunnerBackend(
      signal,
      () => {},
      () => messagePort(client),
    )
  }
  return {
    terminalIds,
    // Connects the app to the runner, as the desktop app does to its own.
    connect,
    // Changes a terminal as the runner reports it, as a status-line tick does.
    report: (
      terminalId: string,
      change: (summary: TerminalSummary) => Partial<TerminalSummary>,
    ) => {
      const current = summaries.get(terminalId)!
      const terminal = { ...current, ...change(current) }
      summaries.set(terminalId, terminal)
      announce({ type: "changed", terminal })
    },
    // Closes every terminal, as another window closing them would: the app lets go of
    // their screens and streams.
    closeAll: () => [...summaries.keys()].forEach(remove),
    // Writes output to the terminal's screen and every stream attached to it.
    write: (terminalId: string, data: string) => {
      written += encoder.encode(data).length
      screens.set(terminalId, [...(screens.get(terminalId) ?? []), data].slice(-screenRows))
      toStreams(terminalId, { terminalId, sequence: (sequence += 1), type: "output", data })
    },
    // The bytes the terminals' streams have sent the UI, snapshots included.
    bytes: () => bytes,
    // The bytes written to the terminals' screens, whoever streams them.
    written: () => written,
    // How many terminals' streams are attached now.
    streaming: () => streaming,
    // Whether a connection is open.
    connected: () => connections > 0,
    // The procedures the app called that the script doesn't play.
    unscripted: (): readonly string[] => unscripted,
  }
}
