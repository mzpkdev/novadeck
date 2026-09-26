import { Suspense, useCallback, useMemo, useRef } from "react"
import { HashRouter } from "react-router"

import type { CreateBackend } from "../backend/port"
import { sidebarToggle } from "../interaction/dom"
import type { CanvasHandle } from "../layouts/canvas/types"
import { Focus } from "../layouts/focus/Focus"
import {
  cancelTerminalTransition,
  transitionTerminal,
  transitionWorkspace,
} from "../layouts/transition"
import { orderedSessions, type ValueUpdate } from "../model/state"
import type { TerminalMetadata, CanvasLayout, GridLayouts } from "../model/types"
import { Preferences } from "../preferences/Preferences"
import { viewModes } from "../preferences/preferences-storage"
import { TerminalSearch } from "../search/TerminalSearch"
import { EmptyWorkspace } from "../shell/EmptyWorkspace"
import { SidebarRail } from "../shell/SidebarRail"
import { WorkspaceHeader } from "../shell/WorkspaceHeader"
import { WorkspacePanels } from "../shell/WorkspacePanels"
import { WorkspaceSidebar } from "../shell/WorkspaceSidebar"
import { ZenDock } from "../shell/ZenDock"
import { TerminalFrame, type MinimizeControls } from "../terminals/TerminalFrame"
import { TerminalSwitcher } from "../terminals/TerminalSwitcher"
import { selectBackend } from "./backend"
import { useRouteDialog } from "./controller/useRouteDialog"
import { useWorkspaceController } from "./controller/useWorkspaceController"
import { useWorkspaceKeyboard } from "./controller/useWorkspaceKeyboard"
import { Canvas, Grid } from "./deferred-views"
import { routeUrl } from "./routing"

const useLayoutHidden = (hidden: Record<string, boolean>, preview: string) =>
  useMemo(() => (preview ? { ...hidden, [preview]: false } : hidden), [hidden, preview])

export type AppProps = { readonly backend?: CreateBackend }

export const App = ({ backend = selectBackend }: AppProps): React.JSX.Element => (
  <HashRouter useTransitions={false}>
    <WorkspaceApp createBackend={backend} />
  </HashRouter>
)

export const WorkspaceApp = ({
  createBackend,
}: {
  readonly createBackend: CreateBackend
}): React.JSX.Element => {
  const controller = useWorkspaceController(createBackend)
  const {
    backend,
    workspace,
    project,
    session: current,
    target,
    context,
    route,
    navigation,
    preferences,
    shell,
    rename,
    recent,
    commands,
    active,
  } = controller
  const { dispatch, go, closeDialog } = navigation
  const projectId = project.id
  const workspaceSessionId = current.id
  const projects = workspace.projects
  const workspaceSessions = project.history
  const {
    view,
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
  const sidebarPanel = route.panel
  const {
    sidebar,
    sidebarCollapsed,
    sidebarVisible,
    zen,
    hideSidebar,
    toggleSidebar,
    enterZen,
    exitZen,
    showSessions,
    revealCanvas,
    setRevealCanvas,
    setSidebar,
    keyboardFocus,
    setKeyboardFocus,
    canvasKeyboardFocus,
    navigation: shellNavigation,
  } = shell
  const { renameView, startRename, changeRenameDraft, saveRename, cancelRename } = rename
  const { visibleRecentSwitcher, setRecentSwitcher, closeRecentSwitcher, openRecentSwitcher } =
    recent
  const {
    created,
    windowedDestination,
    switchSession,
    startFresh,
    switchProject,
    select,
    setSelected,
    updatePreferences,
    changeView,
    openWindowed,
    openSearchResult,
    add,
    close,
  } = commands
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
  useWorkspaceKeyboard(controller, canvas)
  const terminal = (
    session: TerminalMetadata,
    compact: boolean,
    minimize?: MinimizeControls,
    onFlyTo?: () => void,
    onResizePreset?: (button: HTMLButtonElement) => void,
    large = false,
  ): React.JSX.Element => (
    <TerminalFrame
      key={session.id}
      session={session}
      active={selected === session.id}
      fresh={created?.context === context && created.id === session.id}
      rename={renameView?.id === session.id ? renameView : null}
      onBeginRename={() => startRename(session, "header")}
      onRenameDraft={(draft) => changeRenameDraft(session.id, draft)}
      onRenameSave={() => saveRename(session.id)}
      onRenameCancel={() => cancelRename(session.id)}
      compact={compact}
      switcher={{ onOpen: (button) => openRecentSwitcher(session.id, button) }}
      onClose={() => close(session.id)}
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
    >
      <backend.TerminalSurface
        terminalKey={{ ...target, terminalId: session.id }}
        terminal={session}
        projectName={project.name}
        minimized={minimize?.minimized}
        clipContent={minimize?.clipContent}
        focusInput={
          keyboardFocus?.id === session.id && keyboardFocus.view === view && selected === session.id
        }
        onInputFocused={() => setKeyboardFocus(null)}
      />
    </TerminalFrame>
  )

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
        onZen={enterZen}
        view={view}
        enabledViews={preferences.enabledViews}
        projects={projects}
        project={project}
        onProjectSelect={(id) => {
          const next = projects.find((item) => item.id === id)
          if (next) switchProject(next)
        }}
        onViewChange={(id) => {
          if (view === id) return
          const direction = viewModes.indexOf(id) > viewModes.indexOf(view) ? 1 : -1
          transitionWorkspace(() => changeView(id), direction)
        }}
        homeTo={routeUrl({ ...route, view: preferences.enabledViews[0]!, dialog: null })}
        onSearch={() => {
          setRecentSwitcher(null)
          go({ dialog: "search" })
        }}
        onPreferences={() => {
          setRecentSwitcher(null)
          go({ dialog: "preferences", section: "general" })
        }}
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
              onSessionSelect={switchSession}
              onFresh={startFresh}
              onHide={hideSidebar}
              onCreate={() => add()}
              onVisibilityChange={setVisibility}
              onSelect={select}
              onBeginRename={(id) => {
                const session = sessions.find((item) => item.id === id)
                if (session) startRename(session, "sidebar")
              }}
              onRenameDraft={changeRenameDraft}
              onRenameSave={saveRename}
              onRenameCancel={cancelRename}
              onClose={close}
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
                  navigation={shellNavigation.count}
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
                    add({ beginRename: false })
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
                  fitOnNavigate={shellNavigation.fit}
                  onLayoutChange={setCanvasLayout}
                  sessions={sessions}
                  selected={selected}
                  keyboardFocusRequest={
                    canvasKeyboardFocus?.context === context && canvasKeyboardFocus.id === selected
                      ? canvasKeyboardFocus.request
                      : null
                  }
                  navigation={shellNavigation.count}
                  onSelect={setSelected}
                  onCreate={() => add({ beginRename: false })}
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
                onCreate={() => add()}
                onShowSessions={showSessions}
              />
            )}
          </section>
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
