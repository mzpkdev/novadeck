import { orderedSessions } from "../model/state"
import { Preferences } from "../preferences/Preferences"
import { TerminalSearch } from "../search/TerminalSearch"
import { TerminalSwitcher } from "../terminals/TerminalSwitcher"
import { useWorkspace } from "./controller/context"
import { useRouteDialog } from "./controller/useRouteDialog"

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
  const { view, sessions } = current.state
  const ordered = orderedSessions(current.state)
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
        key={context}
        sessions={ordered}
        destination={searchLabel}
        onSelect={openSearchResult}
        onClose={closeDialog}
      />
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
    </>
  )
}
