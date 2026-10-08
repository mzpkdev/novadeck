import { agentWorking } from "../model/agent-finish"
import type { WorkspaceProject } from "../model/types"
import { unreadEnd, type Unread } from "../terminals/unread-state"

// What a project's terminals show at a glance, the most pressing of them, as the switcher
// marks it: an agent asking the person a question, or waiting on them for a permission or
// a plan; one that finished while they looked elsewhere, its reply unread, on an error or
// on its own; or one still working. Undefined while none shows anything.
export type ProjectStatus = "question" | "attention" | "failed" | "done" | "running"

// Most pressing first.
const rank: readonly ProjectStatus[] = ["question", "attention", "failed", "done", "running"]

const pressing = (a: ProjectStatus | undefined, b: ProjectStatus | undefined) =>
  a === undefined || (b !== undefined && rank.indexOf(b) < rank.indexOf(a)) ? b : a

export const projectStatus = (
  project: WorkspaceProject,
  unread: Unread,
): ProjectStatus | undefined => {
  let status: ProjectStatus | undefined
  for (const session of project.history) {
    const context = `${project.id}/${session.id}`
    for (const terminal of session.state.roster.terminals) {
      const attention = terminal.state === "running" ? terminal.agent?.attention : undefined
      const each: ProjectStatus | undefined = attention
        ? attention.kind === "question"
          ? "question"
          : "attention"
        : (unreadEnd(unread, context, terminal.id) ??
          (agentWorking(terminal) ? "running" : undefined))
      status = pressing(status, each)
    }
  }
  return status
}

// Whether a status asks for the person, as working on does not.
export const needsPerson = (status: ProjectStatus | undefined): boolean =>
  status !== undefined && status !== "running"

// The status of every project, by its id, that shows one.
export const projectStatuses = (
  projects: readonly WorkspaceProject[],
  unread: Unread,
): Readonly<Record<string, ProjectStatus>> => {
  const statuses: Record<string, ProjectStatus> = {}
  for (const project of projects) {
    const status = projectStatus(project, unread)
    if (status) statuses[project.id] = status
  }
  return statuses
}

// The most pressing status among the projects other than `current` that ask for the
// person: what the switcher's button marks.
export const elsewhereStatus = (
  statuses: Readonly<Record<string, ProjectStatus>>,
  current: string,
): ProjectStatus | undefined => {
  let status: ProjectStatus | undefined
  for (const [id, each] of Object.entries(statuses))
    if (id !== current && needsPerson(each)) status = pressing(status, each)
  return status
}
