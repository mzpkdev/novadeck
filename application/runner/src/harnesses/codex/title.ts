import type { PromptShown } from "../events.js"

/**
 * The items NovaDeck's shim gives Codex's terminal title, as one `-c` setting: its run
 * state, then the start of its thread's id, as "Ready | 01a0f932-a824-7c30-b713-b59ed...".
 * NovaDeck shows no terminal's own title, so the person never sees it.
 */
export const titleSetting = "tui.terminal_title=['status','thread-id']"

// Its state alone, as it first sets it, or with the start of its thread's id, which it
// cuts short with an ellipsis.
const ready = /^Ready(?: \| ([0-9a-f]{8}(?:-[0-9a-f]+)*)(?:\.\.\.|…)?)?$/

/**
 * Whether Codex's title says its prompt shows. Codex sets it to Ready only once its own
 * prompt is up: never behind its folder-trust, hooks review, login, update or resume
 * picker screens (probed 2026-10-01, 0.159.3). It is Working during a turn, and Ready
 * again after; the thread's id tells a new thread, as after /clear, from the bound one.
 */
export const title = (text: string, at: number): PromptShown | undefined => {
  const match = ready.exec(text)
  if (!match) return undefined
  const prefix = match[1]
  return {
    type: "prompt-shown",
    agent: "codex",
    instance: null,
    startedAt: at,
    ...(prefix !== undefined && { sessionPrefix: prefix }),
  }
}
