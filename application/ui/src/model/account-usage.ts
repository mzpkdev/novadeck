import { windowName } from "./agent-usage"
import type { TerminalMetadata } from "./types"

// The agents whose subscriptions Novadeck hears of, by program name, as people call them.
const agentNames: Readonly<Record<string, string>> = {
  claude: "Claude Code",
  codex: "Codex",
  agy: "Antigravity",
}

// One of a subscription's limit windows: its length as people say it ("5h", "7d"), how
// much of it is used, as a fraction, and when it resets, where its agent says.
export type UsageWindow = {
  readonly name: string
  readonly minutes: number | null
  readonly used: number
  readonly resetsAt: number | null
}

// What one agent's subscription has left. Its kind says how it's limited: by windows of
// time, each used up to a share and reset, as every agent that reports limits does now.
// One paid by credits, with a balance and no windows, would be another kind. A windowed
// one has its windows, shortest first, and the one most used, which says it at a glance.
export type AgentAccount = {
  readonly kind: "windows"
  readonly program: string
  readonly name: string
  readonly windows: readonly UsageWindow[]
  readonly busiest: UsageWindow
}

// Each agent's subscription, as its running terminals report it, most used first. A
// subscription is the account's, so every terminal of an agent reports the same windows;
// of two readings of a window the one resetting later is the newer, and of two resetting
// together the one used more. A window whose reset has passed says nothing until its
// agent reports again. Terminals that report no limits, as an API-key account's don't,
// leave their agent out.
export const accountUsage = (
  terminals: readonly TerminalMetadata[],
  now = Date.now(),
): readonly AgentAccount[] => {
  const byAgent = new Map<string, Map<string, UsageWindow>>()
  for (const terminal of terminals) {
    if (terminal.state !== "running" || !agentNames[terminal.process]) continue
    for (const limit of terminal.agent?.usage?.limits ?? []) {
      if (limit.resetsAt !== null && limit.resetsAt <= now) continue
      const name = windowName(limit.minutes)
      const windows = byAgent.get(terminal.process) ?? new Map<string, UsageWindow>()
      byAgent.set(terminal.process, windows)
      const known = windows.get(name)
      const later = (limit.resetsAt ?? 0) - (known?.resetsAt ?? 0)
      if (!known || later > 0 || (later === 0 && limit.used > known.used))
        windows.set(name, {
          name,
          minutes: limit.minutes,
          used: limit.used,
          resetsAt: limit.resetsAt,
        })
    }
  }
  return [...byAgent]
    .map(([program, windows]): AgentAccount => {
      const sorted = [...windows.values()].toSorted(
        (a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity),
      )
      return {
        kind: "windows",
        program,
        name: agentNames[program]!,
        windows: sorted,
        busiest: sorted.toSorted((a, b) => b.used - a.used)[0]!,
      }
    })
    .toSorted((a, b) => b.busiest.used - a.busiest.used)
}

// When the soonest window still to reset does, so a view can drop it then; undefined
// without one.
export const nextAccountReset = (accounts: readonly AgentAccount[]): number | undefined => {
  const times = accounts.flatMap((account) =>
    account.windows.flatMap((window) => (window.resetsAt === null ? [] : [window.resetsAt])),
  )
  return times.length > 0 ? Math.min(...times) : undefined
}

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })

// When a window resets, as people say it: how long from now with the time, within a day,
// "in 2h 14m · 16:30"; the weekday and time further off, "Thu 09:00".
export const resetText = (at: number, now = Date.now()): string => {
  const minutes = Math.max(0, Math.ceil((at - now) / 60_000))
  if (minutes >= 24 * 60)
    return `${new Date(at).toLocaleDateString(undefined, { weekday: "short" })} ${clock(at)}`
  const hours = Math.floor(minutes / 60)
  const left = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
  return `in ${left} · ${clock(at)}`
}
