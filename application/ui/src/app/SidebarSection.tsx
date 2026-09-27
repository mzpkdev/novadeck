import { orderedTerminals } from "../model/roster"
import { WorkspaceSidebar } from "../shell/WorkspaceSidebar"
import { useWorkspace } from "./controller/context"

// The sidebar wired to the workspace: terminal tabs and workspace sessions.
export const SidebarSection = (): React.JSX.Element => {
  const { project, session: current, target, route, shell, rename, commands } = useWorkspace()
  const projectId = project.id
  const workspaceSessionId = current.id
  const workspaceSessions = project.history
  const { selected } = current.state
  const { terminals } = current.state.roster
  const { hidden } = current.state.layout
  const ordered = orderedTerminals(current.state.roster)
  const sidebarPanel = route.panel
  const { sidebarVisible, hideSidebar } = shell
  const { renameView, startRename, changeRenameDraft, saveRename, cancelRename } = rename
  const { switchSession, startFresh, select, add, close, setVisibility, reorder } = commands
  return (
    <WorkspaceSidebar
      projectId={projectId}
      workspaceSessionId={workspaceSessionId}
      workspaceSessions={workspaceSessions}
      terminals={terminals}
      ordered={ordered}
      sidebarPanel={sidebarPanel}
      sidebarVisible={sidebarVisible}
      renameView={renameView}
      selected={selected}
      hidden={hidden}
      onSessionSelect={switchSession}
      onFresh={startFresh}
      onHide={hideSidebar}
      onCreate={() => add()}
      onVisibilityChange={(terminalId, isHidden) => setVisibility(target, terminalId, isHidden)}
      onSelect={select}
      onBeginRename={(id) => {
        const terminal = terminals.find((item) => item.id === id)
        if (terminal) startRename(terminal, "sidebar")
      }}
      onRenameDraft={changeRenameDraft}
      onRenameSave={saveRename}
      onRenameCancel={cancelRename}
      onClose={close}
      onReorder={(tabOrder) => reorder(target, tabOrder)}
    />
  )
}
