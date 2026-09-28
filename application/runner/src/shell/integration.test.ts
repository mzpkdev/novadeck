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
  /** Where NovaDeck writes the plugins agents install when connected. */
  plugins: string
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
    const plugins = join(root, "data", "shell", "plugins")
    await use({ home, plugins, store, sessionId: session.id, manager, watch, until })
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

// A stand-in agent in the foreground that sends the hook's reports as given, one after
// another, then waits.
const reporter = (
  home: string,
  reports: { agent: string; sessionId: string; seq: number; source: string }[],
): string => {
  const bin = join(home, "bin")
  mkdirSync(bin, { recursive: true })
  const script = join(bin, "report.cjs")
  writeFileSync(
    script,
    [
      'const net = require("node:net")',
      `const reports = ${JSON.stringify(reports)}`,
      "const { NOVADECK_TERMINAL_ID: terminalId, NOVADECK_REPORT_TOKEN: token } = process.env",
      // Hooks send wall-clock times; the given ones order the reports after that.
      "const base = Date.now()",
      "const send = (index) => {",
      '  if (index === reports.length) { console.log("reports sent"); return process.stdin.resume() }',
      "  const socket = net.connect(process.env.NOVADECK_REPORT)",
      '  socket.on("close", () => send(index + 1))',
      "  const report = { ...reports[index], seq: base + reports[index].seq }",
      '  socket.end(JSON.stringify({ terminalId, token, ...report }) + "\\n")',
      "}",
      "send(0)",
    ].join("\n"),
  )
  writeFileSync(join(bin, "report"), `#!/bin/sh\nexec "${process.execPath}" "${script}"\n`)
  chmodSync(join(bin, "report"), 0o755)
  return bin
}

// A stand-in for Claude Code with NovaDeck's plugin connected: it runs the plugin's
// SessionStart hook through sh with the session on stdin, then waits.
const fakeClaude = (home: string, plugins: string, session: string): string => {
  const hooks = join(plugins, "claude", "novadeck", "hooks", "hooks.json")
  const bin = join(home, "bin")
  mkdirSync(bin, { recursive: true })
  const path = join(bin, "claude")
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      `command=$("${process.execPath}" -e 'console.log(require(process.argv[1]).hooks.SessionStart[0].hooks[0].command)' '${hooks}')`,
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

  it("waits for a prompt hook that runs a program in the foreground", async ({ shell }) => {
    writeFileSync(join(shell.home, ".bashrc"), "PROMPT_COMMAND='/bin/sleep 0.3'\n")
    const manager = shell.manager()
    const terminal = await create(manager, shell, { command: "echo resumed-$((20 + 22))" })
    await shell.until(manager, terminal.id, "resumed-42")
  })

  it("shows the transcript instead of a command a shell without prompts cannot take", async ({
    shell,
  }) => {
    const id = randomUUID()
    const first = shell.manager({ shell: "/bin/sh" })
    await create(first, shell, { id })
    first.write({ terminalId: id, data: "echo before-reboot\r" }, "owner")
    await shell.until(first, id, /before-reboot\r?\n/)
    await first.shutdown()

    const second = shell.manager({ shell: "/bin/sh" })
    await create(second, shell, { id, restore: true, command: "echo resumed" })
    const shown = await shell.until(second, id, "restored transcript")
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    expect(shown).toContain("before-reboot")
    expect(await screen(second, id)).not.toMatch(/resumed\r?\n/)
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

  it("tells which agent session runs, through a connected agent's plugin", async ({ shell }) => {
    const session = randomUUID()
    fakeClaude(shell.home, shell.plugins, session)
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

  it("runs a connected Codex through NovaDeck's shim, even after .bashrc moves PATH", async ({
    shell,
  }) => {
    const bin = join(shell.home, "bin")
    mkdirSync(bin)
    writeFileSync(join(bin, "codex"), '#!/bin/sh\necho "codex args: $*"\n', { mode: 0o755 })
    writeFileSync(join(shell.home, ".bashrc"), 'export PATH="$HOME/bin:$PATH"\n')
    const connected = shell.manager({ shims: () => Promise.resolve(true) })
    const on = await create(connected, shell)
    connected.write({ terminalId: on.id, data: "codex resume abc\r" }, "owner")
    await shell.until(connected, on.id, "codex args: --no-daemon resume abc")

    const disconnected = shell.manager()
    const off = await create(disconnected, shell)
    disconnected.write({ terminalId: off.id, data: "codex resume abc\r" }, "owner")
    await shell.until(disconnected, off.id, /codex args: resume abc\r?\n/)
  })

  it("keeps only the latest report of each agent, by when it was sent", async ({ shell }) => {
    const bin = reporter(shell.home, [
      { agent: "codex", sessionId: "s3", seq: 3, source: "startup" },
      { agent: "codex", sessionId: "s1", seq: 1, source: "clear" },
      { agent: "codex", sessionId: "s2", seq: 2, source: "clear" },
    ])
    const manager = shell.manager({
      env: { HOME: shell.home, PS1: "$ ", PATH: `${bin}:${process.env.PATH}` },
    })
    const terminal = await create(manager, shell)
    manager.write({ terminalId: terminal.id, data: "report\r" }, "owner")
    await shell.until(manager, terminal.id, "reports sent")
    expect(manager.agentSession(terminal.id, "codex")).toBe("s3")
  })

  it("takes a session switch, but not a nested agent's own session", async ({ shell }) => {
    const bin = reporter(shell.home, [
      { agent: "claude", sessionId: "outer", seq: 1, source: "startup" },
      // Run by the agent in the foreground, as from its shell tool.
      { agent: "claude", sessionId: "nested", seq: 2, source: "startup" },
      { agent: "codex", sessionId: "nested-codex", seq: 3, source: "startup" },
      // /clear in the agent in the foreground.
      { agent: "claude", sessionId: "cleared", seq: 4, source: "clear" },
    ])
    const manager = shell.manager({
      env: { HOME: shell.home, PS1: "$ ", PATH: `${bin}:${process.env.PATH}` },
    })
    const terminal = await create(manager, shell)
    manager.write({ terminalId: terminal.id, data: "report\r" }, "owner")
    await shell.until(manager, terminal.id, "reports sent")
    expect(manager.agentSession(terminal.id, "claude")).toBe("cleared")
    expect(manager.agentSession(terminal.id, "codex")).toBeNull()
  })

  // Linux and macOS tell which process group holds a terminal's foreground.
  it.runIf(process.platform === "linux" || process.platform === "darwin")(
    "ignores reports made while the shell holds the foreground",
    async ({ shell }) => {
      // As from a tmux server or an editor started from this terminal, running elsewhere.
      const bin = reporter(shell.home, [
        { agent: "claude", sessionId: "elsewhere", seq: 1, source: "startup" },
      ])
      const manager = shell.manager({
        env: { HOME: shell.home, PS1: "$ ", PATH: `${bin}:${process.env.PATH}` },
      })
      const terminal = await create(manager, shell)
      manager.write(
        { terminalId: terminal.id, data: "(sleep 0.5; report </dev/null) &\r" },
        "owner",
      )
      await shell.until(manager, terminal.id, "reports sent")
      expect(manager.agentSession(terminal.id, "claude")).toBeNull()
    },
  )

  it("never types the command after arrow keys or a paste", async ({ shell }) => {
    writeFileSync(join(shell.home, ".bash_history"), "echo from-history\n")
    writeFileSync(join(shell.home, ".bashrc"), "HISTFILE=~/.bash_history; sleep 0.3\n")
    const manager = shell.manager()
    const terminal = await create(manager, shell, { command: "echo resumed" })
    manager.write({ terminalId: terminal.id, data: "\x1b[A" }, "owner")
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    manager.write({ terminalId: terminal.id, data: "\r" }, "owner")
    const shown = await shell.until(manager, terminal.id, /from-history\r?\n/)
    expect(shown).not.toContain("resumed")
  })

  it("keeps the saved transcript until the resume command is typed or dropped", async ({
    shell,
  }) => {
    const id = randomUUID()
    const first = shell.manager()
    await create(first, shell, { id })
    first.write({ terminalId: id, data: "echo before-reboot\r" }, "owner")
    await shell.until(first, id, /before-reboot[\s\S]*\$ /)
    await first.shutdown()

    writeFileSync(join(shell.home, ".bashrc"), "sleep 1\n")
    const second = shell.manager()
    await create(second, shell, { id, restore: true, command: "echo resumed" })
    // Saved while the command waits: the earlier screen, as a crash now would keep it.
    await new Promise((resolve) => setTimeout(resolve, 300))
    second.persist()
    expect(shell.store.terminal(id)?.transcript).toContain("before-reboot")
    // Typing first drops the command; from then on this shell's own screen is saved.
    second.write({ terminalId: id, data: "echo later-work\r" }, "owner")
    await shell.until(second, id, /later-work\r?\n/)
    second.persist()
    expect(shell.store.terminal(id)?.transcript).toContain("later-work")
  })

  it("does not bring back a transcript turned off while its command waited", async ({ shell }) => {
    const id = randomUUID()
    const first = shell.manager()
    await create(first, shell, { id })
    first.write({ terminalId: id, data: "echo SECRET-OLD\r" }, "owner")
    await shell.until(first, id, /SECRET-OLD[\s\S]*\$ /)
    await first.shutdown()

    writeFileSync(join(shell.home, ".bashrc"), "sleep 1\n")
    const second = shell.manager()
    await create(second, shell, { id, restore: true, command: "echo resumed" })
    second.configure({ transcripts: false })
    second.configure({ transcripts: true })
    second.persist()
    expect(shell.store.terminal(id)?.transcript ?? "").not.toContain("SECRET-OLD")
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
    expect(shell.store.settings()).toMatchObject({ transcripts: false })
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
      prompt: /[A-Za-z]:\\[^\r\n]*>/,
      command: "echo resumed-4^2",
    },
    {
      // PowerShell 7. Windows PowerShell 5.1 takes no Enter through the bundled ConPTY.
      name: "PowerShell",
      shell: "pwsh.exe",
      cd: (path: string) => `Set-Location '${path}'`,
      prompt: /PS .*>/,
      command: "Write-Output ('resumed-' + 42)",
    },
  ]

  for (const { name, shell: program, cd, prompt, command } of shells) {
    it(`${name} reports each prompt's directory through ConPTY`, async ({ shell }) => {
      const directory = join(shell.home, "my dir")
      mkdirSync(directory)
      const manager = shell.manager({ shell: program })
      const next = shell.watch(manager)
      const terminal = await create(manager, shell)
      // Typed once the prompt shows, as a person would.
      await shell.until(manager, terminal.id, prompt)
      await new Promise((resolve) => setTimeout(resolve, 1_000))
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
