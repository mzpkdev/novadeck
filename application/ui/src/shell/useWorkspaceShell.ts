import { useEffect, useRef, useState } from "react"
import type { NavigationType } from "react-router"

import { focusSidebarToggle, focusZenCreate, focusZenEnter } from "../interaction/dom"
import { cancelTerminalTransition } from "../layouts/transition"
import type { ViewMode, WindowedView } from "../model/types"
import { collapsedStorageKey, readSidebarCollapsed, windowedStorageKey } from "./shell-storage"
import { useDesktop } from "./WorkspacePanels"

export const useWorkspaceShell = ({
  context,
  workspaceSessionId,
  view,
  selected,
  windowedView,
  sidebarPanel,
  setSidebarPanel,
  navigationType,
}: {
  context: string
  workspaceSessionId: string
  view: ViewMode
  selected: string
  windowedView: WindowedView
  sidebarPanel: "sessions" | "terminals"
  setSidebarPanel: (panel: "sessions" | "terminals") => void
  navigationType: NavigationType
}) => {
  const desktop = useDesktop()
  const [revealCanvas, setRevealCanvas] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState<{ id: string; view: ViewMode } | null>(null)
  const [canvasKeyboardFocus, setCanvasKeyboardFocus] = useState<{
    context: string
    id: string
    request: number
  } | null>(null)
  const canvasFocusRequest = useRef(0)
  const requestCanvasFocus = (id: string): void => {
    setCanvasKeyboardFocus({ context, id, request: ++canvasFocusRequest.current })
  }
  const [navigation, setNavigation] = useState({ count: 1, fit: false })
  const [zen, setZen] = useState<{
    sidebar: boolean
    collapsed: boolean
    panel: "sessions" | "terminals"
  } | null>(null)
  const [sidebar, setSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const sidebarVisible = !zen && (desktop ? !sidebarCollapsed : sidebar)
  const [focusPreview, setFocusPreview] = useState<{ context: string; id: string } | null>(null)
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
  const toggleSidebar = (panel: "terminals" | "sessions"): void => {
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
