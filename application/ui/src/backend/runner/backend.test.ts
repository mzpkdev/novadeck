import { afterAll, vi } from "vitest"

import { workspaceFromSeed } from "../../model/seed"
import {
  activeProject,
  activeSession,
  createTerminalState,
  workspaceReducer,
  type WorkspaceAction,
} from "../../model/state"
import type { Workspace, WorkspaceTarget } from "../../model/types"
import { context, describe, expect, it } from "../../test"
import type { BackendAction } from "../port"
import { runnerBackend, type RunnerBackend } from "./backend"
import { runnerSeed, type RunnerListing } from "./seed"
import { startTestRunner, typeInto } from "./testing"

// The runner samples the foreground process about once a second.
const eventually = { timeout: 5000 }

const runner = await startTestRunner()
afterAll(() => runner.close())

// A backend over the runner as the app drives it: seeded, committed and started.
const open = (listing: RunnerListing = runner.listing) => {
  const created: RunnerBackend = runnerBackend(runner.client, listing, { saveDelay: 10 })
  const { backend } = created
  let workspace = workspaceFromSeed(backend.seed, { view: "grid", windowedView: "grid", now: 1 })
  backend.commit(workspace, [])
  const received: BackendAction[] = []
  const stop = backend.start!({ dispatch: (actions) => received.push(...actions) })
  const commit = (actions: WorkspaceAction[]): Workspace => {
    workspace = actions.reduce(workspaceReducer, workspace)
    backend.commit(workspace, actions)
    return workspace
  }
  const target = (): WorkspaceTarget => ({
    projectId: activeProject(workspace)!.id,
    workspaceSessionId: activeSession(workspace)!.id,
  })
  const addTerminal = () => {
    const terminal = backend.newTerminal({
      number: activeSession(workspace)!.state.roster.nextNumber,
      directory: activeProject(workspace)!.directory,
    })
    commit([{ type: "terminal/add", target: target(), terminal }])
    return terminal
  }
  return { ...created, received, stop, commit, target, addTerminal, workspace: () => workspace }
}

describe("runner backend", () => {
  context("when the workspace changes", () => {
    it("saves the session so the next load restores names and order", async () => {
      const app = open()
      const first = app.addTerminal()
      const second = app.addTerminal()
      app.commit([
        { type: "terminal/rename", target: app.target(), terminalId: first.id, name: "server" },
        { type: "terminal/reorder", target: app.target(), tabOrder: [second.id, first.id] },
      ])
      await app.idle()
      app.stop()
      const reloaded = workspaceFromSeed(runnerSeed(await runner.reload()), {
        view: "focus",
        windowedView: "grid",
        now: 2,
      })
      const { roster } = activeSession(reloaded)!.state
      expect(roster.order).toEqual([second.id, first.id])
      const restored = roster.terminals.find((terminal) => terminal.id === first.id)
      expect(restored?.name).toBe("server")
      expect(restored?.state).not.toBe("ended")
    })

    it("creates a project opened from a folder, with its first session", async () => {
      const app = open()
      const project = { id: crypto.randomUUID(), name: "tmp", directory: process.cwd() }
      const session = {
        id: crypto.randomUUID(),
        name: "First",
        visitedAt: 3,
        state: createTerminalState([], "grid", "grid"),
      }
      app.commit([{ type: "project/add", project, activate: true, initialSession: session }])
      const terminal = app.addTerminal()
      await app.idle()
      app.stop()
      expect(await runner.client.projects.list()).toContainEqual({
        id: project.id,
        name: "tmp",
        cwd: process.cwd(),
      })
      const [listed] = await runner.client.terminals.list({ sessionId: session.id })
      expect(listed).toMatchObject({ id: terminal.id, status: "running" })
    })
  })

  context("when the workspace reloads after a session change", () => {
    const reopened = async () =>
      workspaceFromSeed(runnerSeed(await runner.reload()), {
        view: "grid",
        windowedView: "grid",
        now: 0,
      })

    it("opens a fresh session started last, then the session switched back to", async () => {
      const app = open()
      const now = Date.now()
      const previous = activeSession(app.workspace())!.id
      const fresh = {
        id: crypto.randomUUID(),
        name: "Fresh",
        visitedAt: now,
        state: createTerminalState([], "grid", "grid"),
      }
      app.commit([{ type: "session/add", projectId: app.target().projectId, session: fresh }])
      await app.idle()
      expect(activeSession(await reopened())!.id).toBe(fresh.id)
      app.commit([
        {
          type: "session/select",
          projectId: app.target().projectId,
          workspaceSessionId: previous,
          now,
        },
      ])
      await app.idle()
      app.stop()
      expect(activeSession(await reopened())!.id).toBe(previous)
    })
  })

  context("when the link drops", () => {
    it("creates and closes terminals once the runner is back", async () => {
      const app = open()
      await app.idle()
      await runner.drop()
      const terminal = app.addTerminal()
      await app.idle()
      const listed = await runner.client.terminals.list({
        sessionId: app.target().workspaceSessionId,
      })
      expect(listed.find((item) => item.id === terminal.id)?.status).toBe("running")
      expect(app.received.filter((action) => action.terminalId === terminal.id)).not.toContainEqual(
        expect.objectContaining({ status: expect.objectContaining({ state: "failed" }) }),
      )
      await runner.drop()
      app.commit([{ type: "terminal/close", target: app.target(), terminalId: terminal.id }])
      await app.idle()
      app.stop()
      const after = await runner.client.terminals.list({
        sessionId: app.target().workspaceSessionId,
      })
      expect(after.map((item) => item.id)).not.toContain(terminal.id)
    })
  })

  context("when the UI closes a terminal", () => {
    it("ends its shell and the runner forgets it", async () => {
      const app = open()
      const terminal = app.addTerminal()
      await app.idle()
      app.commit([{ type: "terminal/close", target: app.target(), terminalId: terminal.id }])
      await app.idle()
      app.stop()
      await vi.waitFor(async () => {
        const listed = await runner.client.terminals.list({
          sessionId: app.target().workspaceSessionId,
        })
        // The runner forgets a terminal closed on purpose, so a reload cannot bring it back.
        expect(listed.map((item) => item.id)).not.toContain(terminal.id)
      })
    })
  })

  context("when the runner reports on a terminal", () => {
    it.skipIf(process.platform !== "linux")(
      "reports the foreground program, then the exit",
      async () => {
        const app = open()
        const terminal = app.addTerminal()
        await app.idle()
        const { terminalId, ...target } = { ...app.target(), terminalId: terminal.id }
        await typeInto(runner.client, terminal.id, "title claude\r")
        await vi.waitFor(
          () =>
            expect(app.received).toContainEqual({
              type: "terminal/process",
              target,
              terminalId,
              process: { process: "claude", kind: "claude" },
            }),
          eventually,
        )
        expect(app.received).toContainEqual({
          type: "terminal/status",
          target,
          terminalId,
          status: { state: "running" },
        })
        await typeInto(runner.client, terminal.id, "exit 2\r")
        await vi.waitFor(
          () =>
            expect(app.received).toContainEqual({
              type: "terminal/status",
              target,
              terminalId,
              status: { state: "exited", exitCode: 2 },
            }),
          eventually,
        )
        app.stop()
      },
    )

    it("marks a terminal another client closed as ended", async () => {
      const app = open()
      const terminal = app.addTerminal()
      await app.idle()
      const { terminalId, ...target } = { ...app.target(), terminalId: terminal.id }
      await runner.client.terminals.close(terminal.id)
      await vi.waitFor(
        () =>
          expect(app.received).toContainEqual({
            type: "terminal/status",
            target,
            terminalId,
            status: { state: "ended" },
          }),
        eventually,
      )
      app.stop()
    })

    it("marks a terminal it no longer lists as ended", async () => {
      const [home] = runner.listing
      const { session } = home!.sessions[0]!
      const lost = crypto.randomUUID()
      const listing: RunnerListing = [
        {
          project: home!.project,
          sessions: [
            {
              session,
              terminals: [
                {
                  id: lost,
                  sessionId: session.id,
                  cwd: home!.project.cwd,
                  cols: 80,
                  rows: 24,
                  status: "running",
                  exitCode: null,
                  process: "zsh",
                },
              ],
            },
          ],
        },
      ]
      const app = open(listing)
      await vi.waitFor(() =>
        expect(app.received).toContainEqual({
          type: "terminal/status",
          target: app.target(),
          terminalId: lost,
          status: { state: "ended" },
        }),
      )
      app.stop()
    })
  })
})
