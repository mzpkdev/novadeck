import type { AgentUsage, TerminalMetadata } from "./types"

// A window's length as people say it: "5h", "7d", or minutes when neither fits.
const windowName = (minutes: number | null): string => {
  if (minutes === null) return "limit"
  if (minutes % 1440 === 0) return `${minutes / 1440}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`

// Thousands of tokens, the way agents themselves show them: 30k, 1.2M.
const tokens = (count: number): string =>
  count >= 1_000_000
    ? `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : count >= 1000
      ? `${Math.round(count / 1000)}k`
      : String(count)

const usageOf = (terminal: TerminalMetadata): AgentUsage | undefined =>
  terminal.state === "running" ? terminal.agent?.usage : undefined

// The agent's usage at a glance, for its window's header: how full its context is, and
// the most used rate-limit window, e.g. "ctx 15% · 5h 40%". Undefined without any.
export const usageBadge = (terminal: TerminalMetadata): string | undefined => {
  const usage = usageOf(terminal)
  if (!usage) return undefined
  const { context, limits } = usage
  const parts: string[] = []
  if (context)
    parts.push(
      context.capacity
        ? `ctx ${percent(context.occupied / context.capacity)}`
        : `ctx ${tokens(context.occupied)}`,
    )
  const busiest = limits.toSorted((a, b) => b.used - a.used)[0]
  if (busiest) parts.push(`${windowName(busiest.minutes)} ${percent(busiest.used)}`)
  return parts.length > 0 ? parts.join(" · ") : undefined
}

// The agent's usage in full, one line each, for a tooltip: its context, then every
// rate-limit window with when it resets, in the viewer's local time.
export const usageDetail = (
  terminal: TerminalMetadata,
  time: (at: number) => string = (at) =>
    new Date(at).toLocaleString(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
): string | undefined => {
  const usage = usageOf(terminal)
  if (!usage) return undefined
  const lines: string[] = []
  const { context, limits } = usage
  if (context)
    lines.push(
      context.capacity
        ? `Context: ${tokens(context.occupied)} of ${tokens(context.capacity)} tokens`
        : `Context: ${tokens(context.occupied)} tokens`,
    )
  for (const { minutes, used, resetsAt } of limits)
    lines.push(
      `${windowName(minutes)} limit: ${percent(used)} used${resetsAt ? `, resets ${time(resetsAt)}` : ""}`,
    )
  return lines.length > 0 ? lines.join("\n") : undefined
}
