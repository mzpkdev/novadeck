import { readdir } from "node:fs/promises"
import { dirname, join } from "node:path"

import type { Harness } from "../harness.js"
import { at, entry, joined, record, textOf } from "../items.js"

// Context Codex writes into the conversation as the person's message.
const context = /^\s*<(environment_context|user_instructions)>/

/**
 * Codex's transcripts are its rollouts: the session's, and one per subagent, named for
 * its thread and kept beside its parent's. Each response item holds the person's or the
 * agent's text, a tool call or its output; reasoning stays out, as do developer
 * messages and the context Codex adds as the person's.
 */
export const transcripts: NonNullable<Harness["transcripts"]> = {
  locate: async (root, _sessionId, subagent) => {
    if (subagent === null) return root
    const suffix = `-${subagent}.jsonl`
    const names = await readdir(dirname(root)).catch(() => [])
    const name = names.find((each) => each.startsWith("rollout-") && each.endsWith(suffix))
    return name && join(dirname(root), name)
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
