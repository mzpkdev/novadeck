import { readdir } from "node:fs/promises"
import { dirname, join } from "node:path"

import type { Harness } from "../harness.js"
import { at, entry, joined, record, textOf } from "../items.js"

// Context Codex writes into the conversation as the person's message.
const context =
  /^\s*(<(environment_context|user_instructions|recommended_plugins|skill|subagent_notification)>|# AGENTS\.md instructions)/

// How many days after its parent's a subagent's rollout may start: Codex files each
// rollout under the day it starts, and a session can outlast midnight.
const days = 7

// The day folders from `folder` (sessions/YYYY/MM/DD) on, up to `days` of them.
const dayFolders = (folder: string): string[] => {
  const match = /(\d{4})[/\\](\d{2})[/\\](\d{2})$/.exec(folder)
  if (!match) return [folder]
  const sessions = dirname(dirname(dirname(folder)))
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Array.from({ length: days }, (_, offset) => {
    const day = new Date(start + offset * 86_400_000)
    const [year, month, date] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()]
    return join(
      sessions,
      String(year),
      String(month).padStart(2, "0"),
      String(date).padStart(2, "0"),
    )
  })
}

/**
 * Codex's transcripts are its rollouts: the session's, and one per subagent, named for
 * its thread and kept under the day it started, its parent's or a later one. Each response item holds the person's or the
 * agent's text, a tool call or its output; reasoning stays out, as do developer
 * messages and the context Codex adds as the person's.
 */
export const transcripts: NonNullable<Harness["transcripts"]> = {
  locate: async (root, _sessionId, subagent) => {
    if (subagent === null) return root
    const suffix = `-${subagent}.jsonl`
    for (const folder of dayFolders(dirname(root))) {
      // eslint-disable-next-line no-await-in-loop -- The earliest day holding it wins.
      const names = await readdir(folder).catch(() => [])
      const name = names.find((each) => each.startsWith("rollout-") && each.endsWith(suffix))
      if (name) return join(folder, name)
    }
    return undefined
  },
  items: (line) => {
    const fields = record(line)
    if (fields?.type !== "response_item") return []
    const payload = (fields.payload ?? {}) as Record<string, unknown>
    const time = at(fields.timestamp)
    switch (payload.type) {
      case "message": {
        const { role } = payload
        if (role !== "user" && role !== "assistant") return []
        const text = joined(payload.content, ["input_text", "output_text"])
        return text && !context.test(text) ? [entry(role, "text", text, { at: time })] : []
      }
      case "function_call":
      case "custom_tool_call":
        return [
          entry(
            "assistant",
            "tool-call",
            textOf(payload.type === "function_call" ? payload.arguments : payload.input),
            { at: time, tool: payload.name, call: payload.call_id },
          ),
        ]
      case "function_call_output":
      case "custom_tool_call_output": {
        const { output } = payload
        const text = Array.isArray(output) ? joined(output, ["input_text"]) : textOf(output)
        return [entry("tool", "tool-result", text, { at: time, call: payload.call_id })]
      }
      default:
        return []
    }
  },
}
