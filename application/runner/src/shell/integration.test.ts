import { randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { TerminalChange, TerminalSummary } from "@novadeck/protocol"

import { Terminals, type TerminalOptions } from "../terminals/index.js"
import { describe, expect, it as base } from "../test.js"
import { WorkspaceStore } from "../workspaces/store.js"

const bash = "/bin/bash"

type Fixture = {
  home: string
  store: WorkspaceStore
  sessionId: string
  manager: (options?: TerminalOptions) => Terminals
  /** Collects every change the manager reports, and waits for one that matches. */
  watch: (
    manager: Terminals,
  ) => (match: (terminal: TerminalSummary) => boolean) => Promise<TerminalSummary>
  until: (manager: Terminals, terminalId: string, text: string | RegExp) => Promise<string>
}

/** Everything the terminal printed so far, read from its screen. */
const screen = async (terminals: Terminals, terminalId: string) => {
  const controller = new AbortController()
  const stream = terminals.attach({ terminalId, mode: "observe" }, "reader", controller.signal)
  try {
    for await (const event of stream) if (event.type === "snapshot") return event.data
    return ""
  } finally {
    controller.abort()
    await stream.return(undefined)
  }
}

const it = base.extend<{ shell: Fixture }>({
  shell: async ({ resources }, use) => {
    // Long names, as Windows shells report them.
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-integration-")))
    resources.defer(() => rmSync(root, { recursive: true, force: true }))
    const home = join(root, "home")
    mkdirSync(home)
    const store = new WorkspaceStore(join(root, "data", "workspace.sqlite"))
    resources.defer(() => store.close())
    const project = await store.createProject({ id: randomUUID(), name: "P", cwd: home })
    const session = store.createSession({ id: randomUUID(), projectId: project.id, name: "S" })
    const manager = (options: TerminalOptions = {}) => {
      const terminals = new Terminals({
        shell: bash,
        env: { HOME: home, PS1: "$ ", PATH: process.env.PATH },
        integration: { directory: join(root, "data", "shell") },
        records: store,
        launchGapMs: 10,
        ...options,
      })
      resources.defer(() => terminals.shutdown())
      return terminals
    }
    const watch = (terminals: Terminals) => {
      const controller = new AbortController()
      const stream = terminals.watch("watcher", controller.signal)
      resources.defer(async () => {
        controller.abort()
        await stream.return(undefined)
      })
      const seen: TerminalChange[] = []
      return async (match: (terminal: TerminalSummary) => boolean) => {
        const earlier = seen.find((change) => change.type === "changed" && match(change.terminal))
        if (earlier?.type === "changed") return earlier.terminal
        while (true) {
          // eslint-disable-next-line no-await-in-loop -- Changes are read in order.
          const result = await stream.next()
          if (result.done) throw new Error("Watch ended")
          seen.push(result.value)
          if (result.value.type === "changed" && match(result.value.terminal))
            return result.value.terminal
        }
      }
    }
    const until = async (terminals: Terminals, terminalId: string, text: string | RegExp) => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop -- Polls the screen until it shows the text.
        const shown = await screen(terminals, terminalId)
        if (typeof text === "string" ? shown.includes(text) : text.test(shown)) return shown
        // eslint-disable-next-line no-await-in-loop -- As above.
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(
        `Terminal never showed ${String(text)}:\n${await screen(terminals, terminalId)}`,
      )
    }
    await use({ home, store, sessionId: session.id, manager, watch, until })
  },
})

const create = (
  manager: Terminals,
  fixture: Fixture,
  input: { id?: string; cwd?: string; restore?: boolean; command?: string } = {},
) =>
  manager.create(
    {
      id: input.id ?? randomUUID(),
      sessionId: fixture.sessionId,
      cwd: input.cwd ?? fixture.home,
      cols: 100,
      rows: 20,
      ...(input.restore !== undefined && { restore: input.restore }),
      ...(input.command !== undefined && { command: input.command }),
    },
    "owner",
  )

// A stand-in for Claude Code that behaves as it does with NovaDeck's plugin: it runs the
// plugin's SessionStart hook through sh with the session on stdin, then waits.
const fakeClaude = (home: string, session: string): string => {
  const bin = join(home, "bin")
  mkdirSync(bin, { recursive: true })
  const path = join(bin, "claude")
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      '[ "$1" = --plugin-dir ] || { echo "no plugin"; exit 1; }',
      `command=$("${process.execPath}" -e 'console.log(require(process.argv[1]).hooks.SessionStart[0].hooks[0].command)' "$2/hooks/hooks.json")`,
      `printf '{"hook_event_name":"SessionStart","source":"startup","session_id":"${session}","cwd":"%s"}' "$PWD" | sh -c "$command"`,
      'echo "claude is running"',
      "read line",
    ].join("\n"),
  )
  chmodSync(path, 0o755)
  return bin
}

describe.skipIf(process.platform === "win32" || !existsSync(bash))("bash shell integration", () => {
  it("loads the user's own .bashrc and reports each prompt's directory", async ({ shell }) => {
    const directory = join(shell.home, "my dir ż")
    mkdirSync(directory)
    writeFileSync(join(shell.home, ".bashrc"), "FROM_BASHRC=loaded\n")
    const manager = shell.manager()
    const next = shell.watch(manager)
    const terminal = await create(manager, shell)
    manager.write(
      { terminalId: terminal.id, data: `cd '${directory}'; echo $FROM_BASHRC\r` },
      "owner",
    )
    const moved = await next((summary) => summary.cwd === directory)
    expect(moved.id).toBe(terminal.id)
    await shell.until(manager, terminal.id, "loaded")
    expect(shell.store.terminal(terminal.id)?.cwd).toBe(directory)
  })

  it("types a command at the first prompt, after a slow .bashrc finished", async ({ shell }) => {
    // A command typed while .bashrc runs would be read by it instead of the prompt.
    writeFileSync(
      join(shell.home, ".bashrc"),
      'sleep 0.5; read -t 0.5 early; echo "rc read [$early]"\n',
    )
    const manager = shell.manager()
    const terminal = await create(manager, shell, { command: "echo resumed-$((20 + 22))" })
    const shown = await shell.until(manager, terminal.id, "resumed-42")
    expect(shown).toContain("rc read []")
  })

  it("never types the command once someone typed first", async ({ shell }) => {
    writeFileSync(join(shell.home, ".bashrc"), "sleep 0.3\n")
    const manager = shell.manager()
    const terminal = await create(manager, shell, { command: "echo resumed" })
    manager.write({ terminalId: terminal.id, data: "echo mine\r" }, "owner")
    await shell.until(manager, terminal.id, /mine[\s\S]*\$ /)
    manager.write({ terminalId: terminal.id, data: "echo done\r" }, "owner")
    const shown = await shell.until(manager, terminal.id, /done[\s\S]*\$ /)
    expect(shown).not.toContain("resumed")
  })

  it("tells which agent session runs, through the shim, plugin and hook", async ({ shell }) => {
    const session = randomUUID()
    fakeClaude(shell.home, session)
    // As a user's .bashrc often does, it puts its own directory with claude first.
    writeFileSync(join(shell.home, ".bashrc"), 'export PATH="$HOME/bin:$PATH"\n')
    const project = join(shell.home, "project")
    mkdirSync(project)
    const manager = shell.manager()
    const next = shell.watch(manager)
    const terminal = await create(manager, shell)
    // No prompt shows in the directory claude runs in: its report says where it is.
    manager.write({ terminalId: terminal.id, data: "cd project && claude\r" }, "owner")
    const running = await next((summary) => summary.agent === "claude")
    expect(running.cwd).toBe(project)
    expect(await manager.agentSession(terminal.id, "claude")).toBe(session)
    expect(await manager.agentSession(terminal.id, "codex")).toBeNull()
    expect(shell.store.terminal(terminal.id)?.agents.claude?.sessionId).toBe(session)
    // Back at the prompt, the agent no longer holds the foreground; its session stays.
    manager.write({ terminalId: terminal.id, data: "\r" }, "owner")
    await next((summary) => summary.agent === null && summary.id === terminal.id)
    expect(await manager.agentSession(terminal.id, "claude")).toBe(session)
  })

  it("keeps only the latest report of each agent, by when it was sent", async ({ shell }) => {
    const manager = shell.manager()
    const terminal = await create(manager, shell)
    // What the hook would send, read from the shell's own environment.
    manager.write(
      {
        terminalId: terminal.id,
        data: `for n in 3 1 2; do printf '{"terminalId":"%s","token":"%s","agent":"codex","sessionId":"s%s","seq":%s}\\n' "$NOVADECK_TERMINAL_ID" "$NOVADECK_REPORT_TOKEN" $n $n | "${process.execPath}" -e 'const s=require("net").connect(process.env.NOVADECK_REPORT);process.stdin.pipe(s)'; done; echo sent\r`,
      },
      "owner",
    )
    await shell.until(manager, terminal.id, /sent\r?\n/)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await manager.agentSession(terminal.id, "codex")).toBe("s3")
  })

  it("restores a terminal in its last directory, showing its transcript", async ({ shell }) => {
    const directory = join(shell.home, "work")
    mkdirSync(directory)
    const id = randomUUID()
    const first = shell.manager()
    await create(first, shell, { id })
    first.write({ terminalId: id, data: `cd work; echo before-reboot\r` }, "owner")
    await shell.until(first, id, /before-reboot[\s\S]*\$ /)
    await shell.watch(first)((summary) => summary.cwd === directory)
    await first.shutdown()

    const second = shell.manager()
    const restored = await create(second, shell, { id, restore: true })
    expect(restored.cwd).toBe(directory)
    const shown = await shell.until(second, id, /restored transcript[\s\S]*\$ /)
    expect(shown.indexOf("before-reboot")).toBeLessThan(shown.indexOf("restored transcript"))
  })

  it("shows no transcript when a command resumes the terminal instead", async ({ shell }) => {
    const id = randomUUID()
    const first = shell.manager()
    await create(first, shell, { id })
    first.write({ terminalId: id, data: "echo before-reboot\r" }, "owner")
    await shell.until(first, id, /before-reboot[\s\S]*\$ /)
    await first.shutdown()

    const second = shell.manager()
    await create(second, shell, { id, restore: true, command: "echo resumed" })
    const shown = await shell.until(second, id, /resumed\r?\n/)
    expect(shown).not.toContain("before-reboot")
  })

  it("keeps the last saved state when shells print on their way out", async ({ shell }) => {
    const id = randomUUID()
    const manager = shell.manager()
    await create(manager, shell, { id })
    manager.write(
      // The word is split so that the typed command does not show it.
      {
        terminalId: id,
        data: `trap 'printf "\\033[2J\\033[H%s%s" wi ped; exit' HUP; echo important\r`,
      },
      "owner",
    )
    await shell.until(manager, id, /important\r?\n/)
    await manager.shutdown()
    const saved = shell.store.terminal(id)!
    expect(saved.transcript).toContain("important")
    expect(saved.transcript).not.toContain("wiped")
  })

  it("forgets every transcript once transcripts are turned off", async ({ shell }) => {
    const id = randomUUID()
    const manager = shell.manager()
    await create(manager, shell, { id })
    manager.write({ terminalId: id, data: "echo secret\r" }, "owner")
    await shell.until(manager, id, /secret\r?\n/)
    manager.persist()
    expect(shell.store.terminal(id)?.transcript).toContain("secret")
    manager.configure({ transcripts: false })
    expect(shell.store.terminal(id)?.transcript).toBeNull()
    manager.persist()
    expect(shell.store.terminal(id)?.transcript).toBeNull()
    expect(shell.store.settings()).toEqual({ transcripts: false })
  })

  it("forgets a closed terminal, even one from an earlier runner", async ({ shell }) => {
    const id = randomUUID()
    const first = shell.manager()
    await create(first, shell, { id })
    await first.shutdown()
    expect(shell.store.terminal(id)).toBeDefined()
    const second = shell.manager()
    await expect(second.close({ terminalId: id }, "owner")).rejects.toMatchObject({
      code: "TERMINAL_NOT_FOUND",
    })
    expect(shell.store.terminal(id)).toBeUndefined()
  })
})

// macOS's default shell, where it is installed.
const zsh = "/bin/zsh"

describe.skipIf(process.platform === "win32" || !existsSync(zsh))("zsh shell integration", () => {
  it("loads the user's own .zshrc and reports each prompt's directory", async ({ shell }) => {
    const directory = join(shell.home, "my dir ż")
    mkdirSync(directory)
    writeFileSync(join(shell.home, ".zshrc"), "FROM_ZSHRC=loaded\n")
    const manager = shell.manager({ shell: zsh })
    const next = shell.watch(manager)
    const terminal = await create(manager, shell)
    manager.write(
      { terminalId: terminal.id, data: `cd '${directory}'; echo $FROM_ZSHRC $ZDOTDIR\r` },
      "owner",
    )
    await next((summary) => summary.cwd === directory)
    // ZDOTDIR is the user's again once their .zshrc has loaded.
    await shell.until(manager, terminal.id, `loaded ${shell.home}`)
  })

  it("types a command at the first prompt, after a slow .zshrc finished", async ({ shell }) => {
    writeFileSync(
      join(shell.home, ".zshrc"),
      'sleep 0.5; read -t 0.5 early; echo "rc read [$early]"\n',
    )
    const manager = shell.manager({ shell: zsh })
    const terminal = await create(manager, shell, { command: "echo resumed-$((20 + 22))" })
    const shown = await shell.until(manager, terminal.id, "resumed-42")
    expect(shown).toContain("rc read []")
  })
})

describe.runIf(process.platform === "win32")("Windows shell integration", () => {
  // Each command prints resumed-42 without the typed line showing it.
  const shells = [
    {
      name: "cmd",
      shell: process.env.COMSPEC ?? "cmd.exe",
      cd: (path: string) => `cd /d "${path}"`,
      command: "echo resumed-4^2",
    },
    {
      name: "PowerShell",
      shell: "powershell.exe",
      cd: (path: string) => `Set-Location '${path}'`,
      command: "Write-Output ('resumed-' + 42)",
    },
  ]

  for (const { name, shell: program, cd, command } of shells) {
    it(`${name} reports each prompt's directory through ConPTY`, async ({ shell }) => {
      const directory = join(shell.home, "my dir")
      mkdirSync(directory)
      const manager = shell.manager({ shell: program })
      const next = shell.watch(manager)
      const terminal = await create(manager, shell)
      manager.write({ terminalId: terminal.id, data: `${cd(directory)}\r` }, "owner")
      await next((summary) => summary.cwd.toLowerCase() === directory.toLowerCase())
    })

    it(`${name} gets a command typed and submitted at its first prompt`, async ({ shell }) => {
      const manager = shell.manager({ shell: program })
      const terminal = await create(manager, shell, { command })
      await shell.until(manager, terminal.id, "resumed-42")
    })
  }
})
