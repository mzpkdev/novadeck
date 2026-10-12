import { Link, useParams } from "react-router"

import { atlas, nodeTitle } from "../atlas-data.ts"
import type { Flow } from "../atlas.ts"
import { AnchorLink } from "../components/anchor.tsx"
import { Empty, Mono, Page, Section } from "../components/ui.tsx"
import { flowPath } from "../links.ts"

export const FlowsPage = () => (
  <Page
    title="Flows"
    subtitle="Traced paths through the system, as messages between runtime nodes."
  >
    {atlas.flows.length === 0 ? <Empty>No flows yet.</Empty> : null}
    <ul className="space-y-3">
      {atlas.flows.map((f) => (
        <li key={f.id}>
          <Link to={flowPath(f.id)} className="font-medium">
            {f.title}
          </Link>
          <p className="text-muted">{f.summary}</p>
        </li>
      ))}
    </ul>
  </Page>
)

const COL = 210
const TOP = 56
const ROW = 64
const LEFT = 20
const CHAR = 6.4

const wrap = (text: string, width: number) => {
  const max = Math.max(12, Math.floor(width / CHAR))
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > max) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.length > 3 ? [...lines.slice(0, 2), `${lines[2]}…`] : lines
}

const Sequence = ({ flow }: { flow: Flow }) => {
  const actors = [...new Set([...flow.actors, ...flow.steps.flatMap((s) => [s.from, s.to])])]
  const x = (id: string) => LEFT + COL / 2 + actors.indexOf(id) * COL
  const width = LEFT * 2 + actors.length * COL
  const height = TOP + flow.steps.length * ROW + 20
  return (
    <div className="overflow-auto rounded-sm border border-line bg-panel">
      <svg
        width={width}
        height={height}
        className="block font-sans text-[12px]"
        role="img"
        aria-label={flow.title}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="var(--fg)" />
          </marker>
        </defs>
        {actors.map((id) => (
          <g key={id}>
            <line
              x1={x(id)}
              x2={x(id)}
              y1={36}
              y2={height - 8}
              stroke="var(--line)"
              strokeDasharray="4 4"
            />
            <rect
              x={x(id) - 80}
              y={8}
              width={160}
              height={28}
              fill="var(--raised)"
              stroke="var(--line)"
              rx={2}
            />
            <text x={x(id)} y={26} textAnchor="middle" fill="var(--fg)" fontWeight={600}>
              {nodeTitle(id)}
            </text>
          </g>
        ))}
        {flow.steps.map((step, i) => {
          const y = TOP + i * ROW + 30
          const a = x(step.from)
          const b = x(step.to)
          const self = step.from === step.to
          const label = `${i + 1}. ${step.text}`
          if (self) {
            const lines = wrap(label, COL - 70)
            return (
              <g key={`${step.from}-${step.to}-${step.text}`}>
                <path
                  d={`M${a} ${y - 10}H${a + 36}V${y + 10}H${a + 3}`}
                  fill="none"
                  stroke="var(--fg)"
                  markerEnd="url(#arrow)"
                />
                <text x={a + 44} y={y - 8} fill="var(--fg)">
                  {lines.map((l, j) => (
                    <tspan key={l} x={a + 44} dy={j === 0 ? 0 : 14}>
                      {l}
                    </tspan>
                  ))}
                </text>
              </g>
            )
          }
          const lines = wrap(label, Math.abs(b - a) - 16)
          return (
            <g key={`${step.from}-${step.to}-${step.text}`}>
              <line x1={a} x2={b} y1={y} y2={y} stroke="var(--fg)" markerEnd="url(#arrow)" />
              <text
                x={(a + b) / 2}
                y={y - 6 - (lines.length - 1) * 14}
                textAnchor="middle"
                fill="var(--fg)"
              >
                {lines.map((l, j) => (
                  <tspan key={l} x={(a + b) / 2} dy={j === 0 ? 0 : 14}>
                    {l}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export const FlowPage = () => {
  const { id = "" } = useParams()
  const flow = atlas.flows.find((f) => f.id === id)
  if (!flow) {
    return (
      <Page title="Unknown flow">
        <Link to="/flows">Back to flows</Link>
      </Page>
    )
  }
  return (
    <Page title={flow.title} subtitle={flow.summary}>
      <nav className="flex flex-wrap gap-3 text-[12px]">
        <Link to="/flows">All flows</Link>
        {atlas.flows
          .filter((f) => f.id !== flow.id)
          .map((f) => (
            <Link key={f.id} to={flowPath(f.id)}>
              {f.title}
            </Link>
          ))}
      </nav>
      <Sequence flow={flow} />
      <Section title="Steps" count={flow.steps.length}>
        <ol className="space-y-1">
          {flow.steps.map((s, i) => (
            <li
              key={`${s.from}-${s.to}-${s.text}`}
              className="grid grid-cols-[1.5rem_1fr_auto] gap-2"
            >
              <Mono className="text-muted">{i + 1}</Mono>
              <span>
                <span className="text-muted">
                  {nodeTitle(s.from)} to {nodeTitle(s.to)}:
                </span>{" "}
                {s.text}
              </span>
              <AnchorLink anchor={s.anchor} />
            </li>
          ))}
        </ol>
      </Section>
    </Page>
  )
}
