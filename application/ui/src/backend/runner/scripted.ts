import type { TerminalEvent, TerminalSummary } from "@novadeck/protocol"
import type {
  AttachedTerminal,
  CompanionWatchItem,
  Runner,
  RunnerStatus,
  TerminalWatchItem,
} from "@novadeck/protocol/client"

import { workspaceFromSeed } from "../../model/seed"
import { createTerminalState, workspaceReducer, type WorkspaceAction } from "../../model/state"
import type { Workspace } from "../../model/types"
import type { BackendAction } from "../port"
import { runnerBackend, type RunnerApi } from "./backend"
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

// A runner's terminal stream the test writes into: a snapshot of the screen on attach,
// then each write as output, until detached. Counts what reaches its reader.
const scriptedAttachment = (
  terminalId: string,
  screen: string,
  { taken, ended }: { taken: (event: TerminalEvent) => void; ended: () => void },
) => {
  const events = channel<TerminalEvent>()
  let sequence = 0
  let open = true
  const end = (): void => {
    if (!open) return
    open = false
    events.end()
    ended()
  }
  const attached: AttachedTerminal = {
    id: terminalId,
    mode: "control",
    [Symbol.asyncIterator]: () => attached,
    next: async () => {
      const result = await events.iterator.next()
      if (result.done) end()
      else taken(result.value)
      return result
    },
    return: async () => {
      end()
      return { value: undefined, done: true }
    },
    write: async () => {},
    resize: async () => {},
    detach: async () => end(),
  }
  const stamp = () => ({ terminalId, sequence: (sequence += 1) })
  events.push({ ...stamp(), type: "snapshot", data: screen, cols: 80, rows: 24, exit: null })
  return {
    attached,
    write: (data: string) => {
      if (open) events.push({ ...stamp(), type: "output", data })
    },
    open: () => open,
  }
}

// How many rows of each terminal's output its runner screen keeps for a snapshot.
const screenRows = 24
const handles = "moth fox owl crow kite raven wren lark finch heron swift robin hawk".split(" ")
const encoder = new TextEncoder()

// A runner the whole app boots over: one project whose shown session holds `terminals`
// Claude Code agents, every one running, laid out in Grid. The test reports changes to a
// terminal through the runner's watch and writes output into its attached streams; the
// runner counts the bytes those streams hand the UI and the streams open at once.
export const scriptedRunner = ({ terminals: count }: { readonly terminals: number }) => {
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
  const rows = new Map(terminalIds.map((terminalId) => [terminalId, [] as string[]]))
  const attachments = new Map<string, ReturnType<typeof scriptedAttachment>[]>()
  let bytes = 0
  let written = 0
  let streaming = 0
  const changes = channel<TerminalWatchItem>()
  for (const terminal of summaries.values()) changes.push({ type: "changed", terminal })
  changes.push({ type: "synced" })
  // Streams that never yield, for what the app follows but the script leaves alone.
  const idle = () => channel<never>().iterator
  const api = {
    watch: () => {
      const statuses = channel<RunnerStatus>()
      statuses.push({ state: "connected", runnerId: "runner-1" })
      return statuses.iterator
    },
    projects: { list: unused, create: unused, rename: unused, remove: unused },
    sessions: { list: unused, create: unused, rename: unused, save: async () => {} },
    settings: { get: unused, set: async () => {} },
    agents: {
      list: async () => [{ agent: "claude", available: true, connected: true }],
      detail: idle,
      transcript: idle,
      prompt: unused,
      interrupt: unused,
      answer: unused,
      set: unused,
    },
    terminals: {
      list: unused,
      watch: () => changes.iterator,
      requests: idle,
      create: unused,
      close: unused,
      rename: unused,
      restart: unused,
      attach: async (terminalId: string) => {
        streaming += 1
        const attachment = scriptedAttachment(terminalId, (rows.get(terminalId) ?? []).join(""), {
          taken: (event) => {
            if (event.type === "snapshot" || event.type === "output")
              bytes += encoder.encode(event.data).length
          },
          ended: () => {
            streaming -= 1
          },
        })
        attachments.set(terminalId, [...(attachments.get(terminalId) ?? []), attachment])
        return attachment.attached
      },
    },
    companions: { list: unused, watch: idle, content: idle },
    messages: { watch: idle, pause: unused, release: unused, stop: unused },
    asks: { watch: idle },
    voice: { watch: idle },
    murmur: { watch: idle },
  } as unknown as RunnerApi
  const listing: RunnerListing = [
    {
      project: { id: "p", name: "P", cwd: "/tmp" },
      sessions: [
        {
          session: {
            id: sessionId,
            projectId: "p",
            name: "Agents",
            state: encodeSession(
              state(
                terminalIds.map((terminalId) => ({ id: terminalId, lastProcess: "claude" })),
                5,
                sessionId,
              ),
              0,
            ),
          },
          terminals: [...summaries.values()],
        },
      ],
    },
  ]
  return {
    terminalIds,
    // A backend for the app, as connecting to the runner makes one.
    createBackend: () =>
      runnerBackend(api, listing, {
        transcripts: true,
        agents: [{ agent: "claude", available: true, connected: true }],
        welcomed: true,
      }).backend,
    // Changes a terminal as the runner reports it, as a status-line tick does.
    report: (
      terminalId: string,
      change: (summary: TerminalSummary) => Partial<TerminalSummary>,
    ) => {
      const current = summaries.get(terminalId)!
      const terminal = { ...current, ...change(current) }
      summaries.set(terminalId, terminal)
      changes.push({ type: "changed", terminal })
    },
    // Writes output to the terminal's screen and every stream attached to it.
    write: (terminalId: string, data: string) => {
      written += encoder.encode(data).length
      const kept = [...(rows.get(terminalId) ?? []), data]
      rows.set(terminalId, kept.slice(-screenRows))
      for (const attachment of attachments.get(terminalId) ?? []) attachment.write(data)
      attachments.set(
        terminalId,
        (attachments.get(terminalId) ?? []).filter((attachment) => attachment.open()),
      )
    },
    // The bytes the terminals' streams have handed the UI, snapshots included.
    bytes: () => bytes,
    // The bytes written to the terminals' screens, whoever streams them.
    written: () => written,
    // How many terminals' streams are attached now.
    streaming: () => streaming,
  }
}
