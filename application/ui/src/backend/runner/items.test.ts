import type { CompanionItem, CompanionWindow } from "@novadeck/protocol"
import { RunnerError } from "@novadeck/protocol/client"
import { vi } from "vitest"

import { itemIdOf } from "../../model/companion"
import { workspaceFromSeed } from "../../model/seed"
import {
  createTerminalState,
  createWorkspaceSession,
  workspaceReducer,
  type WorkspaceAction,
} from "../../model/state"
import { context, describe, expect, it } from "../../test"
import type { BackendAction } from "../port"
import { itemOf } from "./companions"
import { id, scripted } from "./scripted"

const session = id(8)
const target = { projectId: "p", workspaceSessionId: session }
const [first, second] = [id(1), id(2)]

const runnerItem = (itemId: string, change: Partial<CompanionItem> = {}): CompanionItem => ({
  id: itemId,
  sessionId: session,
  holder: { terminalId: first },
  kind: "file",
  name: `${itemId}.ts`,
  detail: "",
  path: `/p/${itemId}.ts`,
  url: null,
  lines: null,
  held: false,
  by: "agent",
  from: { terminalId: first, handle: "t1" },
  version: 1,
  asked: false,
  shownAt: 1,
  plan: null,
  ...change,
})
const runnerWindow = (windowId: string, itemId: string): CompanionWindow => ({
  id: windowId,
  sessionId: session,
  itemId,
  title: `${itemId}.ts`,
  titleSource: { kind: "default" },
})
const notes = runnerItem("00000000-0000-4000-8000-0000000000a1")
const hero = runnerItem("00000000-0000-4000-8000-0000000000a2")
const windowId = "00000000-0000-4000-8000-0000000000b1"

// The adapter over a scripted runner whose shown session has two terminals, and `notes`
// on the first one's bar. `answer` is how the runner answers the person's changes.
const open = (
  answer?: (call: string, input: unknown) => Promise<unknown>,
  createSession?: () => Promise<unknown>,
) => {
  const app = scripted({
    ...(createSession ? { createSession } : {}),
    shown: [
      { id: first, lastProcess: "" },
      { id: second, lastProcess: "" },
    ],
    companions: { items: [notes], windows: [] },
    ...(answer ? { respond: answer } : {}),
  })
  let workspace = workspaceFromSeed(app.backend.seed, {
    view: "grid",
    windowedView: "grid",
    now: 1,
  })
  const commit = (...actions: WorkspaceAction[]) => {
    workspace = actions.reduce(workspaceReducer, workspace)
    app.backend.commit(workspace, actions)
  }
  // What the adapter reported of items and windows.
  const reported = (): BackendAction[] =>
    app.received.filter((action) => /^(item|window)\//.test(action.type))
  return { ...app, commit, reported }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("the runner's items and windows", () => {
  it("seed the session with what the runner lists", () => {
    const app = open()
    const listed = app.backend.seed.projects[0]!.sessions.find((each) => each.id === session)
    expect(listed?.items.map((item) => item.id)).toEqual([notes.id])
    app.stop()
  })

  context("when the runner lists everything again", () => {
    it("applies the list whole at synced, dropping what it no longer has first", async () => {
      const app = open()
      app.items.push({ type: "reset" })
      app.items.push({ type: "item", item: { ...hero, holder: { windowId } } })
      app.items.push({ type: "window", window: runnerWindow(windowId, hero.id) })
      await settle()
      expect(app.reported()).toEqual([])
      app.items.push({ type: "synced" })
      await vi.waitFor(() => expect(app.reported()).toHaveLength(3))
      expect(app.reported()).toEqual([
        { type: "item/remove", target, itemId: notes.id },
        expect.objectContaining({
          type: "window/upsert",
          window: expect.objectContaining({ id: windowId }),
        }),
        expect.objectContaining({
          type: "item/upsert",
          item: expect.objectContaining({ id: hero.id }),
        }),
      ])
      app.stop()
    })

    it("reports nothing again of what didn't change", async () => {
      const app = open()
      app.items.push({ type: "reset" })
      app.items.push({ type: "item", item: notes })
      app.items.push({ type: "synced" })
      await settle()
      await settle()
      expect(app.reported()).toEqual([])
      app.stop()
    })
  })

  context("after it caught up", () => {
    it("reports each change as it comes, whatever it references", async () => {
      const app = open()
      app.items.push({ type: "reset" })
      app.items.push({ type: "item", item: notes })
      app.items.push({ type: "synced" })
      // A window whose item comes next, and an item whose window came first.
      app.items.push({ type: "window", window: runnerWindow(windowId, hero.id) })
      app.items.push({ type: "item", item: { ...hero, holder: { windowId } } })
      app.items.push({ type: "itemRemoved", itemId: notes.id, sessionId: session })
      await vi.waitFor(() => expect(app.reported()).toHaveLength(3))
      expect(app.reported().map((action) => action.type)).toEqual([
        "window/upsert",
        "item/upsert",
        "item/remove",
      ])
      app.stop()
    })
  })

  context("when the person changes them", () => {
    it("sends each change to the runner", async () => {
      const app = open()
      app.commit(
        { type: "item/move", target, itemIds: [itemIdOf(notes.id)], terminalId: second },
        {
          type: "item/undock",
          target,
          itemId: itemIdOf(notes.id),
          window: {
            id: windowId,
            itemId: itemIdOf(notes.id),
            name: "notes",
            titleSource: { kind: "default" },
          },
        },
        { type: "terminal/rename", target, terminalId: windowId, name: "Notes" },
      )
      app.backend.resetTitle!({ ...target, terminalId: windowId })
      app.commit({ type: "item/close", target, itemId: itemIdOf(notes.id) })
      await vi.waitFor(() =>
        expect(app.calls.filter((call) => call.call !== "create").map((call) => call.call)).toEqual(
          ["move", "undock", "rename window", "reset window", "close item"],
        ),
      )
      expect(app.of("move")).toEqual([[notes.id, second]])
      expect(app.of("undock")).toEqual([[notes.id, windowId]])
      expect(app.of("rename window")).toEqual([[windowId, "Notes"]])
      expect(app.of("rename")).toEqual([])
      expect(app.reported()).toEqual([])
      app.stop()
    })

    it("puts back what the runner last confirmed when it refuses a move", async () => {
      const app = open(async (call) => {
        if (call === "move") throw new RunnerError("CONFLICT", "Another session")
      })
      app.commit({ type: "item/move", target, itemIds: [itemIdOf(notes.id)], terminalId: second })
      await vi.waitFor(() => expect(app.reported()).toHaveLength(1))
      expect(app.reported()).toEqual([
        {
          type: "item/upsert",
          target,
          item: expect.objectContaining({ id: notes.id, holder: { terminalId: first } }),
        },
      ])
      app.stop()
    })

    it("takes away a window the runner refused, putting its item back", async () => {
      const app = open(async (call) => {
        if (call === "undock") throw new RunnerError("CONFLICT", "Taken")
      })
      app.commit({
        type: "item/undock",
        target,
        itemId: itemIdOf(notes.id),
        window: {
          id: windowId,
          itemId: itemIdOf(notes.id),
          name: "notes",
          titleSource: { kind: "default" },
        },
      })
      await vi.waitFor(() => expect(app.reported()).toHaveLength(2))
      expect(app.reported()).toEqual([
        { type: "window/remove", target, windowId },
        expect.objectContaining({
          type: "item/upsert",
          item: expect.objectContaining({ id: notes.id }),
        }),
      ])
      app.stop()
    })

    it("takes closing what the runner no longer has as done", async () => {
      const app = open(async (call) => {
        if (call === "close item") throw new RunnerError("NOT_FOUND", "Gone")
      })
      app.commit({ type: "item/close", target, itemId: itemIdOf(notes.id) })
      await vi.waitFor(() => expect(app.of("close item")).toHaveLength(1))
      await settle()
      expect(app.reported()).toEqual([])
      app.stop()
    })
  })

  context("in a session the runner hasn't finished creating", () => {
    it("sends the person's changes only once the session exists there", async () => {
      let created!: () => void
      const app = open(undefined, () => new Promise<void>((resolve) => (created = resolve)))
      const fresh = id(7)
      const there = { projectId: "p", workspaceSessionId: fresh }
      const item = itemIdOf(hero.id)
      app.commit(
        {
          type: "session/add",
          projectId: "p",
          activate: false,
          session: createWorkspaceSession(
            { name: "Fresh", state: createTerminalState([], "grid", "grid") },
            { id: fresh, now: 1 },
          ),
        },
        { type: "item/upsert", target: there, item: { ...itemOf(hero), id: item } },
        { type: "item/move", target: there, itemIds: [item], terminalId: first },
        {
          type: "item/undock",
          target: there,
          itemId: item,
          window: { id: windowId, itemId: item, name: "hero", titleSource: { kind: "default" } },
        },
        { type: "terminal/rename", target: there, terminalId: windowId, name: "Hero" },
      )
      await vi.waitFor(() => expect(app.of("create session")).toHaveLength(1))
      await settle()
      const sent = () =>
        app.calls
          .map((call) => call.call)
          .filter((call) => ["create session", "move", "undock", "rename window"].includes(call))
      expect(sent()).toEqual(["create session"])
      created()
      await vi.waitFor(() =>
        expect(sent()).toEqual(["create session", "move", "undock", "rename window"]),
      )
      app.stop()
    })
  })
})
