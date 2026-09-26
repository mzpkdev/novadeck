import { Plus } from "lucide-react"
import type { ComponentProps } from "react"

import type { TerminalMetadata, WorkspaceSession } from "../model/types"
import { shortcutBindings, workspaceShortcutBindings } from "../shortcuts"
import { SessionsPanel } from "../sidebar/SessionsPanel"
import { SidebarPanel, sidebarCreateClasses } from "../sidebar/SidebarPanel"
import { TerminalTabs } from "../terminals/TerminalTabs"

type Props = Omit<ComponentProps<typeof TerminalTabs>, "sessions" | "rename"> & {
  projectId: string
  workspaceSessionId: string
  workspaceSessions: WorkspaceSession[]
  sessions: TerminalMetadata[]
  ordered: TerminalMetadata[]
  sidebarPanel: "terminals" | "sessions"
  sidebarVisible: boolean
  renameView: ComponentProps<typeof TerminalTabs>["rename"]
  onSessionSelect: (id: string) => void
  onFresh: () => void
  onHide: () => void
  onCreate: () => void
}
export const WorkspaceSidebar = ({
  projectId,
  workspaceSessionId,
  workspaceSessions,
  sessions,
  ordered,
  sidebarPanel,
  sidebarVisible,
  renameView,
  selected,
  hidden,
  onSessionSelect,
  onFresh,
  onHide,
  onCreate,
  onVisibilityChange,
  onSelect,
  onBeginRename,
  onRenameDraft,
  onRenameSave,
  onRenameCancel,
  onClose,
  onReorder,
}: Props): React.JSX.Element => (
  <aside
    id="terminal-sidebar"
    className="sidebar relative flex w-57 shrink-0 flex-col overflow-hidden border-r border-line bg-shell"
    aria-label={sidebarPanel === "sessions" ? "Workspace sessions" : "Terminal sessions"}
    aria-hidden={!sidebarVisible}
    inert={!sidebarVisible}
  >
    <SidebarPanel
      id="sessions-panel"
      title="Sessions"
      count={workspaceSessions.length}
      active={sidebarPanel === "sessions"}
      onClose={onHide}
    >
      <SessionsPanel
        key={projectId}
        items={workspaceSessions.map((item) => {
          const terminals = item.state.sessions
          return {
            id: item.id,
            name: item.name,
            visitedAt: item.visitedAt,
            terminalNames: terminals.map((entry) => entry.name),
            running: terminals.filter((entry) => entry.state === "running").length,
          }
        })}
        activeId={workspaceSessionId}
        onSelect={onSessionSelect}
        onFresh={onFresh}
      />
    </SidebarPanel>
    <SidebarPanel
      id="terminals-panel"
      title="Terminals"
      titleHint={`Recent · ${shortcutBindings().recent.display.join(" ")}`}
      count={sessions.length}
      active={sidebarPanel === "terminals"}
      onClose={onHide}
    >
      <button className={sidebarCreateClasses} aria-label="New terminal" onClick={onCreate}>
        <Plus size={14} className="shrink-0" />
        <span className="min-w-0 truncate">Terminal</span>
        <kbd className="mb-[-2px] ml-auto min-h-0 shrink-0 whitespace-nowrap border-0 bg-transparent p-0 text-[9px] text-muted opacity-70">
          {workspaceShortcutBindings().newTerminal.display.join(" ")}
        </kbd>
      </button>
      <TerminalTabs
        key={`${projectId}/${workspaceSessionId}`}
        sessions={ordered}
        selected={selected}
        hidden={hidden}
        rename={renameView}
        onVisibilityChange={onVisibilityChange}
        onSelect={onSelect}
        onBeginRename={onBeginRename}
        onRenameDraft={onRenameDraft}
        onRenameSave={onRenameSave}
        onRenameCancel={onRenameCancel}
        onClose={onClose}
        onReorder={onReorder}
      />
    </SidebarPanel>
  </aside>
)
