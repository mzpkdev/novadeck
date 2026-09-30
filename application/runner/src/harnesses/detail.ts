import type { AgentDetail } from "@novadeck/protocol"

import { subagentRef, summary, type Activity } from "./activity.js"
import type { Binding } from "./bindings.js"
import { ref } from "./harness.js"
import { harnesses } from "./registry.js"
import { telemetrySummary, type Telemetry } from "./telemetry.js"

// More requests than any agent keeps waiting at once.
const maxRequests = 32

/** The reference clients know a session's root agent by. */
export const rootRef = ({ agent, sessionId }: Binding): string => ref("root", agent, sessionId)

/**
 * The agent a terminal runs, in detail: its root and subagents, each request waiting on
 * the person, and what its harness tells. Harnesses do not say which agent started a
 * nested subagent, so a subagent's parent stays unresolved.
 */
export const agentDetail = (
  terminalId: string,
  binding: Binding | null,
  activity: Activity | null,
  telemetry: Telemetry | null,
): AgentDetail => {
  if (!binding)
    return {
      terminalId,
      agent: null,
      sessionId: null,
      activity: null,
      telemetry: null,
      actors: [],
      requests: [],
      coverage: null,
    }
  const root = rootRef(binding)
  return {
    terminalId,
    agent: binding.agent,
    sessionId: binding.sessionId,
    activity: activity && summary(activity),
    telemetry: telemetry && telemetrySummary(telemetry),
    actors: [
      { ref: root, role: "root", parent: null, type: null },
      ...(activity?.subagents ?? []).map(({ id, type }) => ({
        ref: subagentRef(id),
        role: "subagent" as const,
        parent: null,
        type,
      })),
    ],
    requests: (activity?.pending ?? [])
      .slice(0, maxRequests)
      .map(({ requestId, actor, toolName, kind, subject, choices }) => ({
        ref: ref("request", binding.sessionId, requestId),
        actor: actor === null ? root : subagentRef(actor),
        kind,
        tool: toolName.slice(0, 256),
        subject,
        choices: [...choices],
      })),
    coverage: harnesses[binding.agent].coverage,
  }
}
