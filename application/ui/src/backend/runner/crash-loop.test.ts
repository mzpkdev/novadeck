import { RunnerError, type Runner, type RunnerStatus } from "@novadeck/protocol/client"
import { vi } from "vitest"

import { workspaceFromSeed } from "../../model/seed"
import { createTerminalState } from "../../model/state"
import { describe, expect, it } from "../../test"
import type { BackendAction } from "../port"
import { runnerBackend, type RunnerApi } from "./backend"
import { startingTerminal, type RunnerListing } from "./seed"
import { encodeSession } from "./session-state"

const unused = (): never => {
  throw new Error("not used here")
}
// A terminal watch that never reports anything.
const nothing = (): AsyncIterableIterator<never, undefined> => {
  const iterator: AsyncIterableIterator<never, undefined> = {
    [Symbol.asyncIterator]: () => iterator,
    next: () => new Promise(() => {}),
    return: async () => ({ done: true, value: undefined }),
  }
  return iterator
}

// A runner that dies each time it is asked to start a shell, coming back as a new
// process: something a real runner cannot be made to do on cue.
const crashingRunner = () => {
  let generation = 1
  let creates = 0
  const wake = new Set<() => void>()
  const statuses = async function* (): AsyncGenerator<RunnerStatus, undefined> {
    let seen = 0
    for (;;) {
      if (seen !== generation) {
        seen = generation
        yield { state: "connected", runnerId: `runner-${generation}` }
      }
      // eslint-disable-next-line no-await-in-loop -- Waits for the next crash.
      await new Promise<void>((resolve) => wake.add(resolve))
    }
  }

  const crash = async (): Promise<never> => {
    creates += 1
    generation += 1
    for (const resolve of wake) resolve()
    wake.clear()
    throw new RunnerError("DISCONNECTED", "The runner crashed.")
  }
  const api = {
    watch: statuses,
    projects: { list: unused, create: unused, rename: unused },
    sessions: { list: unused, create: unused, rename: unused, save: async () => {} },
    terminals: {
      list: unused,
      watch: nothing,
      create: crash,
      restart: crash,
      close: async () => {},
      attach: () => Promise.reject(new RunnerError("DISCONNECTED")),
    },
  } as unknown as RunnerApi satisfies Pick<Runner, "watch">
  return { api, creates: () => creates }
}

describe("a runner that crashes while shells start", () => {
  it("gives up after a few restarts and leaves the terminal waiting for Enter", async () => {
    const { api, creates } = crashingRunner()
    const terminal = startingTerminal("00000000-0000-4000-8000-000000000001", 1, "/tmp")
    const session = {
      id: "s",
      name: "S",
      visitedAt: 5,
      state: createTerminalState([terminal], "grid", "grid"),
    }
    const listing: RunnerListing = [
      {
        project: { id: "p", name: "P", cwd: "/tmp" },
        sessions: [
          {
            session: { id: "s", projectId: "p", name: "S", state: encodeSession(session, 2) },
            terminals: [],
          },
        ],
      },
    ]
    const created = runnerBackend(api, listing, { saveDelay: 10 })
    created.backend.commit(
      workspaceFromSeed(created.backend.seed, { view: "grid", windowedView: "grid", now: 1 }),
      [],
    )
    const received: BackendAction[] = []
    const stop = created.backend.start!({ dispatch: (actions) => received.push(...actions) })
    await vi.waitFor(
      () =>
        expect(received.at(-1)).toMatchObject({
          type: "terminal/status",
          status: { state: "failed", message: "The runner keeps restarting." },
        }),
      { timeout: 5_000 },
    )
    expect(creates()).toBeLessThanOrEqual(5)
    stop()
  })
})
