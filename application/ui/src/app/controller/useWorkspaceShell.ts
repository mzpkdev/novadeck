import { useEffect } from "react"

import { cancelTerminalTransition } from "../../layouts/transition"
import type { ViewMode } from "../../model/types"
import { useDesktop } from "../../shell/desktop"
import { sidebarVisible, type ShellState } from "../../shell/shell-state"
import type { WorkspaceCommands } from "../commands/workspace"
import type { UiLocation, UiState } from "../ui-store"
import { useWorkspaceServices } from "./context"
import { useStoreSelector } from "./useStoreSelector"

export type WorkspaceShellOptions = {
  context: string
  view: ViewMode
  selected: string
  navigationType: UiLocation["navigationType"]
}

// The shell state in the UI store and the commands that change it.
export type ShellController = Omit<ShellState, "freshSession"> &
  Pick<
    WorkspaceCommands,
    | "showSessions"
    | "hideSidebar"
    | "toggleSidebar"
    | "enterZen"
    | "exitZen"
    | "requestCanvasFocus"
    | "setKeyboardFocus"
    | "setFocusPreview"
  > & {
    readonly desktop: boolean
    readonly sidebarVisible: boolean
  }

const selectShell = (state: UiState): ShellState => state.shell

export const useWorkspaceShell = ({
  context,
  view,
  selected,
  navigationType,
}: WorkspaceShellOptions): ShellController => {
  const { ui, commands } = useWorkspaceServices()
  const desktop = useDesktop()
  const shell = useStoreSelector(ui, selectShell)
  const { canvasKeyboardFocus } = shell
  const { dropCanvasFocus } = commands
  // Canvas focus requests last only while Canvas shows the terminal they name.
  useEffect(() => {
    if (!canvasKeyboardFocus) return
    if (
      canvasKeyboardFocus.context === context &&
      view === "canvas" &&
      canvasKeyboardFocus.id === selected
    )
      return
    const request = canvasKeyboardFocus.request
    queueMicrotask(() => dropCanvasFocus(request))
  }, [canvasKeyboardFocus, context, dropCanvasFocus, selected, view])
  const presentation = `${context}/${view}/${selected}`
  useEffect(() => {
    if (navigationType === "POP" && presentation) cancelTerminalTransition()
  }, [navigationType, presentation])
  return {
    ...shell,
    showSessions: commands.showSessions,
    hideSidebar: commands.hideSidebar,
    toggleSidebar: commands.toggleSidebar,
    enterZen: commands.enterZen,
    exitZen: commands.exitZen,
    requestCanvasFocus: commands.requestCanvasFocus,
    setKeyboardFocus: commands.setKeyboardFocus,
    setFocusPreview: commands.setFocusPreview,
    desktop,
    sidebarVisible: sidebarVisible(shell, desktop),
  }
}
