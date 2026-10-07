import type { AgentStats as Stats } from "../../model/agent-usage"
import { Tooltip } from "../../ui-toolkit/Tooltip"

const radius = 5.5
const circumference = 2 * Math.PI * radius

// How full a context is, as a ring that fills clockwise from the top.
const ContextRing = ({ share }: { share: number }): React.JSX.Element => (
  <svg className="plan-tb-ring" viewBox="0 0 14 14" aria-hidden>
    <circle className="plan-tb-ring-track" cx="7" cy="7" r={radius} />
    <circle
      className="plan-tb-ring-fill"
      cx="7"
      cy="7"
      r={radius}
      strokeDasharray={`${(circumference * share).toFixed(2)} ${circumference.toFixed(2)}`}
    />
  </svg>
)

// What the agent runs on, at the right end of its taskbar: its model and effort, then a
// ring for how full its context is, its share and tokens in words on hover. Where its
// harness doesn't say the context's capacity there's no share to draw, so the tokens it
// holds show instead. A narrow window keeps only the ring (taskbar.css).
export const AgentStats = ({ stats }: { stats: Stats }): React.JSX.Element => {
  const { model, effort, context } = stats
  const runsOn = [model, effort].filter(Boolean).join(" · ")
  return (
    <span className="plan-tb-stats">
      {runsOn && <span className="plan-tb-model">{runsOn}</span>}
      {context && (
        <Tooltip content={context.detail}>
          <span className="plan-tb-context" role="img" aria-label={context.detail}>
            {context.share !== null ? (
              <ContextRing share={context.share} />
            ) : (
              <span aria-hidden>{context.label}</span>
            )}
          </span>
        </Tooltip>
      )}
    </span>
  )
}
