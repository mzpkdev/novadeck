import type { AgentUsage, TerminalMetadata } from "./types"

type Limit = AgentUsage["limits"][number]

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

// Whether a window has reset since the agent last said how much of it was used: its
// reading no longer holds until the agent reports again.
const lapsed = ({ resetsAt }: Limit, now: number): boolean => resetsAt !== null && resetsAt <= now

const usageOf = (terminal: TerminalMetadata): AgentUsage | undefined =>
  terminal.state === "running" ? terminal.agent?.usage : undefined

// What its taskbar says of the agent at its right end: the model it runs and its effort,
// where its harness says, and how full its context is, as a share where its capacity is
// known, with the tokens in words for a tooltip. Undefined without any.
export type AgentStats = {
  readonly model: string | null
  readonly effort: string | null
  readonly context: {
    readonly share: number | null
    readonly label: string
    readonly detail: string
  } | null
}

export const agentStats = (terminal: TerminalMetadata): AgentStats | undefined => {
  const usage = usageOf(terminal)
  if (!usage) return undefined
  const { model, effort, context } = usage
  if (!model && !effort && !context) return undefined
  return {
    model,
    effort,
    context: context && {
      share: context.capacity ? Math.min(1, context.occupied / context.capacity) : null,
      label: context.capacity
        ? percent(context.occupied / context.capacity)
        : tokens(context.occupied),
      detail: context.capacity
        ? `Context ${percent(context.occupied / context.capacity)} full · ${tokens(context.occupied)} of ${tokens(context.capacity)} tokens`
        : `Context: ${tokens(context.occupied)} tokens`,
    },
  }
}

// When a window resets, in the viewer's local time: the time alone within a day, the
// date and time further off.
const resetTime = (at: number, now: number): string =>
  new Date(at).toLocaleString(
    undefined,
    at - now < 86_400_000
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
  )

// The agent's usage in full, one line each, for a tooltip: its context, then every
// rate-limit window with when it resets, or that it has reset since the agent last said.
export const usageDetail = (
  terminal: TerminalMetadata,
  now = Date.now(),
  time: (at: number, now: number) => string = resetTime,
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
  for (const limit of limits) {
    const name = `${windowName(limit.minutes)} limit`
    if (lapsed(limit, now)) lines.push(`${name}: reset since`)
    else
      lines.push(
        `${name}: ${percent(limit.used)} used${limit.resetsAt ? `, resets ${time(limit.resetsAt, now)}` : ""}`,
      )
  }
  return lines.length > 0 ? lines.join("\n") : undefined
}

// When the soonest rate-limit window still to reset does, so a view can show it reset
// though the agent reports nothing new; undefined without one.
export const nextReset = (terminal: TerminalMetadata, now = Date.now()): number | undefined => {
  const times = (usageOf(terminal)?.limits ?? [])
    .map(({ resetsAt }) => resetsAt)
    .filter((at): at is number => at !== null && at > now)
  return times.length > 0 ? Math.min(...times) : undefined
}
