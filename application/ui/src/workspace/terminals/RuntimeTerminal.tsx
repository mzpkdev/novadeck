import { useCallback, useSyncExternalStore } from "react"

import type { WorkspaceTarget } from "../model/types"
import type { TerminalRuntimeStore } from "../runtime/store"
import { Terminal, type TerminalProps } from "./Terminal"

export type RuntimeTerminalProps = Omit<
  TerminalProps,
  | "entries"
  | "cleared"
  | "onCommand"
  | "draft"
  | "onDraftChange"
  | "scrollOffset"
  | "onScrollChange"
> & {
  runtime: TerminalRuntimeStore
  target: WorkspaceTarget
}

export const RuntimeTerminal = ({
  runtime,
  target,
  ...props
}: RuntimeTerminalProps): React.JSX.Element => {
  const { projectId, workspaceSessionId } = target
  const terminalId = props.session.id
  const key = { projectId, workspaceSessionId, terminalId }
  const subscribe = useCallback(
    (listener: () => void) =>
      runtime.subscribe({ projectId, workspaceSessionId, terminalId }, listener),
    [runtime, projectId, workspaceSessionId, terminalId],
  )
  const getSnapshot = useCallback(
    () => runtime.getSnapshot({ projectId, workspaceSessionId, terminalId }),
    [runtime, projectId, workspaceSessionId, terminalId],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return (
    <Terminal
      {...props}
      {...snapshot}
      onDraftChange={(draft) => runtime.setDraft(key, draft)}
      onScrollChange={(offset) => runtime.setScrollOffset(key, offset)}
      onCommand={(command) => runtime.run(key, command)}
    />
  )
}
