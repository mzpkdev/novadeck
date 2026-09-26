import { Suspense, useCallback, useMemo, useRef } from "react"
import { useNavigationType } from "react-router"

import { sidebarToggle } from "../workspace/interaction/dom"
import { useRecentSwitcher } from "../workspace/interaction/useRecentSwitcher"
import { useTerminalRename } from "../workspace/interaction/useTerminalRename"
import { useWorkspaceKeyboard } from "../workspace/interaction/useWorkspaceKeyboard"
import type { CanvasHandle } from "../workspace/layouts/canvas/types"
import { Focus } from "../workspace/layouts/focus/Focus"
import {
  cancelTerminalTransition,
  transitionTerminal,
  transitionWorkspace,
} from "../workspace/layouts/transition"
import {
  activeProject,
  activeSession,
  orderedSessions,
  type ValueUpdate,
} from "../workspace/model/state"
import type { TerminalMetadata, CanvasLayout, GridLayouts } from "../workspace/model/types"
import { Preferences } from "../workspace/preferences/Preferences"
import { viewModes } from "../workspace/preferences/preferences-storage"
import { useWorkspacePreferences } from "../workspace/preferences/useWorkspacePreferences"
import { TerminalSearch } from "../workspace/search/TerminalSearch"
import { EmptyWorkspace } from "../workspace/shell/EmptyWorkspace"
import { SidebarRail } from "../workspace/shell/SidebarRail"
import { useWorkspaceShell } from "../workspace/shell/useWorkspaceShell"
import { WorkspaceHeader } from "../workspace/shell/WorkspaceHeader"
import { WorkspacePanels } from "../workspace/shell/WorkspacePanels"
import { WorkspaceSidebar } from "../workspace/shell/WorkspaceSidebar"
import { ZenDock } from "../workspace/shell/ZenDock"
import { LiveTerminal } from "../workspace/terminals/LiveTerminal"
import { RuntimeTerminal, type RuntimeTerminalProps } from "../workspace/terminals/RuntimeTerminal"
import type { MinimizeControls } from "../workspace/terminals/Terminal"
import { TerminalSwitcher } from "../workspace/terminals/TerminalSwitcher"
import { Canvas, Grid } from "./deferred-views"
import { routeUrl } from "./routing"
import { useRouteDialog } from "./useRouteDialog"
import { useWorkspaceCommands } from "./useWorkspaceCommands"
import { useWorkspaceRoute } from "./useWorkspaceRoute"
import { useWorkspaceServices } from "./workspace-services"
import { WorkspaceRoot, useWorkspaceEnvironment, type WorkspaceMode } from "./WorkspaceRoot"

const useWorkspaceTarget = (projectId: string, workspaceSessionId: string) =>
  useMemo(() => ({ projectId, workspaceSessionId }), [projectId, workspaceSessionId])

const useLayoutHidden = (hidden: Record<string, boolean>, preview: string) =>
  useMemo(() => (preview ? { ...hidden, [preview]: false } : hidden), [hidden, preview])

const WorkspaceTerminal = ({
  runtime,
  fontSize,
  keyHandler,
  ...props
}: RuntimeTerminalProps & {
  fontSize: number
  keyHandler: (event: KeyboardEvent) => boolean
}): React.JSX.Element => {
  const { terminals } = useWorkspaceEnvironment()
  return terminals ? (
    <LiveTerminal {...props} runtime={terminals} fontSize={fontSize} keyHandler={keyHandler} />
  ) : (
    <RuntimeTerminal {...props} runtime={runtime} />
  )
}

export const App = ({
  mode = new URLSearchParams(window.location.search).get("demo") === "1" ? "demo" : "live",
}: {
  mode?: WorkspaceMode
}): React.JSX.Element => (
  <WorkspaceRoot mode={mode}>
    <WorkspaceApp />
  </WorkspaceRoot>
)

export const WorkspaceApp = (): React.JSX.Element => {
  const services = useWorkspaceServices()
  const environment = useWorkspaceEnvironment()
  const navigationType = useNavigationType()
  const { preferences, setPreferences } = useWorkspacePreferences()
  const routeState = useWorkspaceRoute(preferences)
  const { workspace, dispatch, route, go, closeDialog, runtime } = routeState
  const project = activeProject(workspace)!
  const current = activeSession(workspace)!
  const projectId = project.id
  const workspaceSessionId = current.id
  const context = `${projectId}/${workspaceSessionId}`
  const projects = workspace.projects
  const workspaceSessions = project.history
  const {
    view,
    windowedView,
    sessions,
    selected,
    canvasLayout,
    gridLayouts,
    gridRestoreWidths,
    gridMinimized,
    sizePresets,
    hidden,
  } = current.state
  const ordered = orderedSessions(current.state)
  const preview = hidden[selected] ? selected : ""
  const layoutHidden = useLayoutHidden(hidden, preview)
  const target = useWorkspaceTarget(projectId, workspaceSessionId)
  const sidebarPanel = route.panel
  const shell = useWorkspaceShell({
    context,
    workspaceSessionId,
    view,
    selected,
    windowedView,
    sidebarPanel,
    setSidebarPanel: (panel) => go({ panel }),
    navigationType,
  })
  const {
    sidebar,
    sidebarCollapsed,
    sidebarVisible,
    zen,
    hideSidebar,
    exitZen,
    showSessions,
    revealCanvas,
    setRevealCanvas,
    setSidebar,
    keyboardFocus,
    setKeyboardFocus,
    canvasKeyboardFocus,
    navigation,
    focusPreview,
  } = shell
  const rename = useTerminalRename({ context, view, target, sessions, selected, dispatch })
  const { renameView, startRename, changeRenameDraft, saveRename, cancelRename } = rename
  const recent = useRecentSwitcher({ context, dialog: route.dialog, sessions, ordered, selected })
  const { visibleRecentSwitcher, setRecentSwitcher, closeRecentSwitcher, openRecentSwitcher } =
    recent
  const workspaceCommands = useWorkspaceCommands({
    routeState,
    preferences,
    setPreferences,
    target,
    shell,
    rename,
    recent,
  })
  const commands = {
    ...workspaceCommands,
    close: async (terminalId: string): Promise<void> => {
      await workspaceCommands.close(terminalId)
      environment.terminals?.disposeTerminal(terminalId)
    },
  }
  const {
    created,
    windowedDestination,
    switchSession,
    switchProject,
    select,
    setSelected,
    updatePreferences,
    changeView,
    openWindowed,
    openSearchResult,
    add,
  } = commands
  const displayed = selected || (focusPreview?.context === context ? focusPreview.id : "")
  const active = sessions.find((session) => session.id === displayed) ?? sessions[0]
  const windowedLabel = windowedDestination === "canvas" ? "Canvas" : "Grid"
  const searchLabel = view === "canvas" ? "Canvas" : view === "grid" ? "Grid" : "Focus"
  const canvas = useRef<CanvasHandle>(null)
  const { searching, settings, onExitComplete } = useRouteDialog(route.dialog, context)
  const setVisibility = (terminalId: string, isHidden: boolean): void =>
    dispatch({ type: "terminal/visibility", target, terminalId, hidden: isHidden })
  const setCanvasLayout = useCallback(
    (layout: ValueUpdate<CanvasLayout>) => dispatch({ type: "canvas/layout", target, layout }),
    [dispatch, target],
  )
  const setGridLayouts = useCallback(
    (layouts: ValueUpdate<GridLayouts>) => dispatch({ type: "grid/layouts", target, layouts }),
    [dispatch, target],
  )
  const setTabOrder = (tabOrder: string[]): void =>
    dispatch({ type: "terminal/reorder", target, tabOrder })
  const { execute, handleTerminalKey } = useWorkspaceKeyboard({
    routeState,
    preferences,
    shell,
    rename,
    recent,
    commands,
    canvas,
    active,
    onError: services.reportError,
  })
  const terminal = (
    session: TerminalMetadata,
    compact: boolean,
    minimize?: MinimizeControls,
    onFlyTo?: () => void,
    onResizePreset?: (button: HTMLButtonElement) => void,
    large = false,
  ): React.JSX.Element => (
    <WorkspaceTerminal
      key={session.id}
      session={session}
      active={selected === session.id}
      fresh={created?.context === context && created.id === session.id}
      rename={renameView?.id === session.id ? renameView : null}
      onBeginRename={() => startRename(session, "header")}
      onRenameDraft={(draft) => changeRenameDraft(session.id, draft)}
      onRenameSave={() => saveRename(session.id)}
      onRenameCancel={() => cancelRename(session.id)}
      projectName={project.name}
      runtime={runtime}
      fontSize={preferences.fontSize}
      keyHandler={handleTerminalKey}
      target={target}
      focusInput={
        keyboardFocus?.id === session.id && keyboardFocus.view === view && selected === session.id
      }
      onInputFocused={() => setKeyboardFocus(null)}
      compact={compact}
      switcher={{ onOpen: (button) => openRecentSwitcher(session.id, button) }}
      onClose={() => execute("closeTerminal", { terminalId: session.id })}
      {...(minimize ? { minimize } : {})}
      {...(onFlyTo ? { onFlyTo } : {})}
      {...(onResizePreset
        ? {
            onResizePreset: (button: HTMLButtonElement) => {
              setSelected(session.id)
              onResizePreset(button)
            },
            resizeView: view === "grid" ? ("grid" as const) : ("canvas" as const),
          }
        : {})}
      large={large}
      {...(compact && preferences.enabledViews.includes("focus")
        ? {
            onFocus: () =>
              transitionTerminal(session.id, () => {
                go({ terminal: session.id, view: "focus" })
                setRevealCanvas(false)
                setSidebar(false)
              }),
          }
        : !compact && windowedDestination
          ? {
              windowed: {
                destination: windowedLabel,
                onOpen: () => openWindowed(session.id),
              },
            }
          : {})}
    />
  )

  const sidebarRail = (mobile = false): React.JSX.Element => (
    <SidebarRail
      mobile={mobile}
      sidebarVisible={sidebarVisible}
      sidebarPanel={sidebarPanel}
      zen={Boolean(zen)}
      toggleSidebar={(panel) => execute(panel === "sessions" ? "sessions" : "terminals")}
      hideSidebar={hideSidebar}
    />
  )
  return (
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
      <WorkspaceHeader
        hidden={Boolean(zen)}
        onZen={() => execute("zen")}
        {...(environment.mode === "live" ? { onOpenProject: environment.openProject } : {})}
        view={view}
        enabledViews={preferences.enabledViews}
        projects={projects}
        project={project}
        onProjectSelect={(id) => {
          const next = projects.find((item) => item.id === id)
          if (next) void switchProject(next).catch(services.reportError)
        }}
        onViewChange={(id) => {
          if (view === id) return
          const direction = viewModes.indexOf(id) > viewModes.indexOf(view) ? 1 : -1
          transitionWorkspace(() => changeView(id), direction)
        }}
        homeTo={routeUrl({ ...route, view: preferences.enabledViews[0]!, dialog: null })}
        onSearch={() => execute("find")}
        onPreferences={() => execute("preferences")}
      />
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
          sidebar={
            <WorkspaceSidebar
              projectId={projectId}
              workspaceSessionId={workspaceSessionId}
              workspaceSessions={workspaceSessions}
              sessions={sessions}
              ordered={ordered}
              sidebarPanel={sidebarPanel}
              sidebarVisible={sidebarVisible}
              renameView={renameView}
              selected={selected}
              hidden={hidden}
              onSessionSelect={(id) => {
                void switchSession(id).catch(services.reportError)
              }}
              onFresh={() => execute("newSession")}
              onHide={hideSidebar}
              onCreate={() => execute("newTerminal")}
              onVisibilityChange={setVisibility}
              onSelect={select}
              onBeginRename={(id) => {
                const session = sessions.find((item) => item.id === id)
                if (session) startRename(session, "sidebar")
              }}
              onRenameDraft={changeRenameDraft}
              onRenameSave={saveRename}
              onRenameCancel={cancelRename}
              onClose={(terminalId) => execute("closeTerminal", { terminalId })}
              onReorder={setTabOrder}
            />
          }
        >
          <section
            key={`${projectId}/${workspaceSessionId}`}
            data-workspace-area
            className={`main-area relative flex min-w-0 flex-1 flex-col ${view}`}
            aria-label={`${view} view`}
          >
            <Suspense
              key={view}
              fallback={
                <div
                  role="status"
                  aria-label="Loading workspace"
                  className="flex flex-1 items-center justify-center text-sm text-muted"
                >
                  Loading workspace…
                </div>
              }
            >
              {view === "focus" && active && (
                <Focus
                  sessions={sessions}
                  displayed={active.id}
                  onSelect={setSelected}
                  render={(session) => terminal(session, false)}
                />
              )}
              {view === "grid" && (
                <Grid
                  sessions={sessions}
                  hidden={layoutHidden}
                  preview={preview}
                  selected={selected}
                  onSelect={setSelected}
                  navigation={navigation.count}
                  presets={sizePresets.grid}
                  restoreWidths={gridRestoreWidths}
                  onToggleWidth={(terminalId, change) =>
                    dispatch({
                      type: "grid/size-toggle",
                      target,
                      terminalId,
                      change,
                    })
                  }
                  layouts={gridLayouts}
                  onLayoutsChange={setGridLayouts}
                  minimized={gridMinimized}
                  onMinimize={(terminalId) =>
                    dispatch({ type: "grid/minimize", target, terminalId })
                  }
                  onCreate={() => {
                    void add({ beginRename: false }).catch(services.reportError)
                  }}
                  render={(session, minimize, resize) =>
                    terminal(
                      session,
                      true,
                      minimize,
                      undefined,
                      resize,
                      sizePresets.grid[session.id] === "large",
                    )
                  }
                />
              )}
              {view === "canvas" && (
                <Canvas
                  ref={canvas}
                  hidden={layoutHidden}
                  preview={preview}
                  presets={sizePresets.canvas}
                  onPresetChange={(terminalId, preset) =>
                    dispatch({
                      type: "terminal/size-preset",
                      target,
                      terminalId,
                      view: "canvas",
                      preset,
                    })
                  }
                  layout={canvasLayout}
                  matchCreatedTerminalRatio={Boolean(zen)}
                  revealOnMount={revealCanvas}
                  fitOnNavigate={navigation.fit}
                  onLayoutChange={setCanvasLayout}
                  sessions={sessions}
                  selected={selected}
                  keyboardFocusRequest={
                    canvasKeyboardFocus?.context === context && canvasKeyboardFocus.id === selected
                      ? canvasKeyboardFocus.request
                      : null
                  }
                  navigation={navigation.count}
                  onSelect={setSelected}
                  onCreate={(beforePublish) => {
                    void add({ beginRename: false, beforePublish }).catch(services.reportError)
                  }}
                  render={(session, minimize, onFlyTo, resize) =>
                    terminal(
                      session,
                      true,
                      minimize,
                      onFlyTo,
                      resize,
                      sizePresets.canvas[session.id] === "large",
                    )
                  }
                />
              )}
            </Suspense>
            {view !== "focus" &&
              sessions.length > 0 &&
              sessions.every((session) => layoutHidden[session.id]) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-muted">All terminals are hidden</p>
                  <button
                    className="small-button"
                    onClick={() => sessions.forEach((session) => setVisibility(session.id, false))}
                  >
                    Show all terminals
                  </button>
                </div>
              )}
            {!sessions.length && (
              <EmptyWorkspace
                view={view}
                zen={Boolean(zen)}
                onCreate={() => execute("newTerminal")}
                onShowSessions={showSessions}
              />
            )}
          </section>
        </WorkspacePanels>
        {zen && (
          <ZenDock
            view={view}
            enabledViews={preferences.enabledViews}
            onCreate={() => execute("newTerminal")}
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
            {sessions.length} {sessions.length === 1 ? "terminal" : "terminals"}
          </span>
          <span className="footer-running max-[701px]:hidden ml-2 border-l border-line pl-3">
            {sessions.filter((session) => session.state === "running").length} running
          </span>
        </span>
      </footer>
      {visibleRecentSwitcher && (
        <TerminalSwitcher
          mode={visibleRecentSwitcher.mode}
          project={project.name}
          onClose={closeRecentSwitcher}
          onSelect={(id) => {
            setRecentSwitcher(null)
            if (visibleRecentSwitcher.mode === "click") setKeyboardFocus({ id, view })
            select(id)
          }}
          sessions={visibleRecentSwitcher.ids.flatMap((id) => {
            const session = sessions.find((item) => item.id === id)
            return session ? [session] : []
          })}
          selected={visibleRecentSwitcher.ids[visibleRecentSwitcher.index]}
        />
      )}
      <TerminalSearch
        onExitComplete={onExitComplete}
        open={searching}
        key={`${projectId}/${workspaceSessionId}`}
        sessions={ordered}
        destination={searchLabel}
        onSelect={openSearchResult}
        onClose={closeDialog}
      />
      <Preferences
        key={`preferences/${projectId}/${workspaceSessionId}`}
        onExitComplete={onExitComplete}
        open={settings}
        value={preferences}
        tab={route.section}
        onTabChange={(section) => go({ section })}
        onChange={updatePreferences}
        onClose={closeDialog}
      />
    </main>
  )
}
