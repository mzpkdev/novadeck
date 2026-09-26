export type ViewMode = "focus" | "grid" | "canvas"
export type WindowedView = Exclude<ViewMode, "focus">
export type PreferencesValue = { fontSize: number; enabledViews: ViewMode[] }
export type Project = { id: string; name: string; directory: string }
export type Entry = { id: string; command: string; reply: string }

export type TerminalMetadata = {
  id: string
  name: string
  directory: string
  command: string
  process: string
  state: "running" | "idle" | "finished"
  kind: "shell" | "server" | "tests" | "git" | "logs" | "build" | "claude" | "codex"
}

export type CanvasLayout = {
  viewport?: { x: number; y: number; zoom: number }
  minimized: Record<string, boolean>
  geometry: Record<
    string,
    {
      position: { x: number; y: number }
      measured?: { width?: number; height?: number }
      dragging?: boolean
      resizing?: boolean
      width?: number
      height?: number
    }
  >
}
export type GridBreakpoint = "wide" | "desktop" | "tablet" | "mobile"
export type GridItem = {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
  static?: boolean
  isDraggable?: boolean
  isResizable?: boolean
  resizeHandles?: ("s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne")[]
  isBounded?: boolean
  moved?: boolean
}
export type GridLayouts = Partial<Record<GridBreakpoint, readonly GridItem[]>>
export type GridRestoreWidths = Partial<Record<GridBreakpoint, number>>

export type SizePreset = "large" | "small"

export type WorkspaceState = {
  sizePresets: Record<WindowedView, Record<string, SizePreset>>
  view: ViewMode
  windowedView: WindowedView
  sessions: TerminalMetadata[]
  tabOrder: string[]
  selected: string
  canvasLayout: CanvasLayout
  gridLayouts: GridLayouts
  gridRestoreWidths: Record<string, GridRestoreWidths>
  gridMinimized: Record<string, boolean>
  hidden: Record<string, boolean>
  nextTerminalNumber: number
}
export type WorkspaceSession = {
  id: string
  name: string
  visitedAt: number
  state: WorkspaceState
}
export type WorkspaceProject = Project & { activeSessionId: string; history: WorkspaceSession[] }
export type Workspace = { projects: WorkspaceProject[]; activeProjectId: string }
export type WorkspaceTarget = { projectId: string; workspaceSessionId: string }
