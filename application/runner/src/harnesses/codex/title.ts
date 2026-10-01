import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

import type { PromptShown } from "../events.js"
import type { Install } from "../harness.js"

/**
 * The items NovaDeck's shim gives Codex's terminal title, as one `-c` setting: its run
 * state, then the start of its thread's id, as "Ready | 01a0f932-a824-7c30-b713-b59ed...".
 * NovaDeck shows no terminal's own title, so the person never sees it.
 */
export const titleSetting = "tui.terminal_title=['status','thread-id']"

// The run states Codex's `status` item says (`run_state_status_text` in its TUI, 0.159.3).
const states = new Set(["Ready", "Working", "Thinking", "Waiting", "Starting"])

// The start of a thread's id, which it cuts short with an ellipsis.
const threadId = /^([0-9a-f]{8}(?:-[0-9a-f]+)*)(?:\.\.\.|…)?$/

/**
 * Whether Codex's title says its prompt shows: its items, joined by " | ", hold the run
 * state Ready and no other, and the thread's id, at most once. Codex says Ready only once
 * its own prompt is up: never behind its folder-trust, hooks review, sign-in, update or
 * resume picker screens (probed 2026-10-01, 0.159.3); Working during a turn, Ready again
 * after. So any title the person gives it with `status` and `thread-id` among its items
 * tells as well as the shim's.
 */
export const title = (text: string, at: number): PromptShown | undefined => {
  const parts = text.split(" | ")
  const said = parts.filter((part) => states.has(part))
  if (said.length !== 1 || said[0] !== "Ready") return undefined
  const ids = parts.flatMap((part) => threadId.exec(part)?.[1] ?? [])
  if (ids.length > 1) return undefined
  return {
    type: "prompt-shown",
    agent: "codex",
    instance: null,
    startedAt: at,
    ...(ids[0] !== undefined && { sessionPrefix: ids[0] }),
  }
}

/**
 * Whether Codex just started, as a new root thread, the thread whose id starts with
 * `prefix`: it writes and holds a lock for each thread it starts, as at /clear, but not for
 * a /side conversation it forks, whose id its title shows alike (probed 2026-10-01,
 * 0.159.3). The lock may follow the title by a moment, so it is looked for a while; one
 * older than the title, as an earlier thread's, is no new start.
 */
export const startedSession = async (
  where: Install,
  prefix: string,
  since: number,
  waitMs = 2_000,
): Promise<boolean> => {
  const home = where.env.CODEX_HOME || join(where.home, ".codex")
  const locks = join(home, "thread-writer-locks")
  const until = Date.now() + waitMs
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Looked for again until it shows.
    const names = await readdir(locks).catch(() => [] as string[])
    for (const name of names) {
      if (!name.startsWith(prefix) || !name.endsWith(".lock")) continue
      // eslint-disable-next-line no-await-in-loop -- Few locks share a thread's prefix.
      const made = await stat(join(locks, name)).then(
        (file) => file.mtimeMs,
        () => 0,
      )
      // A second of slack for clocks that round.
      if (made >= since - 1_000) return true
    }
    if (Date.now() >= until) return false
    // eslint-disable-next-line no-await-in-loop -- As above.
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
