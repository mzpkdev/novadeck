import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { NavigationType } from "react-router"

import { focusSidebarToggle, focusZenCreate, focusZenEnter } from "../interaction/dom"
import { cancelTerminalTransition } from "../layouts/transition"
import type { ViewMode, WindowedView } from "../model/types"
import { collapsedStorageKey, readSidebarCollapsed, windowedStorageKey } from "./shell-storage"
import { useDesktop } from "./WorkspacePanels"

export type SidebarPanel = "sessions" | "terminals"
export type KeyboardFocus = { id: string; view: ViewMode }
export type CanvasKeyboardFocus = { context: string; id: string; request: number }
export type ShellNavigation = { count: number; fit: boolean }
export type ZenState = { sidebar: boolean; collapsed: boolean; panel: SidebarPanel }
export type FocusPreview = { context: string; id: string }

export type WorkspaceShellOptions = {
  context: string
  workspaceSessionId: string
  view: ViewMode
  selected: string
  windowedView: WindowedView
  sidebarPanel: SidebarPanel
  setSidebarPanel: (panel: SidebarPanel) => void
  navigationType: NavigationType
}

// Presentation state around the workspace: sidebar, zen, navigation pulses and focus requests.
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

export const useWorkspaceShell = ({
  context,
  workspaceSessionId,
  view,
  selected,
  windowedView,
  sidebarPanel,
  setSidebarPanel,
  navigationType,
}: WorkspaceShellOptions): ShellController => {
  const desktop = useDesktop()
  const [revealCanvas, setRevealCanvas] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState<KeyboardFocus | null>(null)
  const [canvasKeyboardFocus, setCanvasKeyboardFocus] = useState<CanvasKeyboardFocus | null>(null)
  const canvasFocusRequest = useRef(0)
  const requestCanvasFocus = (id: string): void => {
    setCanvasKeyboardFocus({ context, id, request: ++canvasFocusRequest.current })
  }
  const [navigation, setNavigation] = useState<ShellNavigation>({ count: 1, fit: false })
  const [zen, setZen] = useState<ZenState | null>(null)
  const [sidebar, setSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const sidebarVisible = !zen && (desktop ? !sidebarCollapsed : sidebar)
  const [focusPreview, setFocusPreview] = useState<FocusPreview | null>(null)
  const presentation = `${context}/${view}/${selected}`
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
  }, [canvasKeyboardFocus, context, selected, view])
  const [freshSession, setFreshSession] = useState<string | null>(null)
  const [previousPresentation, setPreviousPresentation] = useState({ presentation, context })
  if (previousPresentation.presentation !== presentation) {
    setPreviousPresentation({ presentation, context })
    if (previousPresentation.context !== context || navigationType === "POP") {
      setNavigation((value) => ({ count: value.count + 1, fit: false }))
      setRevealCanvas(false)
      setSidebar(freshSession === workspaceSessionId)
      setFreshSession(null)
    }
  }
  useEffect(() => {
    if (navigationType === "POP" && presentation) cancelTerminalTransition()
  }, [navigationType, presentation])
  const showSessions = (): void => {
    setZen(null)
    setSidebarPanel("sessions")
    setSidebarCollapsed(false)
    setSidebar(true)
  }
  const hideSidebar = (): void => {
    setSidebarCollapsed(true)
    setSidebar(false)
    if (desktop) focusSidebarToggle(sidebarPanel)
  }
  const toggleSidebar = (panel: SidebarPanel): void => {
    if (zen) setZen(null)
    if (sidebarPanel === panel && sidebarVisible) hideSidebar()
    else {
      setSidebarPanel(panel)
      setSidebarCollapsed(false)
      setSidebar(true)
    }
  }
  const enterZen = (): void => {
    if (zen) return
    setZen({ sidebar, collapsed: sidebarCollapsed, panel: sidebarPanel })
    requestAnimationFrame(() => focusZenCreate())
  }
  const exitZen = (): void => {
    if (!zen) return
    setSidebar(zen.sidebar)
    setSidebarCollapsed(zen.collapsed)
    setSidebarPanel(zen.panel)
    setZen(null)
    requestAnimationFrame(() => focusZenEnter())
  }
  useEffect(() => {
    try {
      localStorage.setItem(windowedStorageKey, windowedView)
    } catch {
      /* Remains available for this session when storage is unavailable. */
    }
  }, [windowedView])
  useEffect(() => {
    try {
      localStorage.setItem(collapsedStorageKey, String(sidebarCollapsed))
    } catch {
      /* Collapsing still works when storage is unavailable. */
    }
  }, [sidebarCollapsed])
  return {
    desktop,
    sidebar,
    sidebarCollapsed,
    sidebarVisible,
    zen,
    setSidebar,
    setSidebarCollapsed,
    showSessions,
    hideSidebar,
    toggleSidebar,
    enterZen,
    exitZen,
    revealCanvas,
    setRevealCanvas,
    keyboardFocus,
    setKeyboardFocus,
    canvasKeyboardFocus,
    setCanvasKeyboardFocus,
    requestCanvasFocus,
    navigation,
    setNavigation,
    focusPreview,
    setFocusPreview,
    setFreshSession,
  }
}
