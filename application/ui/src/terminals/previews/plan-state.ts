import { useSyncExternalStore } from "react"

import { planTerminal } from "../../model/plan-agent"
import { createStore } from "../../model/store"
import type { ViewMode } from "../../model/types"
import { notesIn, samplePlans, toMarkdown, type PlanFile } from "./plan-content"

// Where a plan opens: beside the terminal inside its window, over the workspace, or
// hanging off a canvas node.
export type PlanPresentation = "split" | "overlay" | "attached"

// Simulation only: what the sample agent is doing, which drives its revisions. NovaDeck
// can't read this from a real agent's interface, so nothing shows it.
export type AgentPhase = "planning" | "revising" | "working"

// A stretch of the text the agent's latest revision wrote.
export type Mark = { readonly from: number; readonly to: number }

export type PlanState = {
  readonly open: boolean
  readonly phase: AgentPhase
  readonly revision: number
  readonly seen: number
  // The file: the agent writes it, the user edits it, notes live in it.
  readonly text: string
  // What the latest revision wrote, valid for `marked` (the text it produced).
  readonly marks: readonly Mark[]
  readonly marked: string
  readonly changes: number
  readonly showChanges: boolean
  // Notes the agent removed in the latest revision, having applied them.
  readonly resolved: number
}

export type PlanStore = {
  readonly plans: Readonly<Record<string, PlanState>>
  readonly presentations: Readonly<Record<ViewMode, PlanPresentation>>
}

const initialState = (file: PlanFile): PlanState => ({
  open: false,
  phase: "planning",
  revision: 0,
  seen: -1,
  text: toMarkdown(file.revisions[0]!),
  marks: [],
  marked: "",
  changes: 0,
  showChanges: false,
  resolved: 0,
})

export const initialStore: PlanStore = {
  plans: Object.fromEntries(
    Object.values(samplePlans).map((file) => [file.id, initialState(file)]),
  ),
  presentations: { focus: "split", grid: "overlay", canvas: "attached" },
}

// A plan's size when it isn't expanded over the workspace: beside the terminal, or on
// the canvas, attached to the terminal's node.
export const inPlace = (view: ViewMode): PlanPresentation =>
  view === "canvas" ? "attached" : "split"

// The latest revision's marks, while the text is still the one they describe.
export const currentMarks = (plan: PlanState): readonly Mark[] =>
  plan.marked === plan.text ? plan.marks : []

export const openPlan = (plan: PlanState): PlanState => ({
  ...plan,
  open: true,
  seen: plan.revision,
})

export const closePlan = (plan: PlanState): PlanState => ({ ...plan, open: false })

export const toggleChanges = (plan: PlanState): PlanState => ({
  ...plan,
  showChanges: !plan.showChanges,
})

export const edit = (plan: PlanState, text: string): PlanState =>
  text === plan.text ? plan : { ...plan, text }

// The agent's prompt was answered in the terminal: yes approves, anything else asks it
// to keep planning.
export const answer = (plan: PlanState, input: string): PlanState => {
  if (plan.phase !== "planning") return plan
  return /^(y|yes)$/i.test(input.trim())
    ? { ...plan, phase: "working", showChanges: false }
    : { ...plan, phase: "revising" }
}

// Asking the agent in its terminal to re-read the plan, as without the skill.
export const asksToReread = (input: string): boolean => /re-?read/i.test(input)

// The sample plans, driven by simulated agent timing.
const store = createStore(initialStore)

const updatePlan = (id: string, change: (plan: PlanState) => PlanState): void => {
  store.update((current) => {
    const plan = current.plans[id]
    if (!plan) return current
    const next = change(plan)
    return next === plan ? current : { ...current, plans: { ...current.plans, [id]: next } }
  })
}

// The agent writes its next revision over the file as it now is. When it read the notes
// first (the skill makes sure of it, or the user asked) it applied and removed them. The
// merge code loads only when an agent writes, like the editor it shares.
const revise = (file: PlanFile, reread: boolean): void => {
  void import("./plan-editor/sync").then(({ merge, resolveNotes }) =>
    updatePlan(file.id, (plan) => {
      const revision = Math.min(plan.revision + 1, file.revisions.length - 1)
      const phase = plan.phase === "revising" ? "planning" : plan.phase
      const written =
        revision === plan.revision
          ? { text: plan.text, marks: [], changes: 0 }
          : merge(
              toMarkdown(file.revisions[plan.revision]!),
              plan.text,
              toMarkdown(file.revisions[revision]!),
            )
      const result = reread
        ? resolveNotes(written.text, written.marks)
        : { ...written, resolved: 0 }
      if (revision === plan.revision && !result.resolved) return { ...plan, phase }
      return {
        ...plan,
        phase,
        revision,
        seen: plan.open ? revision : plan.seen,
        text: result.text,
        marks: result.marks,
        marked: result.text,
        changes: written.changes,
        showChanges: true,
        resolved: result.resolved,
      }
    }),
  )
}

const later = (delay: number, run: () => void): void => {
  window.setTimeout(run, delay)
}

// Follow each answer the agent's prompt receives in the terminal.
planTerminal.subscribe(() => {
  const event = planTerminal.getSnapshot()
  const file = event && samplePlans[event.plan]
  const before = file && store.getSnapshot().plans[file.id]
  if (!file || !before) return
  if (!file.skill && notesIn(before.text) && asksToReread(event.input)) {
    later(1200, () => revise(file, true))
    return
  }
  updatePlan(file.id, (plan) => answer(plan, event.input))
  const phase = store.getSnapshot().plans[file.id]?.phase
  if (before.phase !== "planning") return
  if (phase === "revising") later(1800, () => revise(file, file.skill))
  // With the skill the agent re-reads the plan before starting, and applies any notes.
  if (phase === "working" && file.skill && notesIn(before.text))
    later(1200, () => revise(file, true))
})

export const planActions = {
  update: updatePlan,
  present: (view: ViewMode, presentation: PlanPresentation): void => {
    store.update((current) => ({
      ...current,
      presentations: { ...current.presentations, [view]: presentation },
    }))
  },
}

export const usePlan = (id: string): PlanState => {
  const plans = useSyncExternalStore(store.subscribe, () => store.getSnapshot().plans)
  return plans[id]!
}

export const usePresentations = (): PlanStore["presentations"] =>
  useSyncExternalStore(store.subscribe, () => store.getSnapshot().presentations)
