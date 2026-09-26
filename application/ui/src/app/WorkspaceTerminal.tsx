import { useCallback, useMemo } from "react"

import { transitionTerminal } from "../layouts/transition"
import type { TerminalMetadata } from "../model/types"
import { TerminalFrame, type TerminalLayoutControls } from "../terminals/TerminalFrame"
import { useWorkspace } from "./controller/context"

// One terminal in the current view: the shared frame around the backend's surface.
export const WorkspaceTerminal = ({
  terminal,
  controls: { minimize, onFlyTo, onResizePreset },
}: {
  readonly terminal: TerminalMetadata
  readonly controls: TerminalLayoutControls
}): React.JSX.Element => {
  const {
    backend,
    project,
    session: current,
    target,
    context,
    navigation,
    preferences,
    shell,
    rename,
    recent,
    commands,
  } = useWorkspace()
  const { view, selected, sizePresets } = current.state
  const { keyboardFocus, setKeyboardFocus, setRevealCanvas, setSidebar } = shell
  const { renameView, startRename, changeRenameDraft, saveRename, cancelRename } = rename
  const { created, windowedDestination, setSelected, openWindowed, close } = commands
  const compact = view !== "focus"
  const large = view !== "focus" && sizePresets[view][terminal.id] === "large"
  const windowedLabel = windowedDestination === "canvas" ? "Canvas" : "Grid"
  const { projectId, workspaceSessionId } = target
  const terminalId = terminal.id
  // Surfaces may depend on these in effects, so keep them stable across renders.
  const terminalKey = useMemo(
    () => ({ projectId, workspaceSessionId, terminalId }),
    [projectId, workspaceSessionId, terminalId],
  )
  const onInputFocused = useCallback(() => setKeyboardFocus(null), [setKeyboardFocus])
  return (
    <TerminalFrame
      terminal={terminal}
      active={selected === terminal.id}
      fresh={created?.context === context && created.id === terminal.id}
      rename={renameView?.id === terminal.id ? renameView : null}
      onBeginRename={() => startRename(terminal, "header")}
      onRenameDraft={(draft) => changeRenameDraft(terminal.id, draft)}
      onRenameSave={() => saveRename(terminal.id)}
      onRenameCancel={() => cancelRename(terminal.id)}
      compact={compact}
      switcher={{ onOpen: (button) => recent.openRecentSwitcher(terminal.id, button) }}
      onClose={() => close(terminal.id)}
      {...(minimize ? { minimize } : {})}
      {...(onFlyTo ? { onFlyTo } : {})}
      {...(onResizePreset
        ? {
            onResizePreset: (button: HTMLButtonElement) => {
              setSelected(terminal.id)
              onResizePreset(button)
            },
            resizeView: view === "grid" ? ("grid" as const) : ("canvas" as const),
          }
        : {})}
      large={large}
      {...(compact && preferences.enabledViews.includes("focus")
        ? {
            onFocus: () =>
              transitionTerminal(terminal.id, () => {
                navigation.go({ terminal: terminal.id, view: "focus" })
                setRevealCanvas(false)
                setSidebar(false)
              }),
          }
        : !compact && windowedDestination
          ? {
              windowed: {
                destination: windowedLabel,
                onOpen: () => openWindowed(terminal.id),
              },
            }
          : {})}
    >
      <backend.TerminalSurface
        terminalKey={terminalKey}
        terminal={terminal}
        projectName={project.name}
        minimized={minimize?.minimized}
        clipContent={minimize?.clipContent}
        focusInput={
          keyboardFocus?.id === terminal.id &&
          keyboardFocus.view === view &&
          selected === terminal.id
        }
        onInputFocused={onInputFocused}
      />
    </TerminalFrame>
  )
}

// Layouts call this for each terminal they place.
export const renderTerminal = (
  terminal: TerminalMetadata,
  controls: TerminalLayoutControls,
): React.JSX.Element => (
  <WorkspaceTerminal key={terminal.id} terminal={terminal} controls={controls} />
)
