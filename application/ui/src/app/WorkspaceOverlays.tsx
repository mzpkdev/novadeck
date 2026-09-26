import { Suspense } from "react"

import { orderedTerminals } from "../model/state"
import { TerminalSwitcher } from "../terminals/TerminalSwitcher"
import { useWorkspace } from "./controller/context"
import { useRouteDialog } from "./controller/useRouteDialog"
import { Preferences, TerminalSearch } from "./deferred-views"

// Dialogs and the terminal switcher, above the workspace.
export const WorkspaceOverlays = (): React.JSX.Element => {
  const {
    project,
    session: current,
    context,
    route,
    navigation,
    preferences,
    shell,
    recent,
    commands,
  } = useWorkspace()
  const { go, closeDialog } = navigation
  const { view, terminals } = current.state
  const ordered = orderedTerminals(current.state)
  const { setKeyboardFocus } = shell
  const { visibleRecentSwitcher, setRecentSwitcher, closeRecentSwitcher } = recent
  const { select, updatePreferences, openSearchResult } = commands
  const searchLabel = view === "canvas" ? "Canvas" : view === "grid" ? "Grid" : "Focus"
  const { searching, settings, onExitComplete } = useRouteDialog(route.dialog, context)
  return (
    <>
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
          terminals={visibleRecentSwitcher.ids.flatMap((id) => {
            const terminal = terminals.find((item) => item.id === id)
            return terminal ? [terminal] : []
          })}
          selected={visibleRecentSwitcher.ids[visibleRecentSwitcher.index]}
        />
      )}
      {/* Each dialog loads on its own; one opened before its chunk arrives appears once it does. */}
      <Suspense fallback={null}>
        <TerminalSearch
          onExitComplete={onExitComplete}
          open={searching}
          key={context}
          terminals={ordered}
          destination={searchLabel}
          onSelect={openSearchResult}
          onClose={closeDialog}
        />
      </Suspense>
      <Suspense fallback={null}>
        <Preferences
          key={`preferences/${context}`}
          onExitComplete={onExitComplete}
          open={settings}
          value={preferences}
          tab={route.section}
          onTabChange={(section) => go({ section })}
          onChange={updatePreferences}
          onClose={closeDialog}
        />
      </Suspense>
    </>
  )
}
