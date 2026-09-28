import type { TerminalSummary } from "@novadeck/protocol"
import type { RunnerStatus, TerminalWatchItem } from "@novadeck/protocol/client"

import { workspaceFromSeed } from "../../model/seed"
import { createTerminalState } from "../../model/state"
import { runnerBackend, type RunnerApi } from "./backend"
import { startingTerminal, type RunnerListing } from "./seed"
import { encodeSession } from "./session-state"

// Test support: a runner adapter over a runner the test scripts step by step.

// Values pushed by the test, read by the adapter as a stream.
const channel = <T>() => {
  const queued: T[] = []
  let wake: (() => void) | undefined
  const iterator: AsyncIterableIterator<T, undefined> = {
    [Symbol.asyncIterator]: () => iterator,
    next: async () => {
      // eslint-disable-next-line no-await-in-loop -- Waits for the next pushed value.
      while (!queued.length) await new Promise<void>((resolve) => (wake = resolve))
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
  }
}

const unused = (): never => {
  throw new Error("not used here")
}

export const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
export const session = "0c8d6f2e-5b1a-4a7e-9d3c-2f4b6a8e1c0d"

type Saved = { readonly id: string; readonly lastProcess: string }
type Call = { readonly call: string; readonly input: unknown }

// A saved session holding the terminals, each waiting to restore its program.
const state = (saved: readonly Saved[], visitedAt: number, name: string) => ({
  id: name,
  name,
  visitedAt,
  state: createTerminalState(
    saved.map((terminal, index) => ({
      ...startingTerminal(terminal.id, index + 1, "/tmp"),
      ...(terminal.lastProcess ? { restoredProcess: terminal.lastProcess } : {}),
    })),
    "grid",
    "grid",
  ),
})

// A runner the test scripts: each session's saved terminals, what the runner still
// lists, and the agent session it knows. Every call that could start a shell is noted.
export const scripted = ({
  shown,
  background = [],
  listed = [],
  claimAgentSession = async () => session,
  restart = () => new Promise<TerminalSummary>(() => {}),
  saveSettings = async () => {},
  connect = async (agent: string, connected: boolean) => ({ agent, available: true, connected }),
}: {
  shown: readonly Saved[]
  background?: readonly Saved[]
  listed?: readonly TerminalSummary[]
  claimAgentSession?: (terminalId: string, agent: string) => Promise<string | null>
  restart?: () => Promise<TerminalSummary>
  saveSettings?: () => Promise<void>
  connect?: (agent: string, connected: boolean) => Promise<unknown>
}) => {
  const changes = channel<TerminalWatchItem>()
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
    projects: { list: unused, create: unused, rename: unused },
    sessions: { list: unused, create: unused, rename: unused, save: async () => {} },
    settings: { get: unused, set: note("settings", saveSettings) },
    agents: {
      list: async () => [],
      set: note("agents", (input) => {
        const [agent, connected] = input as [string, boolean]
        return connect(agent, connected)
      }),
    },
    terminals: {
      list: unused,
      watch: () => changes.iterator,
      // Never answers: a fresh shell stays starting.
      create: note("create", () => new Promise(() => {})),
      close: async () => {},
      restart: note("restart", restart),
      claimAgentSession: note("claimAgentSession", (input) => {
        const [terminalId, agent] = input as [string, string]
        return claimAgentSession(terminalId, agent)
      }),
      attach: () => new Promise(() => {}),
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
          terminals: listed.filter((terminal) => shown.some((saved) => saved.id === terminal.id)),
        },
        {
          session: {
            id: id(9),
            projectId: "p",
            name: "Background",
            state: encodeSession(state(background, 1, id(9)), 0),
          },
          terminals: [],
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
    onboarded: false,
  })
  created.backend.commit(
    workspaceFromSeed(created.backend.seed, { view: "grid", windowedView: "grid", now: 1 }),
    [],
  )
  const stop = created.backend.start!({ dispatch: () => {} })
  statuses.push({ state: "connected", runnerId: "runner-1" })
  const of = (call: string) => calls.filter((item) => item.call === call).map((item) => item.input)
  const key = (terminalId: string) => ({ projectId: "p", workspaceSessionId: id(8), terminalId })
  return { ...created, changes, calls, of, stop, key }
}
