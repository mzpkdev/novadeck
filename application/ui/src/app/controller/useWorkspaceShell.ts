import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react"

import { focusSidebarToggle, focusZenCreate, focusZenEnter } from "../../interaction/dom"
import { cancelTerminalTransition } from "../../layouts/transition"
import type { ViewMode } from "../../model/types"
import { isDesktop, useDesktop } from "../../shell/desktop"
import {
  enterZen,
  exitZen,
  hideSidebar,
  showPanel,
  sidebarVisible,
  type CanvasKeyboardFocus,
  type FocusPreview,
  type KeyboardFocus,
  type ShellNavigation,
  type ShellState,
  type SidebarPanel,
  type ZenState,
} from "../../shell/shell-state"
import { currentContext } from "../selectors"
import { updateShell, type UiLocation, type UiState } from "../ui-store"
import { useWorkspaceServices, type WorkspaceServices } from "./context"
import { useStoreSelector } from "./useStoreSelector"

export type WorkspaceShellOptions = {
  context: string
  view: ViewMode
  selected: string
  navigationType: UiLocation["navigationType"]
}

// The shell state in the UI store and the operations on it.
export type ShellController = {
  readonly desktop: boolean
  readonly sidebar: boolean
  readonly sidebarCollapsed: boolean
  readonly sidebarVisible: boolean
  readonly zen: ZenState | null
  readonly setSidebar: Dispatch<SetStateAction<boolean>>
  readonly setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  readonly showSessions: () => void
  readonly hideSidebar: () => void
  readonly toggleSidebar: (panel: SidebarPanel) => void
  readonly enterZen: () => void
  readonly exitZen: () => void
  readonly revealCanvas: boolean
  readonly setRevealCanvas: Dispatch<SetStateAction<boolean>>
  readonly keyboardFocus: KeyboardFocus | null
  readonly setKeyboardFocus: Dispatch<SetStateAction<KeyboardFocus | null>>
  readonly canvasKeyboardFocus: CanvasKeyboardFocus | null
  readonly setCanvasKeyboardFocus: Dispatch<SetStateAction<CanvasKeyboardFocus | null>>
  readonly requestCanvasFocus: (id: string) => void
  readonly navigation: ShellNavigation
  readonly setNavigation: Dispatch<SetStateAction<ShellNavigation>>
  readonly focusPreview: FocusPreview | null
  readonly setFocusPreview: Dispatch<SetStateAction<FocusPreview | null>>
  readonly setFreshSession: Dispatch<SetStateAction<string | null>>
}

const selectShell = (state: UiState): ShellState => state.shell

// Operations read the latest stores when called, so they stay stable across renders.
const createShellOperations = ({
  ui,
  workspace,
  navigation,
}: Pick<WorkspaceServices, "ui" | "workspace" | "navigation">) => {
  const set =
    <K extends keyof ShellState>(key: K): Dispatch<SetStateAction<ShellState[K]>> =>
    (value) =>
      updateShell(ui, (current) => {
        const next =
          typeof value === "function"
            ? (value as (previous: ShellState[K]) => ShellState[K])(current[key])
            : value
        return Object.is(next, current[key]) ? current : { ...current, [key]: next }
      })
  const panel = (): SidebarPanel => ui.getSnapshot().location.route.panel
  let canvasFocusRequest = 0
  const hide = (): void => {
    updateShell(ui, hideSidebar)
    if (isDesktop()) focusSidebarToggle(panel())
  }
  return {
    setSidebar: set("sidebar"),
    setSidebarCollapsed: set("sidebarCollapsed"),
    setRevealCanvas: set("revealCanvas"),
    setKeyboardFocus: set("keyboardFocus"),
    setCanvasKeyboardFocus: set("canvasKeyboardFocus"),
    setNavigation: set("navigation"),
    setFocusPreview: set("focusPreview"),
    setFreshSession: set("freshSession"),
    requestCanvasFocus: (id: string): void =>
      updateShell(ui, (current) => ({
        ...current,
        canvasKeyboardFocus: {
          context: currentContext(workspace.getSnapshot()),
          id,
          request: ++canvasFocusRequest,
        },
      })),
    showSessions: (): void => {
      updateShell(ui, (current) => ({ ...current, zen: null }))
      navigation.go({ panel: "sessions" })
      updateShell(ui, showPanel)
    },
    hideSidebar: hide,
    toggleSidebar: (next: SidebarPanel): void => {
      const visible = sidebarVisible(ui.getSnapshot().shell, isDesktop())
      updateShell(ui, (current) => ({ ...current, zen: null }))
      if (panel() === next && visible) hide()
      else {
        navigation.go({ panel: next })
        updateShell(ui, showPanel)
      }
    },
    enterZen: (): void => {
      if (ui.getSnapshot().shell.zen) return
      updateShell(ui, (current) => enterZen(current, panel()))
      requestAnimationFrame(() => focusZenCreate())
    },
    exitZen: (): void => {
      const { zen } = ui.getSnapshot().shell
      if (!zen) return
      updateShell(ui, exitZen)
      navigation.go({ panel: zen.panel })
      requestAnimationFrame(() => focusZenEnter())
    },
  }
}

export const useWorkspaceShell = ({
  context,
  view,
  selected,
  navigationType,
}: WorkspaceShellOptions): ShellController => {
  const { ui, workspace, navigation } = useWorkspaceServices()
  const desktop = useDesktop()
  const shell = useStoreSelector(ui, selectShell)
  const operations = useMemo(
    () => createShellOperations({ ui, workspace, navigation }),
    [ui, workspace, navigation],
  )
  const { canvasKeyboardFocus } = shell
  const { setCanvasKeyboardFocus } = operations
  useEffect(() => {
    if (!canvasKeyboardFocus) return
    if (
      canvasKeyboardFocus.context === context &&
      view === "canvas" &&
      canvasKeyboardFocus.id === selected
    )
      return
    const request = canvasKeyboardFocus.request
    queueMicrotask(() =>
      setCanvasKeyboardFocus((previous) => (previous?.request === request ? null : previous)),
    )
  }, [canvasKeyboardFocus, context, selected, setCanvasKeyboardFocus, view])
  const presentation = `${context}/${view}/${selected}`
  useEffect(() => {
    if (navigationType === "POP" && presentation) cancelTerminalTransition()
  }, [navigationType, presentation])
  return {
    ...shell,
    ...operations,
    desktop,
    sidebarVisible: sidebarVisible(shell, desktop),
  }
}
