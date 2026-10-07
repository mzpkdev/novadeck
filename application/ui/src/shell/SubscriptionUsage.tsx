import { createElement, useEffect, useState } from "react"

import { resetText, type AgentAccount, type UsageWindow } from "../model/account-usage"
import { programIcon } from "../terminals/processes/profiles"
import { Popover } from "../ui-toolkit/Popover"

const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`

// The agent's own icon, as its terminals' tabs show it.
const agentIcon = (program: string, size: number): React.JSX.Element =>
  createElement(programIcon(program), { size, strokeWidth: 1.5, "aria-hidden": true })

// How much of a window is used, as a bar.
const UsageBar = ({ used }: { used: number }): React.JSX.Element => (
  <span className="usage-bar" aria-hidden>
    <span style={{ width: `${Math.round(Math.min(1, used) * 100)}%` }} />
  </span>
)

// One window of a subscription in its detail: its name, its bar and share, and when it
// resets, where its agent says.
const WindowRow = ({ window, now }: { window: UsageWindow; now: number }): React.JSX.Element => (
  <div className="usage-row">
    <span className="usage-row-name">{window.name}</span>
    <UsageBar used={window.used} />
    <span className="usage-row-share">{percent(window.used)}</span>
    {window.resetsAt !== null && (
      <span className="usage-row-reset">resets {resetText(window.resetsAt, now)}</span>
    )}
  </div>
)

// A subscription in full, each window with when it resets, kept current while open.
const UsageDetail = ({ account }: { account: AgentAccount }): React.JSX.Element => {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="usage-detail">
      <h2 className="usage-agent-name">
        {agentIcon(account.program, 13)}
        {account.name}
      </h2>
      {account.windows.map((window) => (
        <WindowRow key={window.name} window={window} now={now} />
      ))}
    </div>
  )
}

// One agent's subscription as a pill: its icon, its most used window as a bar and share.
// Pressed, it opens that subscription in full, above it.
const SubscriptionPill = ({ account }: { account: AgentAccount }): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  const { busiest } = account
  return (
    <Popover
      label={`${account.name} subscription`}
      open={open}
      onOpenChange={setOpen}
      placement="top-end"
      className="usage-popover"
      trigger={
        <button
          type="button"
          className="footer-usage-pill"
          aria-label={`${account.name} subscription: ${busiest.name} ${percent(busiest.used)} used`}
        >
          {agentIcon(account.program, 12)}
          <UsageBar used={busiest.used} />
          <span aria-hidden>
            {busiest.name} {percent(busiest.used)}
          </span>
        </button>
      }
    >
      <UsageDetail account={account} />
    </Popover>
  )
}

// The account's subscriptions at the footer's end, a pill for each agent's, most used
// first, each opening its own. Nothing shows while no agent reports its limits.
export const SubscriptionUsage = ({
  accounts,
}: {
  accounts: readonly AgentAccount[]
}): React.JSX.Element | null =>
  accounts.length === 0 ? null : (
    <span className="footer-usage" role="group" aria-label="Subscriptions">
      {accounts.map((account) => (
        <SubscriptionPill key={account.program} account={account} />
      ))}
    </span>
  )
