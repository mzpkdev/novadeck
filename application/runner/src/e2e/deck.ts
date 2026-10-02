import { randomUUID } from "node:crypto"
import { join } from "node:path"

import type {
  AgentName,
  DeliveryState,
  TerminalMessages,
  TerminalSummary,
} from "@novadeck/protocol"
import headless from "@xterm/headless"

import { createHarnesses, type Harnesses } from "../harnesses/service.js"
import { installShellFiles, type InstalledShell } from "../shell/install.js"
import { Terminals } from "../terminals/index.js"
import { WorkspaceStore } from "../workspaces/store.js"

/** The client the deck drives terminals as: it creates them, so it controls them. */
const owner = "e2e"

/**
 * A snapshot's visible rows as plain text, as the person would read them: the snapshot
 * draws spaces as cursor moves and colours as escapes, so it is replayed on a screen of
 * its own.
 */
const render = async (snapshot: string, cols: number, rows: number): Promise<string> => {
  const screen = new headless.Terminal({ cols, rows, scrollback: 0, allowProposedApi: true })
  try {
    await new Promise<void>((resolve) => screen.write(snapshot, resolve))
    const buffer = screen.buffer.active
    return Array.from({ length: rows }, (_, row) =>
      (buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "").trimEnd(),
    ).join("\n")
  } finally {
    screen.dispose()
  }
}

/** One terminal of the deck, driven as the person would and read as a client would. */
export type DeckTerminal = {
  readonly id: string
  /** Its handle, as agents name it to each other: `t1`, `t2`… */
  readonly handle: string
  /** Its screen's text now. */
  readonly screen: () => Promise<string>
  /** Waits until its screen shows the text, and returns the screen. */
  readonly until: (text: string | RegExp, timeoutMs?: number) => Promise<string>
  /**
   * Types the text, waits for it to show once more than it did before, then presses
   * Enter: Enter only ever follows text seen to land, so it can't confirm a dialog or
   * pick from a menu.
   */
  readonly submit: (text: string) => Promise<void>
  /**
   * Sends keys other than Enter, such as Escape (`\x1b`), as typed. Anything holding a
   * carriage return or line feed, the keypad's Enter (`\x1bOM`) or the kitty keyboard
   * protocol's (`\x1b[13u`, `\x1b[13;…u`), is refused.
   */
  readonly press: (keys: string) => void
  /** What a client's terminal listing says of it now: its agent and that agent's activity. */
  readonly summary: () => TerminalSummary
  /** Its messages and how its agent can take one now. */
  readonly messages: () => TerminalMessages
  /** Waits until its delivery state is one of those given, and returns it. */
  readonly delivery: (
    states: readonly DeliveryState[],
    timeoutMs?: number,
  ) => Promise<DeliveryState>
}

export type Deck = {
  readonly terminals: Terminals
  readonly store: WorkspaceStore
  readonly sessionId: string
  /** Installs NovaDeck's plugin into the harness through its own commands, as Connect does. */
  readonly connect: (agent: AgentName) => Promise<void>
  /** Opens a terminal in the project that runs `command` at its shell's first prompt. */
  readonly open: (command?: string) => Promise<DeckTerminal>
  readonly close: () => Promise<void>
}

export type DeckOptions = {
  /** The data folder: the workspace's database and NovaDeck's shell files. */
  readonly data: string
  /** The project folder terminals open in. */
  readonly project: string
  /** The whole environment of every process the deck starts. */
  readonly env: Readonly<Record<string, string>>
}

// How many times the text appears on the screen.
const occurrences = (shown: string, text: string): number => shown.split(text).length - 1

/**
 * Polls `read` until it gives a value, and returns it; fails with `what` after the
 * timeout.
 */
export const poll = async <T>(
  read: () => T | undefined | Promise<T | undefined>,
  what: string,
  timeoutMs = 30_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- Polls until the value comes.
    const value = await read()
    if (value !== undefined) return value
    // eslint-disable-next-line no-await-in-loop -- As above.
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`)
}

/**
 * The runner's terminals as a test needs them, wired as the runner wires them, with every
 * process the deck starts given exactly `env`: nothing of the developer's reaches a shell.
 */
const terminalsFor = (
  options: DeckOptions,
  store: WorkspaceStore,
  shell: Promise<InstalledShell>,
  harnesses: Harnesses,
): Terminals =>
  new Terminals({
    shell: "/bin/bash",
    baseEnv: options.env,
    records: store,
    shellFiles: shell,
    shims: () => harnesses.shims(),
    connected: (agent) => harnesses.connected(agent),
    install: (agent) => harnesses.install(agent),
    projectFolder: (sessionId) => store.project(store.session(sessionId).projectId).cwd,
    mailbox: store,
    projectOf: (sessionId) => store.session(sessionId).projectId,
  })

/** A runner's store, terminals and harness connections, in process, for one test. */
export const createDeck = async (options: DeckOptions): Promise<Deck> => {
  const store = new WorkspaceStore(join(options.data, "workspace.sqlite"))
  const shell = installShellFiles(join(options.data, "shell"))
  await shell
  // Plugin commands run with the sandbox's environment as it is: a login shell's startup
  // files, even the system's own in /etc/profile, could put another PATH before the
  // pinned harnesses.
  const harnesses = createHarnesses(() => shell, {
    env: options.env,
    home: options.env.HOME!,
    login: false,
  })
  const terminals = terminalsFor(options, store, shell, harnesses)
  const project = await store.createProject({ id: randomUUID(), name: "E2E", cwd: options.project })
  const session = store.createSession({ id: randomUUID(), projectId: project.id, name: "E2E" })

  const screen = async (terminalId: string): Promise<string> => {
    const controller = new AbortController()
    const stream = terminals.attach({ terminalId, mode: "observe" }, "reader", controller.signal)
    try {
      for await (const event of stream) {
        if (event.type !== "snapshot") continue
        const { cols, rows } = terminals.get(terminalId)
        return await render(event.data, cols, rows)
      }
      return ""
    } finally {
      controller.abort()
      await stream.return(undefined)
    }
  }

  const terminal = (summary: TerminalSummary): DeckTerminal => {
    const id = summary.id
    // Waits until the screen passes `shows`, and returns it.
    const showing = (shows: (shown: string) => boolean, what: string, timeoutMs = 30_000) =>
      poll(
        async () => {
          const shown = await screen(id)
          return shows(shown) ? shown : undefined
        },
        `${summary.handle} to show ${what}`,
        timeoutMs,
      ).catch(async (error: unknown) => {
        throw new Error(`${(error as Error).message}. Its screen:\n${await screen(id)}`)
      })
    const until = (text: string | RegExp, timeoutMs = 30_000) =>
      showing(
        (shown) => (typeof text === "string" ? shown.includes(text) : text.test(shown)),
        String(text),
        timeoutMs,
      )
    return {
      id,
      handle: summary.handle,
      screen: () => screen(id),
      until,
      submit: async (text) => {
        if (/[\r\n]/.test(text)) throw new Error("A prompt is one line")
        // The text may be on screen already, as an earlier prompt: only one more of it
        // shows that this one landed.
        const before = occurrences(await screen(id), text)
        terminals.write({ terminalId: id, data: text }, owner)
        await showing((shown) => occurrences(shown, text) > before, `${text} once more`)
        terminals.write({ terminalId: id, data: "\r" }, owner)
      },
      press: (keys) => {
        // eslint-disable-next-line no-control-regex -- Enter's escape sequences start with ESC.
        if (/[\r\n]|\x1bOM|\x1b\[13[;u]/.test(keys))
          throw new Error("Enter only follows text: use submit")
        terminals.write({ terminalId: id, data: keys }, owner)
      },
      summary: () => terminals.get(id),
      messages: () => terminals.messages(id),
      delivery: (states, timeoutMs = 30_000) =>
        poll(
          () => {
            const state = terminals.messages(id).delivery
            return states.includes(state) ? state : undefined
          },
          `${summary.handle} to be ${states.join(" or ")} (it is ${terminals.messages(id).delivery})`,
          timeoutMs,
        ),
    }
  }

  return {
    terminals,
    store,
    sessionId: session.id,
    connect: async (agent) => {
      const result = await harnesses.set(agent, true)
      if (!result.connected) throw new Error(`${agent} did not connect`)
    },
    open: async (command) =>
      terminal(
        await terminals.create(
          {
            id: randomUUID(),
            sessionId: session.id,
            cwd: options.project,
            cols: 120,
            rows: 40,
            ...(command !== undefined && { command }),
          },
          owner,
        ),
      ),
    close: async () => {
      try {
        await terminals.shutdown()
      } finally {
        store.close()
      }
    },
  }
}
