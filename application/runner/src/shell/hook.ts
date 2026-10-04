import { agentName } from "@novadeck/protocol"

import { harnesses } from "../harnesses/registry.js"
import type { Report } from "./reports.js"

/**
 * An agent hook, as the runner takes it from NovaDeck's relay (see application/relay).
 * A connected agent's NovaDeck plugin runs the hook launcher, which starts the relay; the
 * relay sends what the hook knows, unread: the event its agent reported, the agent's
 * payload as it came, when the hook started, the processes it runs under, and what of
 * its environment tells agents apart. The runner reads it here into a report, which the
 * agent's harness decodes (see `harnesses/<id>/decode.ts`). A Stop or prompt-time hook
 * asks instead, with a deadline: the runner answers what to print, which may deliver
 * agents' messages (see docs/agent-messaging.md). Claude Code's status line runs through
 * the hook in NovaDeck's shells, which then shows the person's own, as the relay finds
 * and runs it beside the report.
 */
export type RelayHook = {
  readonly report: Omit<Report, "terminalId" | "token">
  /** An ask's deadline, in epoch milliseconds; absent for a report. */
  readonly deadline?: number
}

/** How long an ask has from its hook's start, as the relay gives up within five seconds. */
export const askMs = 4_000

/**
 * The margin an ask leaves before its hook's limit, for the hook to print what a lease
 * delivers and acknowledge it.
 */
const printMs = 500

type Fields = { readonly [key: string]: unknown }

const object = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value !== "" && value.length <= max ? value : undefined

/** A copy small enough to keep: text past a path's length cut short, deep or wide values dropped. */
export const prune = (value: unknown, depth: number, limit: number): unknown => {
  if (typeof value === "string") return value.length > limit ? value.slice(0, limit) : value
  if (typeof value !== "object" || value === null) return value
  if (depth > 6) return null
  if (Array.isArray(value)) return value.slice(0, 50).map((each) => prune(each, depth + 1, limit))
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, each]) => [key, prune(each, depth + 1, limit)]),
  )
}

// The most a report may hold once pruned: enough for any decoder, as hooks always sent.
const maxReport = 60_000

/** A process the hook runs under, nearest first, where the platform tells. */
type Ancestor = { readonly pid: number; readonly name: string }

const ancestorsOf = (value: unknown): Ancestor[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, 8)
    .filter(
      (each): each is Ancestor =>
        object(each) &&
        Number.isSafeInteger(each.pid) &&
        (each.pid as number) > 0 &&
        typeof each.name === "string",
    )

/**
 * The agent process that ran the hook: Claude Code names itself; the others are the
 * nearest ancestor with the agent's own name. Unknown where the platform hides it.
 */
const instanceOf = (agent: string, claudePid: string | undefined, ancestors: Ancestor[]) => {
  if (agent === "claude" && claudePid !== undefined) return claudePid
  const found = ancestors.find((each) => each.name === agent)
  return found ? String(found.pid) : null
}

/**
 * Reads a relay's hook, without its sender, which the endpoint checks: undefined for one
 * that isn't a hook of a known agent, or whose payload isn't the JSON object agents send,
 * as the hook then reports nothing.
 */
export const relayHook = (value: Fields): RelayHook | undefined => {
  const agent = agentName.safeParse(value.agent)
  const { seq, payload: sent } = value
  if (!agent.success || typeof seq !== "number" || !Number.isFinite(seq)) return undefined
  if (typeof sent !== "string" || sent.length > 1_000_000) return undefined
  let payload: unknown
  try {
    payload = JSON.parse(sent)
  } catch {
    return undefined
  }
  if (!object(payload)) return undefined
  const env = object(value.env) ? value.env : {}
  const event =
    text(value.event, 64) ??
    (typeof payload.hook_event_name === "string" && payload.hook_event_name.length <= 64
      ? payload.hook_event_name
      : "")
  const claudePid = typeof env.claudePid === "string" ? env.claudePid : undefined
  const instance = instanceOf(agent.data, claudePid, ancestorsOf(value.ancestors))
  const codexThread = text(env.codexThread, 128)
  const report = {
    agent: agent.data,
    event,
    seq,
    instance: instance !== null && /^\d{1,10}$/.test(instance) ? instance : null,
    // Only what tells nested agents apart; nothing else of the environment is kept.
    env: { cursor: env.cursor === true, ...(codexThread !== undefined && { codexThread }) },
    payload: prune(payload, 0, 4096) as Fields,
  }
  const sized =
    JSON.stringify(report).length <= maxReport
      ? report
      : { ...report, payload: prune(payload, 0, 200) as Fields }
  if (JSON.stringify(sized).length > maxReport) return undefined
  // The runner leases messages only with time left before it to print them and
  // acknowledge the lease.
  return event in harnesses[agent.data].messaging.asks
    ? { report: sized, deadline: Math.round(seq) + askMs - printMs }
    : { report: sized }
}
