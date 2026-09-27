import { Suspense, useLayoutEffect } from "react"

import { orderedTerminals } from "../model/roster"
import { TerminalSwitcher } from "../terminals/TerminalSwitcher"
import { useWorkspace } from "./controller/context"
import { useRouteDialog, type RouteDialog } from "./controller/useRouteDialog"
import { Preferences, TerminalSearch } from "./deferred-views"

// Rendered beside a deferred dialog, so it mounts only once the dialog's view has loaded.
const Loaded = ({
  dialog,
  onLoaded,
}: {
  readonly dialog: RouteDialog
  readonly onLoaded: (dialog: RouteDialog) => void
}): null => {
  useLayoutEffect(() => onLoaded(dialog), [dialog, onLoaded])
  return null
}

// Dialogs and the terminal switcher, above the workspace.
export const WorkspaceOverlays = (): React.JSX.Element => {
  const {
    project,
    session: current,
    context,
    route,
    navigation,
    preferences,
    recent,
    commands,
  } = useWorkspace()
  const { go, closeDialog } = navigation
  const { view } = current.state
  const { terminals } = current.state.roster
  const ordered = orderedTerminals(current.state.roster)
  const { visibleRecentSwitcher, closeRecentSwitcher } = recent
  const { chooseRecent, updatePreferences, openSearchResult } = commands
  const searchLabel = view === "canvas" ? "Canvas" : view === "grid" ? "Grid" : "Focus"
  const { searching, settings, onExitComplete, onLoaded } = useRouteDialog(route.dialog, context)
  return (
    <>
      {visibleRecentSwitcher && (
        <TerminalSwitcher
          mode={visibleRecentSwitcher.mode}
          project={project.name}
          onClose={closeRecentSwitcher}
          onSelect={chooseRecent}
          terminals={visibleRecentSwitcher.ids.flatMap((id) => {
            const terminal = terminals.find((item) => item.id === id)
            return terminal ? [terminal] : []
          })}
          selected={visibleRecentSwitcher.ids[visibleRecentSwitcher.index]}
        />
      )}
      {/* Each dialog loads on its own; one opened before its chunk arrives appears once it does. */}
      <Suspense fallback={null}>
        <Loaded dialog="search" onLoaded={onLoaded} />
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
        <Loaded dialog="preferences" onLoaded={onLoaded} />
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
