import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Terminals } from "../terminals/index.js"
import { describe, expect, it } from "../test.js"
import { Projects } from "./projects.js"
import { WorkspaceStore } from "./store.js"

describe("project removal", () => {
  it.skipIf(process.platform === "win32")(
    "keeps the project when the runner shuts down before its terminals are closed",
    async ({ resources }) => {
      const directory = mkdtempSync(join(tmpdir(), "novadeck-projects-"))
      resources.defer(() => rmSync(directory, { recursive: true, force: true }))
      const path = join(directory, "workspace.sqlite")
      const store = new WorkspaceStore(path)
      resources.defer(() => store.close())
      // A shell that ignores a hangup holds the removal open for about a second.
      const terminals = new Terminals({
        shell: "/bin/sh",
        shellArgs: ["-c", "trap '' HUP; exec cat"],
        records: store,
        mailbox: store,
        doorbell: false,
      })
      resources.defer(() => terminals.shutdown())
      const projects = new Projects(store, terminals)
      const project = await store.createProject({ id: randomUUID(), name: "Kept", cwd: directory })
      const session = store.createSession({ id: randomUUID(), projectId: project.id, name: "S" })
      await terminals.create(
        { id: randomUUID(), sessionId: session.id, cwd: directory, cols: 80, rows: 24 },
        "owner",
      )

      const removing = projects.remove(project.id)
      const refused = expect(removing).rejects.toMatchObject({ code: "RUNTIME_CLOSING" })
      // Under way, waiting for the shell to end, when the runner starts shutting down.
      await new Promise((resolve) => setTimeout(resolve, 50))
      await terminals.shutdown()
      await refused
      store.close()
      const reopened = new WorkspaceStore(path)
      resources.defer(() => reopened.close())
      expect(reopened.projects()).toEqual([project])
      expect(reopened.sessions(project.id)).toEqual([session])
    },
  )
})
