import { memo, useSyncExternalStore } from "react"

import type { Store } from "../model/store"
import { WorkspaceFooter as Footer, type FooterStatus } from "../shell/WorkspaceFooter"
import { useUiState, useWorkspaceServices, useWorkspaceState } from "./controller/context"
import { currentState, shallowEqual } from "./selectors"

const always = (): (() => void) => () => {}
const useOptionalStore = <Value,>(store: Store<Value> | undefined, fallback: Value): Value =>
  useSyncExternalStore(store?.subscribe ?? always, () => store?.getSnapshot() ?? fallback)

// The footer wired to the workspace's counts and the backend's link.
export const WorkspaceFooter = memo((): React.JSX.Element => {
  const { backend, commands } = useWorkspaceServices()
  const connection = useOptionalStore(backend.connection, "connected")
  const crashes = useOptionalStore(backend.runnerCrashes, 0)
  const zen = useUiState((state) => Boolean(state.shell.zen))
  const { count, running } = useWorkspaceState((workspace) => {
    const { terminals } = currentState(workspace).roster
    return {
      count: terminals.length,
      running: terminals.filter((terminal) => terminal.state === "running").length,
    }
  }, shallowEqual)
  const status: FooterStatus = crashes
    ? "restarting"
    : connection === "connected"
      ? "ok"
      : connection
  return (
    <Footer
      hidden={zen}
      count={count}
      running={running}
      status={status}
      onRetry={backend.retryAfterCrashLoop ? commands.retryAfterCrashLoop : undefined}
    />
  )
})
