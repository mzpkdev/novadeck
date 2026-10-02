import { useCallback, useMemo, type ReactNode } from "react"

import { activeProject } from "../model/state"
import type { TerminalMetadata } from "../model/types"
import { TerminalCompanion } from "../terminals/companion/TerminalCompanion"
import { UndockedWindow } from "../terminals/companion/UndockedWindow"
import { presentedProgram, terminalProfile } from "../terminals/processes/profiles"
import { renameView } from "../terminals/rename-state"
import {
  WindowShell,
  type TerminalLayoutControls,
  type WindowShellProps,
} from "../terminals/WindowShell"
import { useUiState, useWorkspaceServices, useWorkspaceState } from "./controller/context"
import {
  currentContext,
  currentState,
  currentTarget,
  sameTarget,
  shallowEqual,
  windowedDestination,
} from "./selectors"

// One terminal in the current view: the backend's surface, which keeps its controller
// mounted while the shared window, and the body its program calls for, wrap its content.
export const WorkspaceTerminal = ({
  terminal,
  controls: { minimize, onFlyTo, onResizePreset, onReveal },
}: {
  readonly terminal: TerminalMetadata
  readonly controls: TerminalLayoutControls
}): React.JSX.Element => {
  const { backend, commands } = useWorkspaceServices()
  const { setSelected, openWindowed, openFocus, close, startRename, openSwitcher } = commands
  const { undock } = commands
  const { changeRenameDraft, saveRename, cancelRename, setKeyboardFocus } = commands
  const terminalId = terminal.id
  // Each terminal selects only what concerns it, so a rename keystroke or a keyboard
  // focus change re-renders just the terminals involved.
  const { projectName, context, view, windowedView, active, large } = useWorkspaceState(
    (workspace) => {
      const state = currentState(workspace)
      return {
        projectName: activeProject(workspace)!.name,
        context: currentContext(workspace),
        view: state.view,
        windowedView: state.windowedView,
        active: state.selected === terminalId,
        large:
          state.view !== "focus" && state.layout.sizePresets[state.view][terminalId] === "large",
      }
    },
    shallowEqual,
  )
  const { projectId, workspaceSessionId } = useWorkspaceState(currentTarget, sameTarget)
  // The session's terminals by handle, which name the agents its messages are with.
  const names = useWorkspaceState(
    (workspace) =>
      Object.fromEntries(
        currentState(workspace).roster.terminals.flatMap((each) =>
          each.handle ? [[each.handle, each.name]] : [],
        ),
      ) as Readonly<Record<string, string>>,
    shallowEqual,
  )
  const { fresh, rename, keyboardFocus, enabledViews, fontSize } = useUiState(
    (state) => ({
      fresh: state.created?.context === context && state.created.id === terminalId,
      rename:
        state.rename?.context === context && state.rename.id === terminalId ? state.rename : null,
      keyboardFocus:
        state.shell.keyboardFocus?.id === terminalId ? state.shell.keyboardFocus : null,
      enabledViews: state.preferences.enabledViews,
      fontSize: state.preferences.fontSize,
    }),
    shallowEqual,
  )
  const compact = view !== "focus"
  const destination = windowedDestination(windowedView, enabledViews)
  const windowedLabel = destination === "canvas" ? "Canvas" : "Grid"
  // Surfaces may depend on these in effects, so keep them stable across renders.
  const terminalKey = useMemo(
    () => ({ projectId, workspaceSessionId, terminalId }),
    [projectId, workspaceSessionId, terminalId],
  )
  const onInputFocused = useCallback(() => setKeyboardFocus(null), [setKeyboardFocus])
  // What of this terminal's companion is undocked in windows of its own now.
  const undockedKey = useWorkspaceState((workspace) =>
    currentState(workspace)
      .roster.terminals.flatMap(({ companion }) =>
        companion?.from !== terminalId
          ? []
          : [companion.item.kind === "messages" ? "\n" : companion.item.ref.id],
      )
      .join("\0"),
  )
  const undocked = useMemo(() => {
    const items = undockedKey ? undockedKey.split("\0") : []
    return {
      artifacts: items.filter((item) => item !== "\n"),
      messages: items.includes("\n"),
    }
  }, [undockedKey])
  const { icon: Icon, Body } = terminalProfile(terminal)
  const processWindow = presentedProgram(terminal)
  const frame: Omit<WindowShellProps, "children"> = {
    terminal,
    icon: <Icon size={14} strokeWidth={1.5} />,
    ...(processWindow ? { processWindow } : {}),
    active,
    fresh,
    rename: renameView(rename),
    onBeginRename: () => startRename(terminal, "header"),
    onRenameDraft: (draft) => changeRenameDraft(terminal.id, draft),
    onRenameSave: () => saveRename(terminal.id),
    onRenameCancel: () => cancelRename(terminal.id),
    compact,
    switcher: { onOpen: (button) => openSwitcher(terminal.id, button) },
    onClose: () => close(terminal.id),
    ...(minimize ? { minimize } : {}),
    ...(onFlyTo ? { onFlyTo } : {}),
    ...(onResizePreset
      ? {
          onResizePreset: (button: HTMLButtonElement) => {
            setSelected(terminal.id)
            onResizePreset(button)
          },
          resizeView: view === "grid" ? ("grid" as const) : ("canvas" as const),
        }
      : {}),
    large,
    ...(compact && enabledViews.includes("focus")
      ? { onFocus: () => openFocus(terminal.id) }
      : !compact && destination
        ? { windowed: { destination: windowedLabel, onOpen: () => openWindowed(terminal.id) } }
        : {}),
  }
  // One shell element whatever runs, so only the body around the content changes.
  const renderWindow = (content: ReactNode): ReactNode => (
    <WindowShell {...frame}>
      {backend.companions ? (
        <TerminalCompanion
          companions={backend.companions}
          messages={backend.messages}
          peerName={(handle) => names[handle]}
          companionKey={terminalKey}
          view={view}
          onReveal={onReveal}
          minimized={minimize?.minimized}
          clipContent={minimize?.clipContent}
          undock={(item) => undock(terminal.id, item)}
          undocked={undocked}
        >
          {Body ? <Body>{content}</Body> : content}
        </TerminalCompanion>
      ) : Body ? (
        <Body>{content}</Body>
      ) : (
        content
      )}
    </WindowShell>
  )
  // A window undocked from a terminal's companion: the same frame, with what it shows
  // where a terminal's content would be, loading from that terminal.
  if (terminal.companion)
    return (
      <WindowShell {...frame}>
        <UndockedWindow
          companions={backend.companions}
          messages={backend.messages}
          origin={{ projectId, workspaceSessionId, terminalId: terminal.companion.from }}
          window={terminal.companion}
          peerName={(handle) => names[handle]}
        />
      </WindowShell>
    )
  return (
    <backend.TerminalSurface
      terminalKey={terminalKey}
      terminal={terminal}
      projectName={projectName}
      fontSize={fontSize}
      minimized={minimize?.minimized}
      clipContent={minimize?.clipContent}
      focusInput={keyboardFocus?.view === view && active}
      onInputFocused={onInputFocused}
      renderWindow={renderWindow}
    />
  )
}

// Layouts call this for each terminal they place.
export const renderTerminal = (
  terminal: TerminalMetadata,
  controls: TerminalLayoutControls,
): React.JSX.Element => (
  <WorkspaceTerminal key={terminal.id} terminal={terminal} controls={controls} />
)
