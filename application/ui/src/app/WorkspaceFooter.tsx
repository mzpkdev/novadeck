import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import type { Backend, BackendConnectionState } from "../backend/port"
import { accountUsage, movedOrder, nextAccountReset } from "../model/account-usage"
import type { Workspace } from "../model/types"
import { offerToFetch } from "../model/update"
import { readSubscriptionOrder, writeSubscriptionOrder } from "../shell/shell-storage"
import { SubscriptionUsage } from "../shell/SubscriptionUsage"
import { WorkspaceFooter as Footer, type FooterStatus } from "../shell/WorkspaceFooter"
import { useUiState, useWorkspaceServices, useWorkspaceState } from "./controller/context"
import { crashLoopQuestion, currentState, sameItems, shallowEqual } from "./selectors"

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
  const { backend, commands, workspace: store } = useWorkspaceServices()
  const { updates, portable: portableHost } = backend
  const connection = useConnection(backend.connection)
  const crashes = useUiState((state) => state.crashLoop)
  const offer = useUiState((state) => state.update)
  const downloaded = useUiState((state) => state.downloaded)
  const updateOpen = useUiState((state) => state.updateOpen)
  const sandbox = useUiState((state) => state.sandbox)
  const sandboxOpen = useUiState((state) => state.sandboxOpen)
  const portableState = useUiState((state) => state.portable)
  const portable = portableState?.portable === true
  // A host that can say it is portable has not yet: the sandbox chip waits, so it does not
  // flash on a copy whose install entry replaces it.
  const portablePending = useUiState((state) => state.portable === null) && !!portableHost
  // A dialog, the switcher or a question holds the notice back until it is answered.
  const asking = useUiState(
    (state) =>
      state.location.route.dialog !== null ||
      state.closing !== null ||
      state.recent.switcher !== null ||
      crashLoopQuestion(state) > 0,
  )
  const welcome = useSyncExternalStore(
    backend.agents?.welcome.subscribe ?? always,
    () => backend.agents?.welcome.getSnapshot() ?? false,
  )
  const zen = useUiState((state) => Boolean(state.shell.zen))
  const navigate = useUiState((state) => state.shell.navigate)
  const fetchable = offerToFetch(offer, downloaded)
  const { count, running } = useWorkspaceState((workspace) => {
    const { terminals } = currentState(workspace).roster
    return {
      // Windows undocked from a terminal's companion aren't terminals.
      count: terminals.length,
      running: terminals.filter((terminal) => terminal.state === "running").length,
    }
  }, shallowEqual)
  const terminals = useWorkspaceState(allTerminals, sameItems)
  // The order the person left the subscriptions in, kept for their next visit.
  const [order, setOrder] = useState(readSubscriptionOrder)
  // The time windows are measured against, moved on as the soonest one resets, so it
  // drops out then though no agent reports anything new.
  const [now, setNow] = useState(Date.now)
  const accounts = useMemo(() => accountUsage(terminals, now, order), [terminals, now, order])
  const nextReset = nextAccountReset(accounts)
  useEffect(() => {
    if (nextReset === undefined) return undefined
    // A timer waits at most about 24.8 days; a reset further off is waited for in turns.
    const longest = 2 ** 31 - 1
    let timer: ReturnType<typeof setTimeout>
    const wait = (): void => {
      const left = Math.max(0, nextReset - Date.now()) + 50
      timer = setTimeout(left > longest ? wait : () => setNow(Date.now()), Math.min(left, longest))
    }
    wait()
    return () => clearTimeout(timer)
  }, [nextReset])
  const move = (from: number, to: number): void => {
    const next = movedOrder(accounts, order, from, to)
    setOrder(next)
    writeSubscriptionOrder(next)
  }
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
      // A copy that updates itself shows only its downloads; a portable one, which can't,
      // has its install entry, with the release it is missing.
      progress={updates && !portable ? offer : null}
      noticeOpen={sandboxOpen}
      available={
        updates && !portable && !portablePending && fetchable
          ? { version: fetchable.version, onOpenPage: updates.openPage }
          : undefined
      }
      update={
        portable && portableHost
          ? {
              offer: updates ? (offer ?? undefined) : undefined,
              portable: {
                // The install entry covers the sandbox notice a portable copy would show.
                unsandboxed: sandbox !== null && !sandbox.sandboxed,
                onInstall: portableHost.install,
                installed: portableState?.portable === true && portableState.installed,
                ...(portableHost.onProgress && { onProgress: portableHost.onProgress }),
              },
              open: updateOpen,
              blocked: asking || welcome || sandboxOpen,
              onOpenChange: commands.setUpdateOpen,
              onShown: commands.updateShown,
              returnFocus: () => {
                const { selected, view } = currentState(store.getSnapshot())
                if (!selected) return false
                commands.setKeyboardFocus({ id: selected, view })
                return true
              },
            }
          : undefined
      }
      sandbox={
        sandbox && !sandbox.sandboxed && !portable && !portablePending
          ? {
              fix: sandbox.fix,
              open: sandboxOpen,
              blocked: asking || welcome,
              onOpenChange: commands.setSandboxOpen,
            }
          : undefined
      }
      usage={<SubscriptionUsage accounts={accounts} onMove={move} />}
    />
  )
})
