import { memo, Suspense, useLayoutEffect, useSyncExternalStore } from "react"

import { terminalElement } from "../interaction/dom"
import { orderedTerminals } from "../model/roster"
import { activeProject } from "../model/state"
import type { Store } from "../model/store"
import type { TerminalMetadata } from "../model/types"
import { CrashLoopDialog } from "../shell/CrashLoopDialog"
import { CloseTerminalDialog } from "../terminals/CloseTerminalDialog"
import { visibleSwitcher } from "../terminals/recent"
import { TerminalSwitcher } from "../terminals/TerminalSwitcher"
import { useUiState, useWorkspaceServices, useWorkspaceState } from "./controller/context"
import { useRouteDialog, type RouteDialog } from "./controller/useRouteDialog"
import { Preferences, TerminalSearch } from "./deferred-views"
import { currentContext, currentState, sameItems, shallowEqual } from "./selectors"

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

const always = (): (() => void) => () => {}
// The backend's crash count, 0 where it reports none.
const useCrashes = (crashes: Store<number> | undefined): number =>
  useSyncExternalStore(crashes?.subscribe ?? always, () => crashes?.getSnapshot() ?? 0)

// Dialogs and the terminal switcher, above the workspace.
export const WorkspaceOverlays = memo((): React.JSX.Element => {
  const { backend, commands, navigation } = useWorkspaceServices()
  const { go, closeDialog } = navigation
  const { chooseRecent, updatePreferences, openSearchResult, closeSwitcher } = commands
  const { confirmClose, cancelClose, retryAfterCrashLoop, dismissCrashLoop } = commands
  const crashes = useCrashes(backend.runnerCrashes)
  const crashLoopDismissed = useUiState((state) => state.crashLoopDismissed)
  const { projectName, context, view } = useWorkspaceState(
    (workspace) => ({
      projectName: activeProject(workspace)!.name,
      context: currentContext(workspace),
      view: currentState(workspace).view,
    }),
    shallowEqual,
  )
  const ordered = useWorkspaceState(
    (workspace): TerminalMetadata[] => orderedTerminals(currentState(workspace).roster),
    sameItems,
  )
  const { dialog, section, preferences, switcher, closing } = useUiState(
    (state) => ({
      closing: state.closing?.context === context ? state.closing.id : null,
      dialog: state.location.route.dialog,
      section: state.location.route.section,
      preferences: state.preferences,
      switcher: visibleSwitcher(state.recent.switcher, context, state.location.route.dialog),
    }),
    shallowEqual,
  )
  const searchLabel = view === "canvas" ? "Canvas" : view === "grid" ? "Grid" : "Focus"
  const { searching, settings, onExitComplete, onLoaded } = useRouteDialog(dialog, context)
  const closingTerminal = closing ? (ordered.find((item) => item.id === closing) ?? null) : null
  return (
    <>
      <CrashLoopDialog
        crashes={crashes && !crashLoopDismissed ? crashes : null}
        onRetry={retryAfterCrashLoop}
        onDismiss={dismissCrashLoop}
      />
      <CloseTerminalDialog
        terminal={closingTerminal}
        onConfirm={confirmClose}
        onCancel={cancelClose}
        returnFocus={(id) =>
          terminalElement(id)?.querySelector<HTMLElement>("[data-terminal-input]") ?? null
        }
      />
      {switcher && (
        <TerminalSwitcher
          mode={switcher.mode}
          project={projectName}
          onClose={closeSwitcher}
          onSelect={chooseRecent}
          terminals={switcher.ids.flatMap((id) => {
            const terminal = ordered.find((item) => item.id === id)
            return terminal ? [terminal] : []
          })}
          selected={switcher.ids[switcher.index]}
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
          tab={section}
          onTabChange={(next) => go({ section: next })}
          onChange={updatePreferences}
          onClose={closeDialog}
        />
      </Suspense>
    </>
  )
})
