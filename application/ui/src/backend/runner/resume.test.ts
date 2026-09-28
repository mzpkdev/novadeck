import type { TerminalSummary } from "@novadeck/protocol"
import { RunnerError, type RunnerStatus, type TerminalWatchItem } from "@novadeck/protocol/client"
import { vi } from "vitest"

import { workspaceFromSeed } from "../../model/seed"
import { createTerminalState } from "../../model/state"
import { context, describe, expect, it } from "../../test"
import { runnerBackend, type RunnerApi } from "./backend"
import { startingTerminal, type RunnerListing } from "./seed"
import { encodeSession } from "./session-state"

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

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const session = "0c8d6f2e-5b1a-4a7e-9d3c-2f4b6a8e1c0d"

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
const scripted = ({
  shown,
  background = [],
  listed = [],
  agentSession = async () => session,
  restart = () => new Promise<TerminalSummary>(() => {}),
  saveSettings = async () => {},
  connect = async (agent: string, connected: boolean) => ({ agent, available: true, connected }),
}: {
  shown: readonly Saved[]
  background?: readonly Saved[]
  listed?: readonly TerminalSummary[]
  agentSession?: (terminalId: string, agent: string) => Promise<string | null>
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
      agentSession: note("agentSession", (input) => {
        const [terminalId, agent] = input as [string, string]
        return agentSession(terminalId, agent)
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

const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

const exited = (terminalId: string): TerminalSummary => ({
  id: terminalId,
  sessionId: id(8),
  cwd: "/tmp",
  cols: 80,
  rows: 24,
  run: 1,
  exit: { code: null, signal: "SIGKILL", ranMs: 9_000 },
  process: null,
  agent: null,
})

describe("resuming a restored terminal", () => {
  it("types the agent's resume command at the fresh shell's first prompt, where it left off", async () => {
    const app = scripted({ shown: [{ id: id(1), lastProcess: "claude" }] })
    await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
    expect(app.of("agentSession")).toEqual([[id(1), "claude"]])
    expect(app.of("create")[0]).toMatchObject({
      id: id(1),
      restore: true,
      command: `claude --resume ${session}`,
    })
    app.stop()
  })

  it("resumes Codex with its own command", async () => {
    const app = scripted({ shown: [{ id: id(1), lastProcess: "codex" }] })
    await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
    expect(app.of("create")[0]).toMatchObject({ command: `codex resume ${session}` })
    app.stop()
  })

  context("without a known session", () => {
    it("starts a plain shell showing its transcript, never continuing the last session", async () => {
      const app = scripted({
        shown: [{ id: id(1), lastProcess: "claude" }],
        agentSession: async () => null,
      })
      await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
      expect(app.of("create")[0]).toEqual({
        id: id(1),
        sessionId: id(8),
        cols: 80,
        rows: 24,
        restore: true,
      })
      expect(JSON.stringify(app.calls)).not.toContain("continue")
      app.stop()
    })

    it("starts a plain shell when the runner cannot say", async () => {
      const app = scripted({
        shown: [{ id: id(1), lastProcess: "claude" }],
        agentSession: () => Promise.reject(new RunnerError("TERMINAL_NOT_FOUND")),
      })
      await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
      expect(app.of("create")[0]).not.toHaveProperty("command")
      app.stop()
    })

    it("does not ask about a program that cannot resume", async () => {
      const app = scripted({ shown: [{ id: id(1), lastProcess: "vim" }] })
      await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
      expect(app.of("agentSession")).toEqual([])
      expect(app.of("create")[0]).not.toHaveProperty("command")
      app.stop()
    })
  })

  it("resumes agents in background sessions at once, while plain shells wait to be shown", async () => {
    const app = scripted({
      shown: [],
      background: [
        { id: id(1), lastProcess: "claude" },
        { id: id(2), lastProcess: "" },
      ],
    })
    await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
    await flush()
    expect(app.of("create")).toEqual([
      expect.objectContaining({ id: id(1), command: `claude --resume ${session}` }),
    ])
    app.stop()
  })

  it("sends the resume with the restart after the shell was killed", async () => {
    const app = scripted({
      shown: [{ id: id(1), lastProcess: "claude" }],
      listed: [exited(id(1))],
    })
    await flush()
    // An exited terminal waits for Enter.
    expect(app.of("restart")).toEqual([])
    app.restart(app.key(id(1)))
    await vi.waitFor(() => expect(app.of("restart")).toHaveLength(1))
    expect(app.of("restart")[0]).toEqual([
      id(1),
      { cols: 80, rows: 24, command: `claude --resume ${session}` },
    ])
    app.stop()
  })

  it("resumes nothing into a shell that still runs", async () => {
    // Another window still holds the old shell: the runner refuses the restart, and the
    // command with it.
    const app = scripted({
      shown: [{ id: id(1), lastProcess: "claude" }],
      listed: [exited(id(1))],
      restart: () => Promise.reject(new RunnerError("CONFLICT")),
    })
    await flush()
    app.restart(app.key(id(1)))
    await app.idle()
    expect(app.of("restart")).toHaveLength(1)
    expect(app.of("create")).toEqual([])
    app.stop()
  })
})

describe("the transcript setting", () => {
  it("shows what the runner said, and changes it there", async () => {
    const app = scripted({ shown: [] })
    const transcripts = app.backend.transcripts!
    expect(transcripts.enabled.getSnapshot()).toBe(true)
    transcripts.set(false)
    expect(transcripts.enabled.getSnapshot()).toBe(false)
    await app.idle()
    expect(app.of("settings")).toEqual([{ transcripts: false }])
    app.stop()
  })

  it("goes back when the runner could not change it", async () => {
    const app = scripted({
      shown: [],
      saveSettings: () => Promise.reject(new RunnerError("DISCONNECTED")),
    })
    const transcripts = app.backend.transcripts!
    transcripts.set(false)
    await app.idle()
    expect(transcripts.enabled.getSnapshot()).toBe(true)
    app.stop()
  })
})

describe("the agent switches", () => {
  it("connect an agent through the runner, busy until it answers", async () => {
    const app = scripted({ shown: [] })
    const agents = app.backend.agents!
    agents.set("claude", true)
    expect(agents.state.getSnapshot()[0]).toMatchObject({ busy: true, connected: false })
    await app.idle()
    expect(app.of("agents")).toEqual([["claude", true]])
    expect(agents.state.getSnapshot()[0]).toEqual({
      agent: "claude",
      available: true,
      connected: true,
      busy: false,
    })
    app.stop()
  })

  it("say why an agent could not be connected, and leave it as it was", async () => {
    const app = scripted({
      shown: [],
      connect: () =>
        Promise.reject(new RunnerError("AGENT_SETUP_FAILED", "claude plugin install failed")),
    })
    const agents = app.backend.agents!
    agents.set("claude", true)
    await app.idle()
    expect(agents.state.getSnapshot()[0]).toMatchObject({
      connected: false,
      busy: false,
      error: "claude plugin install failed",
    })
    app.stop()
  })

  it("offer onboarding until it is done, which the runner remembers", async () => {
    const app = scripted({ shown: [] })
    const agents = app.backend.agents!
    expect(agents.onboarding.getSnapshot()).toBe(true)
    agents.finishOnboarding()
    expect(agents.onboarding.getSnapshot()).toBe(false)
    await app.idle()
    expect(app.of("settings")).toEqual([{ onboarded: true }])
    app.stop()
  })
})
