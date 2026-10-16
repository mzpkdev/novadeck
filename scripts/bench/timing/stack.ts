import { type ChildProcess, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { delimiter, join } from "node:path"

import { createSandbox, type Sandbox } from "@novadeck/sandbox"
import { reap } from "@novadeck/sandbox/reap"
import { tripwire } from "@novadeck/sandbox/tripwire"

// What the timing run runs against: the UI's production build, served by `vite preview`, over
// a real runner inside the sandbox, as the dev-web path wires them, with the fake agent as
// the only `claude` on the sandbox's PATH. The runner and every shell it starts get the
// sandbox's environment alone, so the Novadeck `claude` shim, which runs the next `claude`
// on PATH, can only ever reach the fake.

const root = join(import.meta.dirname, "..", "..", "..")
const ui = join(root, "application", "ui")

// The agent CLIs a folder on the sandbox's PATH may not hold, besides the fake's own.
const agents = ["claude", "codex", "agy"]

/** A free port on loopback, as the system hands one out. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      )
    })
  })

/** Waits until `url` answers at all, or fails once `ms` have passed or `child` has exited. */
const ready = async (url: string, child: ChildProcess, ms: number): Promise<void> => {
  const deadline = Date.now() + ms
  for (;;) {
    if (child.exitCode !== null)
      throw new Error(`${url}: its process exited with ${child.exitCode}`)
    // eslint-disable-next-line no-await-in-loop -- Asks again until it answers.
    const answered = await fetch(url).then(
      () => true,
      () => false,
    )
    if (answered) return
    if (Date.now() > deadline) throw new Error(`${url} didn't answer in ${ms / 1000} s`)
    // eslint-disable-next-line no-await-in-loop -- As above.
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/** Runs a program to its end, its output passed through; rejects should it fail. */
const run = (
  file: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(file, [...args], { ...options, stdio: ["ignore", "inherit", "inherit"] })
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`)),
    )
  })

/** The sandbox the runner runs in, with the fake agent first on its PATH as `claude`. */
const sandboxed = (): { readonly sandbox: Sandbox; readonly control: string } => {
  const base = createSandbox({ prefix: "novadeck-timing-", bins: [], user: "novadeck" })
  const bin = join(base.root, "bin")
  mkdirSync(bin, { mode: 0o700 })
  const claude = join(bin, "claude")
  writeFileSync(
    claude,
    `#!/bin/sh\nexec node ${JSON.stringify(join(import.meta.dirname, "agent.ts"))} "$@"\n`,
  )
  chmodSync(claude, 0o755)
  const path = [bin, base.env.PATH].join(delimiter)
  const strays = path
    .split(delimiter)
    .slice(1)
    .flatMap((folder) => agents.map((agent) => join(folder, agent)))
    .filter((file) => existsSync(file))
  if (strays.length > 0)
    throw new Error(`the sandbox's PATH holds a real agent CLI: ${strays.join(", ")}`)
  // The runner counts Claude Code connected once Novadeck's plugin is on in its settings.
  mkdirSync(join(base.home, ".claude"), { recursive: true })
  writeFileSync(
    join(base.home, ".claude", "settings.json"),
    JSON.stringify({ enabledPlugins: { "novadeck@novadeck": true } }),
  )
  const control = join(base.root, "control")
  mkdirSync(control)
  return { sandbox: { ...base, env: { ...base.env, PATH: path } }, control }
}

export type Stack = {
  /** The UI's address. */
  readonly url: string
  /** Turns agent `seed` busy or idle (see agent.ts). */
  readonly busy: (seed: number, on: boolean) => void
  /** The shell command that starts agent `seed`. */
  readonly agent: (seed: number) => string
  /**
   * Stops it all and removes the sandbox. Returns what went wrong inside it: processes it
   * had to end, and the developer's home written to from inside the sandbox.
   */
  readonly stop: () => Promise<readonly string[]>
}

/** Builds the UI and starts the runner in a fresh sandbox and the UI's preview over it. */
export const startStack = async (): Promise<Stack> => {
  const { sandbox, control } = sandboxed()
  const changed = tripwire(sandbox, [
    {
      searched: [".claude.json", join(".claude", "settings.json")],
      listed: [join(".claude", "projects")],
      stamped: [join(".local", "share", "novadeck")],
    },
  ])
  const children: ChildProcess[] = []
  const stop = async (): Promise<readonly string[]> => {
    for (const child of children.toReversed()) child.kill("SIGTERM")
    await Promise.all(
      children.map(
        (child) =>
          child.exitCode === null &&
          new Promise((resolve) => {
            child.once("exit", resolve)
            setTimeout(resolve, 10_000)
          }),
      ),
    )
    const leftovers = await reap(sandbox).catch((error: unknown) => [
      `reaping failed: ${String(error)}`,
    ])
    const written = changed()
    rmSync(sandbox.root, { recursive: true, force: true, maxRetries: 5 })
    return [
      ...leftovers.map((one) => `a process outlived the run in the sandbox: ${one}`),
      ...written.map((path) => `the developer's home changed: ${path}`),
    ]
  }
  try {
    const [runnerPort, uiPort] = [await freePort(), await freePort()]
    const token = randomBytes(32).toString("hex")
    const origin = `http://127.0.0.1:${uiPort}`
    const dist = join(sandbox.root, "ui")
    // The runner's address and token are baked into the build, as the dev-web path does.
    await run(
      process.execPath,
      [
        join(ui, "node_modules", "vite", "bin", "vite.js"),
        "build",
        "--outDir",
        dist,
        "--emptyOutDir",
      ],
      {
        cwd: ui,
        env: {
          ...process.env,
          VITE_NOVADECK_RUNNER_URL: `ws://127.0.0.1:${runnerPort}/api/rpc`,
          VITE_NOVADECK_RUNNER_TOKEN: token,
        },
      },
    )
    const runner = spawn(
      process.execPath,
      [join(root, "application", "runner", "dist", "cli.js")],
      {
        cwd: sandbox.root,
        env: {
          ...sandbox.env,
          NOVADECK_TOKEN: token,
          HOST: "127.0.0.1",
          PORT: String(runnerPort),
          NOVADECK_DATABASE: join(sandbox.root, "data", "workspace.sqlite"),
          CORS_ORIGINS: origin,
        },
        stdio: ["ignore", "inherit", "inherit"],
      },
    )
    children.push(runner)
    await ready(`http://127.0.0.1:${runnerPort}/`, runner, 60_000)
    const preview = spawn(
      process.execPath,
      [
        join(ui, "node_modules", "vite", "bin", "vite.js"),
        "preview",
        "--outDir",
        dist,
        "--host",
        "127.0.0.1",
        "--port",
        String(uiPort),
        "--strictPort",
      ],
      { cwd: ui, env: process.env, stdio: ["ignore", "ignore", "inherit"] },
    )
    children.push(preview)
    await ready(origin, preview, 60_000)
    return {
      url: `${origin}/`,
      busy: (seed, on) => writeFileSync(join(control, String(seed)), on ? "on" : "off"),
      agent: (seed) =>
        `TIMING_AGENT_CONTROL=${join(control, String(seed))} TIMING_AGENT_SEED=${seed} claude`,
      stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
