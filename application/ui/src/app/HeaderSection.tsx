import { transitionWorkspace } from "../layouts/transition"
import { viewModes } from "../preferences/preferences-storage"
import { WorkspaceHeader } from "../shell/WorkspaceHeader"
import { useWorkspace } from "./controller/context"
import { routeUrl } from "./routing"

// The app header wired to the workspace: projects, views, search and preferences.
export const HeaderSection = (): React.JSX.Element => {
  const { workspace, project, session, route, navigation, preferences, shell, recent, commands } =
    useWorkspace()
  const { go } = navigation
  const { view } = session.state
  const projects = workspace.projects
  const { zen, enterZen } = shell
  const { setRecentSwitcher } = recent
  const { switchProject, changeView } = commands
  return (
    <WorkspaceHeader
      hidden={Boolean(zen)}
      onZen={enterZen}
      view={view}
      enabledViews={preferences.enabledViews}
      projects={projects}
      project={project}
      onProjectSelect={(id) => {
        const next = projects.find((item) => item.id === id)
        if (next) switchProject(next)
      }}
      onViewChange={(id) => {
        if (view === id) return
        const direction = viewModes.indexOf(id) > viewModes.indexOf(view) ? 1 : -1
        transitionWorkspace(() => changeView(id), direction)
      }}
      homeTo={routeUrl({ ...route, view: preferences.enabledViews[0]!, dialog: null })}
      onSearch={() => {
        setRecentSwitcher(null)
        go({ dialog: "search" })
      }}
      onPreferences={() => {
        setRecentSwitcher(null)
        go({ dialog: "preferences", section: "general" })
      }}
    />
  )
}
