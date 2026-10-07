import { memo, useMemo, useSyncExternalStore } from "react"

import type { Backend, BackendConnectionState } from "../backend/port"
import { accountUsage, nextAccountReset } from "../model/account-usage"
import type { Workspace } from "../model/types"
import { SubscriptionUsage } from "../shell/SubscriptionUsage"
import { WorkspaceFooter as Footer, type FooterStatus } from "../shell/WorkspaceFooter"
import { useRenderAt } from "../terminals/use-render-at"
import { useUiState, useWorkspaceServices, useWorkspaceState } from "./controller/context"
import { currentState, sameItems, shallowEqual } from "./selectors"

const always = (): (() => void) => () => {}
// The link's state, connected where the backend reports none.
const useConnection = (connection: Backend["connection"]): BackendConnectionState =>
  useSyncExternalStore(
    connection?.subscribe ?? always,
    () => connection?.getSnapshot() ?? "connected",
  )

// Every terminal in every session: subscriptions are the account's, whichever reports them.
const allTerminals = (workspace: Workspace) =>
  workspace.projects.flatMap((project) =>
    project.history.flatMap((session) => session.state.roster.terminals),
  )

// The footer wired to the workspace's counts, the account's subscriptions and the
// backend's link.
export const WorkspaceFooter = memo((): React.JSX.Element => {
  const { backend, commands } = useWorkspaceServices()
  const connection = useConnection(backend.connection)
  const crashes = useUiState((state) => state.crashLoop)
  const zen = useUiState((state) => Boolean(state.shell.zen))
  const navigate = useUiState((state) => state.shell.navigate)
  const { count, running } = useWorkspaceState((workspace) => {
    const { terminals } = currentState(workspace).roster
    return {
      // Windows undocked from a terminal's companion aren't terminals.
      count: terminals.length,
      running: terminals.filter((terminal) => terminal.state === "running").length,
    }
  }, shallowEqual)
  const terminals = useWorkspaceState(allTerminals, sameItems)
  const accounts = useMemo(() => accountUsage(terminals), [terminals])
  // A window that resets drops out then, though no agent reports anything new.
  useRenderAt(nextAccountReset(accounts))
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
      navigate={navigate}
      onRetry={backend.crashLoop ? commands.retryAfterCrashLoop : undefined}
      usage={<SubscriptionUsage accounts={accounts} />}
    />
  )
})
