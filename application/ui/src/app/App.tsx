import { HashRouter } from "react-router"

import type { CreateBackend } from "../backend/port"
import { sidebarToggle } from "../interaction/dom"
import { cancelTerminalTransition } from "../layouts/transition"
import { SidebarRail } from "../shell/SidebarRail"
import { WorkspacePanels } from "../shell/WorkspacePanels"
import { ZenDock } from "../shell/ZenDock"
import { selectBackend } from "./backend"
import { useWorkspaceServices, WorkspaceContext } from "./controller/context"
import { useKeyboard } from "./controller/useKeyboard"
import { useWorkspaceController } from "./controller/useWorkspaceController"
import { HeaderSection } from "./HeaderSection"
import { SidebarSection } from "./SidebarSection"
import { WorkspaceOverlays } from "./WorkspaceOverlays"
import { WorkspaceProvider } from "./WorkspaceProvider"
import { WorkspaceStage } from "./WorkspaceStage"

export type AppProps = {
  // Read once when the app mounts; later changes are ignored. Defaults to app/backend.ts.
  readonly createBackend?: CreateBackend
}

export const App = ({ createBackend = selectBackend }: AppProps): React.JSX.Element => (
  <HashRouter useTransitions={false}>
    <WorkspaceProvider createBackend={createBackend}>
      <WorkspaceApp />
    </WorkspaceProvider>
  </HashRouter>
)

export const WorkspaceApp = (): React.JSX.Element => {
  const controller = useWorkspaceController()
  const { session: current, route, preferences, shell, commands } = controller
  const { view } = current.state
  const { terminals } = current.state.roster
  const sidebarPanel = route.panel
  const { sidebar, sidebarCollapsed, sidebarVisible, zen, hideSidebar, toggleSidebar, exitZen } =
    shell
  const { changeView, add } = commands
  const { canvas } = useWorkspaceServices()
  useKeyboard()
  const sidebarRail = (mobile = false): React.JSX.Element => (
    <SidebarRail
      mobile={mobile}
      sidebarVisible={sidebarVisible}
      sidebarPanel={sidebarPanel}
      zen={Boolean(zen)}
      toggleSidebar={toggleSidebar}
      hideSidebar={hideSidebar}
    />
  )
  return (
    <WorkspaceContext value={controller}>
      <main
        className="workspace flex h-dvh min-h-100 flex-col overflow-hidden bg-paper"
        data-zen={Boolean(zen)}
        onPointerDownCapture={cancelTerminalTransition}
        onKeyDownCapture={cancelTerminalTransition}
        style={
          {
            "--terminal-font-size": `${preferences.fontSize}px`,
          } as React.CSSProperties
        }
      >
        <HeaderSection />
        <div className="workspace-body relative flex min-h-0 flex-1">
          {sidebarRail()}
          <WorkspacePanels
            collapsed={Boolean(zen) || sidebarCollapsed}
            mobileOpen={!zen && sidebar}
            onMobileOpenChange={(open) => {
              if (!open) hideSidebar()
            }}
            mobileRail={sidebarRail(true)}
            mobileLabel={sidebarPanel === "sessions" ? "Workspace sessions" : "Terminal sessions"}
            mobileFinalFocusEl={() => sidebarToggle(sidebarPanel)}
            sidebar={<SidebarSection />}
          >
            <WorkspaceStage canvas={canvas} />
          </WorkspacePanels>
          {zen && (
            <ZenDock
              view={view}
              enabledViews={preferences.enabledViews}
              onCreate={() => add()}
              onViewChange={(next) => {
                if (next !== view) changeView(next)
              }}
              onExit={exitZen}
            />
          )}
        </div>
        <footer
          hidden={Boolean(zen)}
          className="app-footer max-[701px]:px-3 max-[701px]:text-[8px] flex h-7 shrink-0 items-center justify-between border-t border-line bg-paper px-4 text-[10px] text-muted"
        >
          <span className="flex items-center gap-2">
            <span>
              {terminals.length} {terminals.length === 1 ? "terminal" : "terminals"}
            </span>
            <span className="footer-running max-[701px]:hidden ml-2 border-l border-line pl-3">
              {terminals.filter((terminal) => terminal.state === "running").length} running
            </span>
          </span>
        </footer>
        <WorkspaceOverlays />
      </main>
    </WorkspaceContext>
  )
}
