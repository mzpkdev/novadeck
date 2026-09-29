import type { Report } from "../../shell/reports.js"
import type { HarnessEvent } from "../events.js"
import { absolute, callId, sessionId, sessionStart, text } from "../harness.js"

/**
 * Codex's hooks, as normalized facts.
 *
 * SessionStart names the session running in the terminal, unless a Codex started it: that
 * one runs with another thread in CODEX_THREAD_ID. A turn starts with UserPromptSubmit and
 * ends with Stop, or Interrupt when the person pressed Esc, which also answers "no" to a
 * waiting request. PermissionRequest asks about a tool call; its PostToolUse means it was
 * allowed.
 */
export const decode = ({ event, seq, instance, env, payload }: Report): readonly HarnessEvent[] => {
  const id = sessionId(payload.session_id)
  if (!id || (env.codexThread !== undefined && env.codexThread !== id)) return []
  const base = { agent: "codex", sessionId: id, instance, startedAt: seq } as const
  const tool = text(payload.tool_name) ?? ""
  switch (event) {
    case "SessionStart": {
      const cwd = absolute(payload.cwd)
      const evidence = sessionStart(text(payload.source))
      return [{ type: "session-observed", ...base, evidence, ...(cwd !== undefined && { cwd }) }]
    }
    case "UserPromptSubmit":
      return [{ type: "turn-started", ...base }]
    case "Stop":
      // A subagent's stop ends its own work, not the turn.
      return payload.agent_id === undefined
        ? [{ type: "turn-ended", ...base, outcome: "completed" }]
        : []
    case "Interrupt":
      return [{ type: "turn-ended", ...base, outcome: "interrupted" }]
    case "PermissionRequest":
      return [
        {
          type: "attention-requested",
          ...base,
          requestId: callId(tool, payload.tool_input),
          toolName: tool,
          kind: "permission",
        },
      ]
    case "PostToolUse":
      return [
        {
          type: "attention-resolved",
          ...base,
          requestId: callId(tool, payload.tool_input),
          toolName: tool,
          outcome: "allowed",
        },
      ]
    default:
      return []
  }
}
