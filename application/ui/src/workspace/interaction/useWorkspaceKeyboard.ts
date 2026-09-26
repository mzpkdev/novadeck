import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import type { useWorkspaceCommands } from "../../app/useWorkspaceCommands"
import type { useWorkspaceRoute } from "../../app/useWorkspaceRoute"
import { loadCommandBindings } from "../commands/bindings-storage"
import { commandDefinitions, type CommandId } from "../commands/definitions"
import { createCommandRegistry, type CommandArgs } from "../commands/registry"
import type { CanvasHandle } from "../layouts/canvas/Canvas"
import { activeSession, orderedSessions } from "../model/state"
import type { TerminalMetadata, PreferencesValue } from "../model/types"
import { viewModes } from "../preferences/preferences-storage"
import type { useWorkspaceShell } from "../shell/useWorkspaceShell"
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
  onError = () => console.error("Workspace command failed"),
}: {
  routeState: ReturnType<typeof useWorkspaceRoute>
  preferences: PreferencesValue
  shell: ReturnType<typeof useWorkspaceShell>
  rename: ReturnType<typeof useTerminalRename>
  recent: ReturnType<typeof useRecentSwitcher>
  commands: ReturnType<typeof useWorkspaceCommands>
  canvas: RefObject<CanvasHandle | null>
  active: TerminalMetadata | undefined
  onError?: (error: unknown) => void
}) => {
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
  const [bindingOverrides] = useState(loadCommandBindings)
  const nextFocus = view === "focus" ? windowedDestination : "focus"
  const terminalFor = ({ terminalId }: CommandArgs) =>
    sessions.find((item) => item.id === (terminalId ?? selected)) ??
    (!terminalId && view === "focus" ? active : undefined)
  const cycleRecent = (direction: number): void => {
    const ids = visibleRecentSwitcher?.ids ?? recentIds()
    const index =
      ((visibleRecentSwitcher?.index ?? (selected ? 0 : -1)) + direction + ids.length) % ids.length
    setRecentSwitcher({
      context,
      ids,
      index,
      fromInput: visibleRecentSwitcher?.fromInput ?? insideTerminalInput(document.activeElement),
      mode: visibleRecentSwitcher?.mode ?? "held",
    })
  }
  const moveView = (direction: number): void => {
    const modes = viewModes.filter((mode) => preferences.enabledViews.includes(mode))
    const next = modes[(modes.indexOf(view) + direction + modes.length) % modes.length]
    if (next && next !== view) changeView(next)
  }
  const moveTerminal = (direction: number, args: CommandArgs): void => {
    if (!ordered.length) return
    const index = ordered.findIndex((terminal) => terminal.id === selected)
    const next =
      index < 0
        ? direction > 0
          ? 0
          : ordered.length - 1
        : (index + direction + ordered.length) % ordered.length
    const terminal = ordered[next]
    if (!terminal) return
    const target = args.sourceEvent?.target ?? null
    if (view === "canvas" && insideCanvasNode(target)) requestCanvasFocus(terminal.id)
    select(terminal.id)
    if (
      (insideViewSwitch(target) || insideTerminalTab(target)) &&
      sidebarVisible &&
      sidebarPanel === "terminals"
    )
      focusTerminalTab(terminal.id)
  }
  const registry = createCommandRegistry({
    definitions: commandDefinitions(),
    overrides: bindingOverrides,
    available: (id, args) => {
      if (id === "escape") return Boolean(selected || sidebarVisible || view === "canvas")
      if (id === "focus") return Boolean(nextFocus && preferences.enabledViews.includes(nextFocus))
      if (id === "rename" || id === "closeTerminal") return Boolean(terminalFor(args))
      if (id === "recent" || id === "previous")
        return (visibleRecentSwitcher?.ids ?? recentIds()).length > 1
      return true
    },
    context: (event) => ({
      dialog: Boolean(route.dialog),
      editor: insideTerminalRename(event.target),
      workspace: !visibleRecentSwitcher && workspaceShortcutTarget(event.target),
      overlay: workspaceOverlayOpen(),
    }),
    onError,
    handlers: {
      find: () => {
        setRecentSwitcher(null)
        go({ dialog: "search" })
      },
      preferences: () => {
        setRecentSwitcher(null)
        go({ dialog: "preferences", section: "general" })
      },
      newSession: () => {
        setRecentSwitcher(null)
        return startFresh()
      },
      newTerminal: (args) => add({ fromKeyboard: args.fromKeyboard ?? false }),
      terminals: () => {
        setRecentSwitcher(null)
        toggleSidebar("terminals")
      },
      sessions: () => {
        setRecentSwitcher(null)
        toggleSidebar("sessions")
      },
      focus: (args) => {
        if (!nextFocus) return
        if (args.fromKeyboard && insideTerminalInput(document.activeElement) && selected)
          setKeyboardFocus({ id: selected, view: nextFocus })
        return changeView(nextFocus)
      },
      zen: () => (zen ? exitZen() : enterZen()),
      rename: (args) => {
        const terminal = terminalFor(args)
        if (terminal)
          startRename(
            terminal,
            sidebarVisible && sidebarPanel === "terminals" ? "sidebar" : "header",
          )
      },
      closeTerminal: (args) => {
        const terminal = terminalFor(args)
        if (terminal) return close(terminal.id)
      },
      escape: () => {
        if (view === "canvas" && canvas.current?.returnToOrigin()) return
        if (selected) {
          if (view === "focus") setFocusPreview({ context, id: selected })
          setKeyboardFocus(null)
          setSelected("")
          focusWorkspaceViewport()
        } else hideSidebar()
      },
      previousView: () => moveView(-1),
      nextView: () => moveView(1),
      previousTerminal: (args) => moveTerminal(-1, args),
      nextTerminal: (args) => moveTerminal(1, args),
      recent: () => cycleRecent(1),
      previous: () => cycleRecent(-1),
    },
  })
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
    if (!registry.available("escape")) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) registry.execute("escape")
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
    registry.execute(
      horizontal
        ? direction < 0
          ? "previousView"
          : "nextView"
        : direction < 0
          ? "previousTerminal"
          : "nextTerminal",
      { fromKeyboard: true, sourceEvent: event },
    )
  })

  // Keep event identity across xterm's handler and the document listener, even
  // when the first command schedules a new render.
  const accepted = useRef(new WeakSet<KeyboardEvent>())
  const keydown = useEffectEvent((event: KeyboardEvent): boolean => {
    if (accepted.current.has(event)) return true
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      insideTerminalRename(event.target)
    )
      return false
    if (visibleRecentSwitcher && event.key === "Escape") {
      event.preventDefault()
      closeRecentSwitcher()
      accepted.current.add(event)
      return true
    }
    if (visibleRecentSwitcher?.mode === "click" && event.key === "Enter") {
      if (insideSwitcherClose(event.target)) return false
      event.preventDefault()
      const id = visibleRecentSwitcher.ids[visibleRecentSwitcher.index]
      setRecentSwitcher(null)
      if (id) {
        setKeyboardFocus({ id, view })
        select(id)
      }
      accepted.current.add(event)
      return true
    }
    workspaceEscape(event)
    workspaceArrows(event)
    const priorityKey = ["Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      event.key,
    )
    if (event.defaultPrevented || (!priorityKey && registry.handleKey(event))) {
      accepted.current.add(event)
      return true
    }
    return false
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
  useHotkeys(
    "*",
    (event) => {
      keydown(event)
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      ignoreModifiers: true,
      eventListenerOptions: { capture: true },
    },
  )
  useHotkeys(
    "*",
    (event) => {
      keyup(event)
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      ignoreModifiers: true,
      keyup: true,
      keydown: false,
    },
  )
  useEffect(() => {
    window.addEventListener("blur", blur)
    return () => window.removeEventListener("blur", blur)
  }, [])
  return {
    execute: (id: CommandId, args?: CommandArgs) => registry.execute(id, args),
    available: registry.available,
    handleTerminalKey: (event: KeyboardEvent): boolean =>
      event.type === "keydown" ? keydown(event) : false,
  }
}
