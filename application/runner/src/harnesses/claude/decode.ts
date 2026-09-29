import type { Report } from "../../shell/reports.js"
import type { HarnessEvent } from "../events.js"
import { absolute, callId, sessionId, sessionStart, text } from "../harness.js"

/**
 * Claude Code's hooks, as normalized facts.
 *
 * SessionStart names the session running in the terminal, unless it is not the
 * terminal's own: a subagent's (it carries `agent_id`), or Claude Code running inside
 * Cursor. A turn starts with UserPromptSubmit and ends with Stop, or StopFailure on an
 * API error. PermissionRequest asks the person about a tool call, AskUserQuestion's as a
 * question; the call's PostToolUse or PostToolUseFailure means it was allowed. A denial or
 * an Esc fires nothing: the next turn settles them.
 */
export const decode = ({ event, seq, instance, env, payload }: Report): readonly HarnessEvent[] => {
  const id = sessionId(payload.session_id)
  if (!id || payload.cursor_version !== undefined || env.cursor) return []
  const base = { agent: "claude", sessionId: id, instance, startedAt: seq } as const
  const tool = text(payload.tool_name) ?? ""
  const subagent = payload.agent_id !== undefined
  switch (event) {
    case "SessionStart": {
      if (subagent) return []
      const cwd = absolute(payload.cwd)
      const evidence = sessionStart(text(payload.source))
      return [{ type: "session-observed", ...base, evidence, ...(cwd !== undefined && { cwd }) }]
    }
    case "UserPromptSubmit":
      return [{ type: "turn-started", ...base }]
    case "Stop":
      // A subagent's stop ends its own work, not the turn.
      return subagent ? [] : [{ type: "turn-ended", ...base, outcome: "completed" }]
    case "StopFailure":
      return [{ type: "turn-ended", ...base, outcome: "failed" }]
    case "PermissionRequest":
      return [
        {
          type: "attention-requested",
          ...base,
          requestId: callId(tool, payload.tool_input),
          toolName: tool,
          kind: tool === "AskUserQuestion" ? "question" : "permission",
        },
      ]
    case "PostToolUse":
    case "PostToolUseFailure":
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
