import { FileText, PanelRightClose, Scaling, Shrink, X } from "lucide-react"
import { lazy, Suspense, useRef, type Ref } from "react"

import type { ViewMode } from "../../model/types"
import { Tooltip } from "../../ui-toolkit/Tooltip"
import { headingsOf, notePattern, notesIn, samplePlans } from "./plan-content"
import type { PlanEditorHandle } from "./plan-editor/PlanEditor"
import {
  closePlan,
  currentMarks,
  edit,
  planActions,
  inPlace,
  toggleChanges,
  usePlan,
  usePresentations,
  type PlanPresentation,
  type PlanState,
} from "./plan-state"

// The editor loads when a plan first opens, so the workspace never pays for it.
const PlanEditor = lazy(() =>
  import("./plan-editor/PlanEditor").then((module) => ({ default: module.PlanEditor })),
)

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`

// The headings in the file, with what the latest revision changed and where notes are.
const PlanOutline = ({
  plan,
  jump,
}: {
  plan: PlanState
  jump: (at: number) => void
}): React.JSX.Element | null => {
  const headings = headingsOf(plan.text)
  if (!headings.length) return null
  const marks = plan.showChanges ? currentMarks(plan) : []
  const notes = [...plan.text.matchAll(notePattern)].map((match) => match.index)
  // Each heading's section runs to the next heading.
  const sections = headings.map((heading, index) => ({
    ...heading,
    end: headings[index + 1]?.at ?? plan.text.length,
  }))
  return (
    <nav className="plan-spine" aria-label="Plan outline">
      <p className="plan-spine-label">Contents</p>
      <ul className="plan-spine-context">
        {sections.map((section) => {
          const count = notes.filter((at) => at >= section.at && at < section.end).length
          const changed = marks.some((mark) => mark.from < section.end && mark.to > section.at)
          return (
            <li key={section.at}>
              <button onClick={() => jump(section.at)} data-changed={changed}>
                <span>{section.text}</span>
                {count > 0 && <em aria-label={plural(count, "note")}>{count}</em>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// The plan itself, wherever it is presented: the file, edited where it's read.
export const PlanReader = ({
  planId,
  view,
  presentation,
  closeRef,
}: {
  planId: string
  view: ViewMode
  presentation: PlanPresentation
  closeRef?: Ref<HTMLButtonElement>
}): React.JSX.Element => {
  const file = samplePlans[planId]!
  const plan = usePlan(planId)
  const expanded = usePresentations()[view] === "overlay"
  const editor = useRef<PlanEditorHandle | null>(null)
  const marks = currentMarks(plan)
  return (
    <section
      className="plan-reader"
      data-presentation={presentation}
      aria-label={`Plan from ${file.agent}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && presentation !== "overlay") {
          event.stopPropagation()
          planActions.update(planId, closePlan)
        }
      }}
    >
      <header className="plan-reader-header">
        <FileText size={14} strokeWidth={1.5} />
        <span className="plan-reader-path" title={file.path}>
          {file.path.split("/").slice(0, -1).join("/")}/
          <strong>{file.path.split("/").at(-1)}</strong>
        </span>
        <span className="plan-status">v{plan.revision + 1}</span>
        {/* Two sizes, like a terminal's: in place, or over the whole workspace. */}
        <Tooltip content={expanded ? "Shrink" : "Expand"}>
          <button
            className="plan-close plan-expand"
            aria-label={expanded ? "Shrink plan" : "Expand plan"}
            aria-pressed={expanded}
            onClick={() => planActions.present(view, expanded ? inPlace(view) : "overlay")}
          >
            {expanded ? (
              <Shrink size={14} strokeWidth={1.5} />
            ) : (
              <Scaling size={14} strokeWidth={1.5} />
            )}
          </button>
        </Tooltip>
        {/* A panel beside the terminal collapses rather than closes, so it doesn't share an
            X with the terminal's own close right above it. */}
        <Tooltip content={presentation === "overlay" ? "Close · Esc" : "Hide plan · Esc"}>
          <button
            ref={closeRef}
            className="plan-close"
            aria-label={presentation === "overlay" ? "Close plan" : "Hide plan"}
            onClick={() => planActions.update(planId, closePlan)}
          >
            {presentation === "overlay" ? (
              <X size={15} />
            ) : (
              <PanelRightClose size={15} strokeWidth={1.5} />
            )}
          </button>
        </Tooltip>
      </header>
      <div className="plan-reader-body" data-outline={headingsOf(plan.text).length > 0}>
        <PlanOutline plan={plan} jump={(at) => editor.current?.jumpTo(at)} />
        <div className="plan-document-scroll" data-changes={plan.showChanges}>
          <div className="plan-meta">
            <span>{plan.revision ? "Updated just now" : "Written 2 min ago"}</span>
            {marks.length > 0 && (
              <button
                className="plan-changes-toggle"
                aria-pressed={plan.showChanges}
                onClick={() => planActions.update(planId, toggleChanges)}
              >
                <i aria-hidden="true" />
                {plural(plan.changes, "change")} since you last read
                <span>{plan.showChanges ? "Hide" : "Show"}</span>
              </button>
            )}
            {plan.resolved > 0 && plan.marked === plan.text && (
              <span>
                {file.agent} resolved {plural(plan.resolved, "note")}
              </span>
            )}
            {/* Without NovaDeck's skill, notes wait for the user to point the agent at them. */}
            {!file.skill && notesIn(plan.text) > 0 && (
              <span className="plan-meta-hint">
                {file.agent} doesn't have NovaDeck's skill. Ask it to re-read the plan.
              </span>
            )}
          </div>
          <Suspense fallback={null}>
            <PlanEditor
              text={plan.text}
              marks={marks}
              onChange={(text) => planActions.update(planId, (state) => edit(state, text))}
              onReady={(handle) => {
                editor.current = handle
              }}
            />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
