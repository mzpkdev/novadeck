import type { ResponsiveLayouts } from "react-grid-layout"

export type ViewMode = "focus" | "grid" | "canvas"
export type WindowedView = Exclude<ViewMode, "focus">
export type PreferencesValue = { fontSize: number; enabledViews: ViewMode[] }
export type Project = { id: string; name: string; directory: string }
export type Entry = { id: string; command: string; reply: string }

export type Session = {
  id: string
  name: string
  directory: string
  command: string
  process: string
  state: "running" | "idle" | "finished"
  kind: "shell" | "server" | "tests" | "git" | "logs" | "build" | "claude" | "codex"
  x: number
  y: number
  height: number
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
export type GridLayouts = ResponsiveLayouts<GridBreakpoint>

export type SizePreset = "large" | "small"

export type WorkspaceState = {
  sizePresets: Record<WindowedView, Record<string, SizePreset>>
  view: ViewMode
  windowedView: WindowedView
  drafts: Record<string, string>
  scrollOffsets: Record<string, number>
  sessions: Session[]
  tabOrder: string[]
  selected: string
  entries: Record<string, Entry[]>
  cleared: Record<string, boolean>
  canvasLayout: CanvasLayout
  gridLayouts: GridLayouts
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
