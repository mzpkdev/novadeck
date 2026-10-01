import { spawn } from "node:child_process"
import { stat } from "node:fs/promises"
import { join } from "node:path"

import type { Install } from "../harness.js"

/** NovaDeck's plugin, as Codex names the plugin a hook comes from. */
const pluginId = "novadeck@novadeck"

/**
 * The hooks without which nothing reaches a Codex session: SessionStart binds it, and the
 * prompt's and Stop's hooks deliver and confirm a ring.
 */
const needed = ["sessionStart", "userPromptSubmit", "stop"] as const

type Hook = {
  readonly pluginId?: unknown
  readonly eventName?: unknown
  readonly trustStatus?: unknown
}

/**
 * Whether the app-server's `hooks/list` result says NovaDeck's hooks run: each one it
 * needs is listed from NovaDeck's plugin, and every such one is `trusted` (not
 * `untrusted`, nor `modified` since the person trusted it).
 */
export const trustedIn = (result: unknown): boolean => {
  const data = (result as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return false
  const hooks = data.flatMap((entry) =>
    Array.isArray((entry as { hooks?: unknown } | null)?.hooks)
      ? ((entry as { hooks: Hook[] }).hooks ?? [])
      : [],
  )
  const ours = hooks.filter((hook) => hook.pluginId === pluginId)
  return needed.every((event) => {
    const listed = ours.filter((hook) => hook.eventName === event)
    return listed.length > 0 && listed.every((hook) => hook.trustStatus === "trusted")
  })
}

/** Asks Codex's app-server which hooks run in `cwd`, as its `hooks/list` reports them. */
const listHooks = (install: Install, cwd: string, timeoutMs: number): Promise<unknown> =>
  new Promise((resolve) => {
    const windows = install.platform === "win32"
    const child = windows
      ? spawn(install.env.COMSPEC || "cmd.exe", ["/d", "/s", "/c", "codex app-server"], {
          env: install.env,
          stdio: ["pipe", "pipe", "ignore"],
          windowsHide: true,
        })
      : spawn("codex", ["app-server"], { env: install.env, stdio: ["pipe", "pipe", "ignore"] })
    let buffered = ""
    const done = (value: unknown) => {
      clearTimeout(timer)
      child.kill()
      resolve(value)
    }
    const timer = setTimeout(() => done(undefined), timeoutMs)
    child.on("error", () => done(undefined))
    child.on("close", () => done(undefined))
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      buffered += chunk
      let end = buffered.indexOf("\n")
      while (end >= 0) {
        const line = buffered.slice(0, end)
        buffered = buffered.slice(end + 1)
        end = buffered.indexOf("\n")
        try {
          const message = JSON.parse(line) as { id?: unknown; result?: unknown }
          if (message.id === 2) return done(message.result)
        } catch {
          // Not JSON: something else it printed.
        }
      }
    })
    child.stdin.on("error", () => {})
    for (const message of [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "novadeck", version: "1" } },
      },
      { jsonrpc: "2.0", method: "initialized" },
      { jsonrpc: "2.0", id: 2, method: "hooks/list", params: { cwds: [cwd] } },
    ])
      child.stdin.write(`${JSON.stringify(message)}\n`)
  })

// Answers kept until Codex's configuration, where trust is recorded, changes.
const known = new Map<string, { readonly changed: number; readonly trusted: boolean }>()

/**
 * Whether NovaDeck's Codex hooks run in `cwd`: Codex runs a plugin's hooks only once the
 * person trusts them, and no hook says when it doesn't, so its app-server is asked. The
 * answer is kept until Codex's `config.toml`, which records trust, changes. Untrusted when
 * Codex can't be asked.
 */
export const hooksTrusted = async (install: Install, cwd: string): Promise<boolean> => {
  const home = install.env.CODEX_HOME || join(install.home, ".codex")
  const changed = await stat(join(home, "config.toml")).then(
    (file) => file.mtimeMs,
    () => 0,
  )
  const key = `${home}\0${cwd}`
  const kept = known.get(key)
  if (kept?.changed === changed) return kept.trusted
  const result = await listHooks(install, cwd, 10_000)
  // Not asked: untrusted for now, and asked again next time.
  if (result === undefined) return false
  const trusted = trustedIn(result)
  known.set(key, { changed, trusted })
  return trusted
}
