import { transitionTerminal } from "../layouts/transition"
import type { TerminalMetadata } from "../model/types"
import { TerminalFrame, type TerminalLayoutControls } from "../terminals/TerminalFrame"
import { useWorkspace } from "./controller/context"

// One terminal in the current view: the shared frame around the backend's surface.
export const WorkspaceTerminal = ({
  terminal: session,
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
  const large = view !== "focus" && sizePresets[view][session.id] === "large"
  const windowedLabel = windowedDestination === "canvas" ? "Canvas" : "Grid"
  return (
    <TerminalFrame
      session={session}
      active={selected === session.id}
      fresh={created?.context === context && created.id === session.id}
      rename={renameView?.id === session.id ? renameView : null}
      onBeginRename={() => startRename(session, "header")}
      onRenameDraft={(draft) => changeRenameDraft(session.id, draft)}
      onRenameSave={() => saveRename(session.id)}
      onRenameCancel={() => cancelRename(session.id)}
      compact={compact}
      switcher={{ onOpen: (button) => recent.openRecentSwitcher(session.id, button) }}
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
                navigation.go({ terminal: session.id, view: "focus" })
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
}

// Layouts call this for each terminal they place.
export const renderTerminal = (
  terminal: TerminalMetadata,
  controls: TerminalLayoutControls,
): React.JSX.Element => (
  <WorkspaceTerminal key={terminal.id} terminal={terminal} controls={controls} />
)
