import { useEffect, useEffectEvent, type RefObject } from "react"

import type { useWorkspaceCommands } from "../../app/useWorkspaceCommands"
import type { useWorkspaceRoute } from "../../app/useWorkspaceRoute"
import type { CanvasHandle } from "../layouts/canvas/Canvas"
import { activeSession, orderedSessions } from "../model/state"
import type { TerminalMetadata, PreferencesValue } from "../model/types"
import { viewModes } from "../preferences/preferences-storage"
import type { useWorkspaceShell } from "../shell/useWorkspaceShell"
import { matchesShortcut, shortcutBindings, workspaceShortcutBindings } from "../shortcuts"
import {
  workspaceShortcutTarget,
  workspaceOverlayOpen,
  insideOpenZenDock,
  terminalTabInteractionActive,
  focusWorkspaceViewport,
  insideViewSwitch,
  insideNavigationControl,
  insideCanvasNode,
  insideTerminalTab,
  focusTerminalTab,
  insideTerminalInput,
  insideTerminalRename,
  insideSwitcherClose,
} from "./dom"
import type { useRecentSwitcher } from "./useRecentSwitcher"
import type { useTerminalRename } from "./useTerminalRename"

export const useWorkspaceKeyboard = ({
  routeState,
  preferences,
  shell,
  rename,
  recent,
  commands,
  canvas,
  active,
}: {
  routeState: ReturnType<typeof useWorkspaceRoute>
  preferences: PreferencesValue
  shell: ReturnType<typeof useWorkspaceShell>
  rename: ReturnType<typeof useTerminalRename>
  recent: ReturnType<typeof useRecentSwitcher>
  commands: ReturnType<typeof useWorkspaceCommands>
  canvas: RefObject<CanvasHandle | null>
  active: TerminalMetadata | undefined
}): void => {
  const { workspace, route, go } = routeState
  const current = activeSession(workspace)!
  const { view, selected, sessions } = current.state
  const context = `${workspace.activeProjectId}/${current.id}`
  const ordered = orderedSessions(current.state)
  const sidebarPanel = route.panel
  const {
    sidebarVisible,
    zen,
    setKeyboardFocus,
    setFocusPreview,
    hideSidebar,
    requestCanvasFocus,
    exitZen,
    enterZen,
    toggleSidebar,
  } = shell
  const { startRename } = rename
  const {
    recentSwitcher,
    visibleRecentSwitcher,
    setRecentSwitcher,
    closeRecentSwitcher,
    recentIds,
  } = recent
  const { setSelected, select, windowedDestination, changeView, add, close, startFresh } = commands
  const workspaceEscape = useEffectEvent((event: KeyboardEvent): void => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      route.dialog ||
      visibleRecentSwitcher ||
      !workspaceShortcutTarget(event.target) ||
      insideOpenZenDock(event.target)
    )
      return
    if (workspaceOverlayOpen() || terminalTabInteractionActive()) return
    if (!event.repeat && view === "canvas" && canvas.current?.returnToOrigin()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!selected && !sidebarVisible) return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat) return
    if (selected) {
      if (view === "focus") setFocusPreview({ context, id: selected })
      setKeyboardFocus(null)
      setSelected("")
      focusWorkspaceViewport()
    } else hideSidebar()
  })
  const workspaceArrows = useEffectEvent((event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.metaKey ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight"
    const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1
    if (visibleRecentSwitcher) {
      if (horizontal) return
      event.preventDefault()
      event.stopPropagation()
      const { ids, index } = visibleRecentSwitcher
      setRecentSwitcher({
        ...visibleRecentSwitcher,
        index: (index + direction + ids.length) % ids.length,
      })
      return
    }
    if (route.dialog || event.ctrlKey || event.shiftKey) return
    const fromViewSwitch = insideViewSwitch(event.target)
    if (
      !fromViewSwitch &&
      (!workspaceShortcutTarget(event.target) || insideNavigationControl(event.target))
    )
      return
    event.preventDefault()
    event.stopPropagation()
    if (horizontal) {
      const modes = viewModes.filter((mode) => preferences.enabledViews.includes(mode))
      const next = modes[(modes.indexOf(view) + direction + modes.length) % modes.length]
      if (next && next !== view) changeView(next)
      return
    }
    if (!ordered.length) return
    const index = ordered.findIndex((session) => session.id === selected)
    const next =
      index < 0
        ? direction > 0
          ? 0
          : ordered.length - 1
        : (index + direction + ordered.length) % ordered.length
    const session = ordered[next]
    if (session) {
      const fromCanvasNode = view === "canvas" && insideCanvasNode(event.target)
      if (fromCanvasNode) requestCanvasFocus(session.id)
      select(session.id)
      const fromTab = insideTerminalTab(event.target)
      if ((fromViewSwitch || fromTab) && sidebarVisible && sidebarPanel === "terminals")
        focusTerminalTab(session.id)
    }
  })

  const keydown = useEffectEvent((event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
    const shortcuts = shortcutBindings()
    const fromInput = insideTerminalInput(event.target)
    const renamed = insideTerminalRename(event.target)
    if (renamed) return
    if (visibleRecentSwitcher && event.key === "Escape") {
      event.preventDefault()
      closeRecentSwitcher()
      return
    }
    if (visibleRecentSwitcher?.mode === "click" && event.key === "Enter") {
      if (insideSwitcherClose(event.target)) return
      event.preventDefault()
      const id = visibleRecentSwitcher.ids[visibleRecentSwitcher.index]
      setRecentSwitcher(null)
      if (id) {
        setKeyboardFocus({ id, view })
        select(id)
      }
      return
    }
    if (matchesShortcut(event, shortcuts.find)) {
      event.preventDefault()
      setRecentSwitcher(null)
      go({ dialog: "search" })
      return
    }
    if (matchesShortcut(event, shortcuts.preferences)) {
      event.preventDefault()
      setRecentSwitcher(null)
      go({ dialog: "preferences", section: "general" })
      return
    }
    if (route.dialog) return
    if (matchesShortcut(event, shortcuts.newSession)) {
      event.preventDefault()
      if (event.repeat) return
      setRecentSwitcher(null)
      startFresh()
      return
    }
    if (matchesShortcut(event, shortcuts.terminals) || matchesShortcut(event, shortcuts.sessions)) {
      event.preventDefault()
      if (event.repeat) return
      setRecentSwitcher(null)
      toggleSidebar(matchesShortcut(event, shortcuts.terminals) ? "terminals" : "sessions")
      return
    }
    if (matchesShortcut(event, shortcuts.recent) || matchesShortcut(event, shortcuts.previous)) {
      const ids = visibleRecentSwitcher?.ids ?? recentIds()
      if (ids.length < 2) return
      event.preventDefault()
      const direction = matchesShortcut(event, shortcuts.previous) ? -1 : 1
      const index =
        ((visibleRecentSwitcher?.index ?? (selected ? 0 : -1)) + direction + ids.length) %
        ids.length
      setRecentSwitcher({
        context,
        ids,
        index,
        fromInput: visibleRecentSwitcher?.fromInput ?? fromInput,
        mode: visibleRecentSwitcher?.mode ?? "held",
      })
      return
    }
    if (matchesShortcut(event, shortcuts.focus)) {
      const next = view === "focus" ? windowedDestination : "focus"
      if (!next || !preferences.enabledViews.includes(next)) return
      event.preventDefault()
      if (event.repeat) return
      if (fromInput && selected) setKeyboardFocus({ id: selected, view: next })
      changeView(next)
      return
    }
    if (matchesShortcut(event, shortcuts.newTerminal)) {
      event.preventDefault()
      if (event.repeat) return
      add({ fromKeyboard: true })
      return
    }
    const workspaceKeys = workspaceShortcutBindings()
    if (
      event.repeat ||
      route.dialog ||
      visibleRecentSwitcher ||
      !workspaceShortcutTarget(event.target) ||
      workspaceOverlayOpen()
    )
      return
    if (matchesShortcut(event, workspaceKeys.find)) {
      event.preventDefault()
      go({ dialog: "search" })
    } else if (matchesShortcut(event, workspaceKeys.focus)) {
      const next = view === "focus" ? windowedDestination : "focus"
      if (!next || !preferences.enabledViews.includes(next)) return
      event.preventDefault()
      changeView(next)
    } else if (matchesShortcut(event, workspaceKeys.newTerminal)) {
      event.preventDefault()
      add({ fromKeyboard: true })
    } else if (matchesShortcut(event, workspaceKeys.zen)) {
      event.preventDefault()
      if (zen) exitZen()
      else enterZen()
    } else if (matchesShortcut(event, workspaceKeys.terminals)) {
      event.preventDefault()
      toggleSidebar("terminals")
    } else if (
      (event.key === "Delete" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey) ||
      matchesShortcut(event, workspaceKeys.rename)
    ) {
      const session =
        sessions.find((item) => item.id === selected) ?? (view === "focus" ? active : undefined)
      if (!session) return
      event.preventDefault()
      if (event.key === "Delete") close(session.id)
      else
        startRename(session, sidebarVisible && sidebarPanel === "terminals" ? "sidebar" : "header")
    }
  })
  const keyup = useEffectEvent((event: KeyboardEvent): void => {
    if (event.key !== "Control" || !recentSwitcher || recentSwitcher.mode !== "held") return
    if (!visibleRecentSwitcher) {
      setRecentSwitcher(null)
      return
    }
    const id = visibleRecentSwitcher.ids[visibleRecentSwitcher.index]
    setRecentSwitcher(null)
    if (id && sessions.some((session) => session.id === id)) {
      if (visibleRecentSwitcher.fromInput) setKeyboardFocus({ id, view })
      select(id)
    }
  })
  const blur = useEffectEvent((): void => {
    if (recentSwitcher?.mode === "held") setRecentSwitcher(null)
  })
  useEffect(() => {
    window.addEventListener("keydown", workspaceEscape, true)
    window.addEventListener("keydown", workspaceArrows, true)
    window.addEventListener("keydown", keydown)
    window.addEventListener("keyup", keyup)
    window.addEventListener("blur", blur)
    return () => {
      window.removeEventListener("keydown", workspaceEscape, true)
      window.removeEventListener("keydown", workspaceArrows, true)
      window.removeEventListener("keydown", keydown)
      window.removeEventListener("keyup", keyup)
      window.removeEventListener("blur", blur)
    }
  }, [])
}
