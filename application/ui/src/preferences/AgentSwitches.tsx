// An agent the person can connect, as its switch shows it.
export type AgentSwitch = {
  readonly agent: "claude" | "codex" | "agy"
  readonly available: boolean
  readonly connected: boolean
  readonly busy: boolean
  readonly error?: string
}

const labels: Record<AgentSwitch["agent"], string> = {
  claude: "Claude Code",
  codex: "Codex",
  agy: "Antigravity",
}

const note = ({ available, connected, busy, error }: AgentSwitch): string => {
  if (busy) return connected ? "Disconnecting…" : "Connecting…"
  if (error) return error
  if (!available) return "Not installed on this computer"
  return connected ? "Connected: sessions resume after a restart" : "Not connected"
}

// One switch per agent: on installs NovaDeck's plugin into it, off removes it. An agent
// that is not installed, or one mid-change, cannot be switched.
export const AgentSwitches = ({
  agents,
  onChange,
}: {
  readonly agents: readonly AgentSwitch[]
  readonly onChange: (agent: AgentSwitch["agent"], connected: boolean) => void
}): React.JSX.Element => (
  <ul className="m-0 list-none p-0" aria-label="Agents">
    {agents.map((item) => {
      const label = labels[item.agent]
      const disabled = !item.available || item.busy
      return (
        <li
          key={item.agent}
          className="flex min-h-[52px] items-center justify-between gap-4 border-b border-line text-[12px] text-ink"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span id={`agent-${item.agent}`}>{label}</span>
            <span
              id={`agent-${item.agent}-note`}
              className={`text-[10px] leading-relaxed ${item.error ? "text-ink" : "text-muted"}`}
              role={item.error ? "alert" : undefined}
            >
              {note(item)}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-labelledby={`agent-${item.agent}`}
            aria-describedby={`agent-${item.agent}-note`}
            aria-checked={item.connected}
            aria-busy={item.busy}
            disabled={disabled}
            onClick={() => onChange(item.agent, !item.connected)}
            className={`relative h-5 w-9 shrink-0 rounded-control border focus-visible:outline-1 focus-visible:outline-line-strong focus-visible:outline-offset-2 ${item.connected ? "border-strong bg-strong" : "border-line bg-soft"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <span
              className={`absolute top-0.5 size-3.5 rounded-control border border-line-strong bg-paper transition-[left] duration-(--motion-feedback) ease-interface ${item.connected ? "left-[18px]" : "left-0.5"}`}
            />
          </button>
        </li>
      )
    })}
  </ul>
)

// What connecting means, shown above the switches.
export const agentsExplanation =
  "Connect an agent to resume its session in the same terminal after a restart. NovaDeck installs a small plugin into the agent, which does nothing outside NovaDeck; switching it off removes the plugin."
