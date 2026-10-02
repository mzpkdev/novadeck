import type { Project, WorkspaceSession } from "@novadeck/protocol"
import { RunnerError } from "@novadeck/protocol/client"

import { context, describe, expect, it } from "../../test"
import { loadListing } from "./index"

const gone = () => Promise.reject(new RunnerError("NOT_FOUND", "Project not found"))

// A runner holding these projects and sessions; those named in `removed` go between the
// projects' listing and the calls about them, as when another window removes them.
const runnerHolding = (
  projects: readonly Project[],
  sessions: readonly WorkspaceSession[],
  removed: ReadonlySet<string> = new Set(),
) => {
  const created: Project[] = []
  return {
    created,
    runner: {
      projects: {
        list: async () => [...projects],
        create: async (input: { id: string; name: string }) => {
          const project = { ...input, cwd: "/home" }
          created.push(project)
          return project
        },
        rename: gone,
        remove: gone,
      },
      sessions: {
        list: ({ projectId }: { projectId: string }) =>
          removed.has(projectId)
            ? gone()
            : Promise.resolve(sessions.filter((session) => session.projectId === projectId)),
        create: (input: { id: string; projectId: string; name: string }) =>
          removed.has(input.projectId) ? gone() : Promise.resolve({ ...input, state: null }),
        rename: gone,
        save: gone,
      },
      terminals: { list: async () => [] },
    } as unknown as Parameters<typeof loadListing>[0],
  }
}

const project = (id: string): Project => ({ id, name: id, cwd: `/${id}` })
const session = (id: string, projectId: string): WorkspaceSession => ({
  id,
  projectId,
  name: id,
  state: null,
})
let ids = 0
const newId = () => `new-${(ids += 1)}`

describe("loading the runner's listing", () => {
  context("when a project is removed while the listing loads", () => {
    it("leaves it out and lists the others", async () => {
      const { runner } = runnerHolding(
        [project("a"), project("b")],
        [session("s", "a"), session("t", "b")],
        new Set(["a"]),
      )
      const listing = await loadListing(runner, newId, () => 0)
      expect(listing.map((item) => item.project.id)).toEqual(["b"])
    })

    it("leaves out one without sessions, whose first session it can no longer create", async () => {
      const { runner } = runnerHolding(
        [project("a"), project("b")],
        [session("t", "b")],
        new Set(["a"]),
      )
      const listing = await loadListing(runner, newId, () => 0)
      expect(listing.map((item) => item.project.id)).toEqual(["b"])
    })

    it("opens a fresh Home project when every project went", async () => {
      const { runner, created } = runnerHolding([project("a")], [], new Set(["a"]))
      const listing = await loadListing(runner, newId, () => 0)
      expect(created).toEqual([expect.objectContaining({ name: "Home" })])
      expect(listing.map((item) => item.project.id)).toEqual([created[0]!.id])
      expect(listing[0]!.sessions).toHaveLength(1)
    })
  })
})
