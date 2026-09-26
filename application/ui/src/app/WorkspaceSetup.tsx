import { useState } from "react"
import { useStore } from "zustand"

import type { WorkspaceServices } from "../services/workspace-services"
import type { Project } from "../workspace/model/types"
import { StartupPanel } from "./ConnectionScreen"

export const WorkspaceSetup = ({
  services,
  onCreated,
  onCancel,
}: {
  services: WorkspaceServices
  onCreated: (projectId: string, sessionId: string) => void
  onCancel?: () => void
}): React.JSX.Element => {
  const status = useStore(services.statusStore)
  const [createdProject, setCreatedProject] = useState<Project>()
  const project =
    createdProject ?? (status.emptyReason === "sessions" ? services.getCurrentProject() : undefined)
  const [name, setName] = useState("")
  const [directory, setDirectory] = useState("")
  const [sessionName, setSessionName] = useState("Development")
  const title = project ? `Create a session in ${project.name}` : "Open a project"
  return (
    <StartupPanel title={title}>
      <p className="mb-5 text-sm leading-6 text-muted">
        {project
          ? "A session groups the terminals you use for a piece of work."
          : "Choose an existing directory on the machine running your terminal server."}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (status.pending) return
          void (async () => {
            const selected =
              project ??
              (await services.createProject({ name: name.trim(), cwd: directory.trim() }))
            setCreatedProject(selected)
            const session = await services.createSession(selected.id, sessionName.trim())
            onCreated(selected.id, session.id)
          })().catch(services.reportError)
        }}
      >
        {!project && (
          <>
            <label className="flex flex-col gap-2 text-xs text-muted">
              Project name
              <input
                className="rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                required
                disabled={status.pending}
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted">
              Project directory
              <input
                className="rounded-control border border-line bg-paper px-3 py-2 font-mono text-sm text-ink"
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                placeholder="/path/to/project"
                required
                disabled={status.pending}
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-2 text-xs text-muted">
          Session name
          <input
            className="rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink"
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            maxLength={200}
            required
            disabled={status.pending}
          />
        </label>
        {status.actionError && (
          <p role="alert" className="text-sm leading-5 text-muted">
            {status.actionError}
          </p>
        )}
        <button
          className="small-button justify-center disabled:opacity-50"
          type="submit"
          disabled={status.pending}
        >
          {status.pending ? "Creating…" : project ? "Create session" : "Open project"}
        </button>
        {onCancel && (
          <button className="small-button justify-center" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
    </StartupPanel>
  )
}
