import type { TerminalSummary } from "@novadeck/protocol"
import { RunnerError } from "@novadeck/protocol/client"
import { vi } from "vitest"

import { context, describe, expect, it } from "../../test"
import { id, scripted, session } from "./scripted"

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
    expect(app.of("claimAgentSession")).toEqual([[id(1), "claude"]])
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
        claimAgentSession: async () => null,
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
        claimAgentSession: () => Promise.reject(new RunnerError("TERMINAL_NOT_FOUND")),
      })
      await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
      expect(app.of("create")[0]).not.toHaveProperty("command")
      app.stop()
    })

    it("does not ask about a program that cannot resume", async () => {
      const app = scripted({ shown: [{ id: id(1), lastProcess: "vim" }] })
      await vi.waitFor(() => expect(app.of("create")).toHaveLength(1))
      expect(app.of("claimAgentSession")).toEqual([])
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
