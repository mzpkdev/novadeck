import type {
  CanvasLayout,
  Entry,
  GridLayouts,
  PreferencesValue,
  Project,
  Session,
  ViewMode,
  WindowedView,
  Workspace,
  WorkspaceProject,
  WorkspaceSession,
  WorkspaceState,
  WorkspaceTarget,
} from "./types"

export type ValueUpdate<Value> = Value | ((previous: Value) => Value)

export type WorkspaceSessionInput = {
  name: string
  state: WorkspaceState
}

export type WorkspaceActionMetadata = { id: string; now: number }

export type WorkspaceAction =
  | ({ type: "project/add"; project: Project; enabledViews?: ViewMode[] } & (
      | { activate: true; initialSession: WorkspaceSession }
      | { activate?: false; initialSession?: WorkspaceSession }
    ))
  | {
      type: "project/select"
      projectId: string
      now: number
      initialSession?: WorkspaceSession
      enabledViews?: ViewMode[]
    }
  | { type: "session/add"; projectId: string; session: WorkspaceSession; activate?: boolean }
  | {
      type: "session/select"
      projectId: string
      workspaceSessionId: string
      now: number
      enabledViews?: ViewMode[]
    }
  | { type: "terminal/add"; target: WorkspaceTarget; session: Session }
  | { type: "terminal/rename"; target: WorkspaceTarget; terminalId: string; name: string }
  | { type: "terminal/close"; target: WorkspaceTarget; terminalId: string }
  | { type: "terminal/reorder"; target: WorkspaceTarget; tabOrder: string[] }
  | { type: "terminal/select"; target: WorkspaceTarget; terminalId: string }
  | { type: "terminal/draft"; target: WorkspaceTarget; terminalId: string; draft: string }
  | { type: "terminal/scroll"; target: WorkspaceTarget; terminalId: string; offset: number }
  | { type: "terminal/output-clear"; target: WorkspaceTarget; terminalId: string }
  | { type: "terminal/output-entry"; target: WorkspaceTarget; terminalId: string; entry: Entry }
  | {
      type: "view/change"
      target: WorkspaceTarget
      view: ViewMode
      enabledViews: ViewMode[]
      rememberWindowed?: boolean
    }
  | { type: "preferences/reconcile"; target: WorkspaceTarget; preferences: PreferencesValue }
  | { type: "canvas/layout"; target: WorkspaceTarget; layout: ValueUpdate<CanvasLayout> }
  | { type: "grid/layouts"; target: WorkspaceTarget; layouts: ValueUpdate<GridLayouts> }

export const createWorkspaceSession = (
  input: WorkspaceSessionInput,
  metadata: WorkspaceActionMetadata,
): WorkspaceSession => ({
  id: metadata.id,
  name: input.name,
  visitedAt: metadata.now,
  state: input.state,
})

export const createSessionState = (
  sessions: Session[],
  view: ViewMode,
  windowedView: WindowedView,
): WorkspaceState => ({
  view,
  windowedView,
  drafts: {},
  scrollOffsets: {},
  sessions,
  tabOrder: [],
  selected: sessions[0]?.id ?? "",
  entries: {},
  cleared: {},
  canvasLayout: { geometry: {}, minimized: {} },
  gridLayouts: {},
  nextSession: sessions.length + 1,
})

export const createWorkspace = ({
  projects,
  activeProjectId,
}: {
  projects: Project[]
  activeProjectId: string
}): Workspace => ({
  projects: projects.map((project) => ({ ...project, activeSessionId: "", history: [] })),
  activeProjectId,
})

export const activeProject = (workspace: Workspace): WorkspaceProject | undefined =>
  workspace.projects.find((project) => project.id === workspace.activeProjectId)

export const activeSession = (workspace: Workspace): WorkspaceSession | undefined => {
  const project = activeProject(workspace)
  return project?.history.find((session) => session.id === project.activeSessionId)
}

export const orderedSessions = (state: WorkspaceState): Session[] => {
  const byId = new Map(state.sessions.map((session) => [session.id, session]))
  const ordered = state.tabOrder.flatMap((id) => {
    const session = byId.get(id)
    return session ? [session] : []
  })
  const orderedIds = new Set(ordered.map((session) => session.id))
  return [...ordered, ...state.sessions.filter((session) => !orderedIds.has(session.id))]
}

export const reconcileView = (state: WorkspaceState, enabledViews: ViewMode[]): WorkspaceState => {
  if (enabledViews.includes(state.view)) return state
  const view = enabledViews.includes(state.windowedView) ? state.windowedView : enabledViews[0]
  return view ? { ...state, view } : state
}

const updateProject = (
  workspace: Workspace,
  projectId: string,
  update: (project: WorkspaceProject) => WorkspaceProject,
): Workspace => {
  const index = workspace.projects.findIndex((project) => project.id === projectId)
  if (index < 0) return workspace
  const project = workspace.projects[index]!
  const next = update(project)
  if (next === project) return workspace
  const projects = [...workspace.projects]
  projects[index] = next
  return { ...workspace, projects }
}

const updateTarget = (
  workspace: Workspace,
  target: WorkspaceTarget,
  update: (state: WorkspaceState) => WorkspaceState,
): Workspace =>
  updateProject(workspace, target.projectId, (project) => {
    const index = project.history.findIndex((session) => session.id === target.workspaceSessionId)
    if (index < 0) return project
    const session = project.history[index]!
    const state = update(session.state)
    if (state === session.state) return project
    const history = [...project.history]
    history[index] = { ...session, state }
    return { ...project, history }
  })

const apply = <Value>(value: Value, update: ValueUpdate<Value>): Value =>
  typeof update === "function" ? (update as (previous: Value) => Value)(value) : update

const hasTerminal = (state: WorkspaceState, terminalId: string): boolean =>
  state.sessions.some((session) => session.id === terminalId)

const expectedTerminalId = (nextSession: number): string => String(nextSession).padStart(2, "0")

const allViews: ViewMode[] = ["focus", "grid", "canvas"]

const enabled = (views?: ViewMode[]): ViewMode[] => (views?.length ? views : allViews)

const withoutKey = <Value>(values: Record<string, Value>, key: string): Record<string, Value> => {
  if (!(key in values)) return values
  const next = { ...values }
  delete next[key]
  return next
}

const withoutGridItem = (layouts: GridLayouts, terminalId: string): GridLayouts => {
  let changed = false
  const next = Object.fromEntries(
    Object.entries(layouts).map(([breakpoint, layout]) => {
      const remaining = layout.filter((item) => item.i !== terminalId)
      changed ||= remaining.length !== layout.length
      return [breakpoint, remaining]
    }),
  ) as GridLayouts
  return changed ? next : layouts
}

const pruneCanvasLayout = (layout: CanvasLayout, sessions: Session[]): CanvasLayout => {
  const ids = new Set(sessions.map((session) => session.id))
  const geometry = Object.fromEntries(
    Object.entries(layout.geometry).filter(([id]) => ids.has(id)),
  ) as CanvasLayout["geometry"]
  const minimized = Object.fromEntries(
    Object.entries(layout.minimized).filter(([id]) => ids.has(id)),
  ) as CanvasLayout["minimized"]
  return Object.keys(layout.geometry).every((id) => ids.has(id)) &&
    Object.keys(layout.minimized).every((id) => ids.has(id))
    ? layout
    : { ...layout, geometry, minimized }
}

const pruneGridLayouts = (layouts: GridLayouts, sessions: Session[]): GridLayouts => {
  const ids = new Set(sessions.map((session) => session.id))
  const next = Object.fromEntries(
    Object.entries(layouts).map(([breakpoint, layout]) => [
      breakpoint,
      layout.filter((item) => ids.has(item.i)),
    ]),
  ) as GridLayouts
  return Object.entries(layouts).every(
    ([breakpoint, layout]) => next[breakpoint as keyof GridLayouts]?.length === layout.length,
  )
    ? layouts
    : next
}

const restoreView = (state: WorkspaceState, enabledViews?: ViewMode[]): WorkspaceState => {
  const views = enabled(enabledViews)
  return views.includes(state.view) ? state : { ...state, view: views[0]! }
}

const visit = (project: WorkspaceProject, id: string, now: number): WorkspaceProject => ({
  ...project,
  history: project.history.map((session) =>
    session.id === id ? { ...session, visitedAt: now } : session,
  ),
})

const closeTerminal = (state: WorkspaceState, terminalId: string): WorkspaceState => {
  if (!hasTerminal(state, terminalId)) return state
  const sessions = orderedSessions(state)
  const index = sessions.findIndex((session) => session.id === terminalId)
  const remaining = sessions.filter((session) => session.id !== terminalId)
  const selected =
    state.selected === terminalId
      ? ((remaining[index] ?? remaining[index - 1])?.id ?? "")
      : state.selected
  const geometry = withoutKey(state.canvasLayout.geometry, terminalId)
  const minimized = withoutKey(state.canvasLayout.minimized, terminalId)
  return {
    ...state,
    sessions: state.sessions.filter((session) => session.id !== terminalId),
    tabOrder: state.tabOrder.filter((id) => id !== terminalId),
    selected,
    entries: withoutKey(state.entries, terminalId),
    cleared: withoutKey(state.cleared, terminalId),
    drafts: withoutKey(state.drafts, terminalId),
    scrollOffsets: withoutKey(state.scrollOffsets, terminalId),
    canvasLayout:
      geometry === state.canvasLayout.geometry && minimized === state.canvasLayout.minimized
        ? state.canvasLayout
        : { ...state.canvasLayout, geometry, minimized },
    gridLayouts: withoutGridItem(state.gridLayouts, terminalId),
  }
}

export const workspaceReducer = (workspace: Workspace, action: WorkspaceAction): Workspace => {
  switch (action.type) {
    case "project/add": {
      if (action.activate && !action.initialSession) return workspace
      if (workspace.projects.some((project) => project.id === action.project.id)) return workspace
      const initial = action.initialSession
        ? {
            ...action.initialSession,
            state: restoreView(action.initialSession.state, action.enabledViews),
          }
        : undefined
      const projects =
        action.activate && initial
          ? workspace.projects.map((project) =>
              project.id === workspace.activeProjectId
                ? visit(project, project.activeSessionId, initial.visitedAt)
                : project,
            )
          : workspace.projects
      return {
        ...workspace,
        activeProjectId: action.activate ? action.project.id : workspace.activeProjectId,
        projects: [
          ...projects,
          {
            ...action.project,
            activeSessionId: initial?.id ?? "",
            history: initial ? [initial] : [],
          },
        ],
      }
    }
    case "project/select": {
      const project = workspace.projects.find((item) => item.id === action.projectId)
      if (!project || (!project.history.length && !action.initialSession)) return workspace
      const seeded =
        !project.history.length && action.initialSession
          ? {
              ...project,
              activeSessionId: action.initialSession.id,
              history: [action.initialSession],
            }
          : project
      const restored = visit(seeded, seeded.activeSessionId, action.now)
      const next = {
        ...restored,
        history: restored.history.map((session) =>
          session.id === restored.activeSessionId
            ? { ...session, state: restoreView(session.state, action.enabledViews) }
            : session,
        ),
      }
      const projects = workspace.projects.map((item) => {
        if (item.id === project.id) return next
        return item.id === workspace.activeProjectId
          ? visit(item, item.activeSessionId, action.now)
          : item
      })
      return { ...workspace, projects, activeProjectId: action.projectId }
    }
    case "session/add":
      return updateProject(workspace, action.projectId, (project) => {
        if (project.history.some((session) => session.id === action.session.id)) return project
        const previous =
          action.activate === false
            ? project
            : visit(project, project.activeSessionId, action.session.visitedAt)
        return {
          ...previous,
          history: [action.session, ...previous.history],
          activeSessionId: action.activate === false ? previous.activeSessionId : action.session.id,
        }
      })
    case "session/select":
      return updateProject(workspace, action.projectId, (project) => {
        const session = project.history.find((item) => item.id === action.workspaceSessionId)
        if (!session) return project
        const visited = visit(project, project.activeSessionId, action.now)
        const selected = visit(visited, session.id, action.now)
        return {
          ...selected,
          activeSessionId: session.id,
          history: selected.history.map((item) =>
            item.id === session.id
              ? { ...item, state: restoreView(item.state, action.enabledViews) }
              : item,
          ),
        }
      })
    case "terminal/add":
      return updateTarget(workspace, action.target, (state) => {
        if (
          hasTerminal(state, action.session.id) ||
          action.session.id !== expectedTerminalId(state.nextSession)
        )
          return state
        return {
          ...state,
          sessions: [...state.sessions, action.session],
          cleared: { ...state.cleared, [action.session.id]: true },
          selected: action.session.id,
          nextSession: state.nextSession + 1,
        }
      })
    case "terminal/rename":
      return updateTarget(workspace, action.target, (state) => {
        if (!hasTerminal(state, action.terminalId)) return state
        return {
          ...state,
          sessions: state.sessions.map((session) =>
            session.id === action.terminalId ? { ...session, name: action.name } : session,
          ),
        }
      })
    case "terminal/close":
      return updateTarget(workspace, action.target, (state) =>
        closeTerminal(state, action.terminalId),
      )
    case "terminal/reorder":
      return updateTarget(workspace, action.target, (state) => {
        const seen = new Set<string>()
        const tabOrder = action.tabOrder.filter(
          (id) => hasTerminal(state, id) && !seen.has(id) && (seen.add(id), true),
        )
        return tabOrder.every((id, index) => state.tabOrder[index] === id) &&
          tabOrder.length === state.tabOrder.length
          ? state
          : { ...state, tabOrder }
      })
    case "terminal/select":
      return updateTarget(workspace, action.target, (state) =>
        (hasTerminal(state, action.terminalId) || action.terminalId === "") &&
        state.selected !== action.terminalId
          ? { ...state, selected: action.terminalId }
          : state,
      )
    case "terminal/draft":
      return updateTarget(workspace, action.target, (state) =>
        hasTerminal(state, action.terminalId) && state.drafts[action.terminalId] !== action.draft
          ? { ...state, drafts: { ...state.drafts, [action.terminalId]: action.draft } }
          : state,
      )
    case "terminal/scroll":
      return updateTarget(workspace, action.target, (state) =>
        hasTerminal(state, action.terminalId) &&
        state.scrollOffsets[action.terminalId] !== action.offset
          ? {
              ...state,
              scrollOffsets: { ...state.scrollOffsets, [action.terminalId]: action.offset },
            }
          : state,
      )
    case "terminal/output-clear":
      return updateTarget(workspace, action.target, (state) =>
        hasTerminal(state, action.terminalId)
          ? {
              ...state,
              cleared: { ...state.cleared, [action.terminalId]: true },
              entries: { ...state.entries, [action.terminalId]: [] },
            }
          : state,
      )
    case "terminal/output-entry":
      return updateTarget(workspace, action.target, (state) =>
        hasTerminal(state, action.terminalId)
          ? {
              ...state,
              entries: {
                ...state.entries,
                [action.terminalId]: [...(state.entries[action.terminalId] ?? []), action.entry],
              },
            }
          : state,
      )
    case "view/change":
      return updateTarget(workspace, action.target, (state) => {
        if (!action.enabledViews.includes(action.view)) return state
        return {
          ...state,
          view: action.view,
          ...(action.view === "focus" || action.rememberWindowed === false
            ? {}
            : { windowedView: action.view }),
        }
      })
    case "preferences/reconcile":
      return updateTarget(workspace, action.target, (state) =>
        reconcileView(state, action.preferences.enabledViews),
      )
    case "canvas/layout":
      return updateTarget(workspace, action.target, (state) => {
        const canvasLayout = pruneCanvasLayout(
          apply(state.canvasLayout, action.layout),
          state.sessions,
        )
        return canvasLayout === state.canvasLayout ? state : { ...state, canvasLayout }
      })
    case "grid/layouts":
      return updateTarget(workspace, action.target, (state) => {
        const gridLayouts = pruneGridLayouts(
          apply(state.gridLayouts, action.layouts),
          state.sessions,
        )
        return gridLayouts === state.gridLayouts ? state : { ...state, gridLayouts }
      })
  }
}
