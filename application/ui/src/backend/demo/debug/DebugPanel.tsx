// The demo's debug panel: puts the demo in the states the real backend can be in, for
// manual checks. A round button at the bottom of the page, in the middle, opens and
// closes it, as dev toolbars do; see README "Debug panel".
import { Bug } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"

import type { Workspace } from "../../../model/types"
import type { BackendSink, DebugPanelProps } from "../../port"
import { shellGroups } from "./shell-groups"
import type { DemoActionContext, DemoStates } from "./types"
import type { DemoLaunch, DemoShell } from "./with-debug"

export const createDebugPanel = ({
  launch,
  shell,
  states,
  dispatch,
  workspace,
}: {
  readonly launch: DemoLaunch
  readonly shell: DemoShell
  readonly states: DemoStates
  readonly dispatch: () => BackendSink["dispatch"] | undefined
  readonly workspace: () => Workspace | undefined
}) => {
  const { Notices } = states
  const DebugPanel = ({
    addTerminal,
    startFresh,
    selected,
  }: DebugPanelProps): React.JSX.Element => {
    const [open, setOpen] = useState(false)
    const [terminals, setTerminals] = useState(shell.terminals)
    const [note, setNote] = useState("")
    const connection = useSyncExternalStore(
      shell.connection.subscribe,
      shell.connection.getSnapshot,
    )
    const crashes = useSyncExternalStore(shell.crashes.subscribe, shell.crashes.getSnapshot)

    useEffect(() => {
      if (!open) return
      const timer = setInterval(() => setTerminals(shell.terminals()), 500)
      return () => clearInterval(timer)
    }, [open])

    const context = (): DemoActionContext => ({
      selected,
      addTerminal,
      startFresh,
      dispatch: dispatch(),
      workspace,
      note: setNote,
    })
    const groups = [...shellGroups({ launch, shell, states }), ...states.groups]

    // Mounted while closed too: the button, and where the demo's notifications appear.
    return (
      <>
        <Notices />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="debug-panel"
          aria-label={open ? "Close the debug panel" : "Open the debug panel"}
          className="debug-floater fixed bottom-12 left-1/2 z-50 flex size-10 -translate-x-1/2 items-center justify-center"
          onClick={() => {
            setTerminals(shell.terminals())
            setOpen((value) => !value)
          }}
        >
          <Bug size={18} aria-hidden />
        </button>
        {open && (
          <aside
            id="debug-panel"
            aria-label="Debug panel"
            className="debug-panel floating fixed right-3 bottom-10 z-50 flex max-h-[80vh] w-80 flex-col gap-3 overflow-y-auto p-3 text-[11px]"
          >
            <header className="flex items-center justify-between">
              <strong className="text-[12px]">Debug</strong>
              <button type="button" className="debug-close" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>
            <p className="debug-meta m-0 text-[10px] leading-[1.5]">
              demo {launch.variant} · {connection} · crashes {crashes} · terminals {terminals}
            </p>
            {groups.map(({ title, actions }) => (
              <section key={title} className="flex flex-col gap-1.5">
                <h2 className="debug-heading m-0 text-[10px] font-semibold">{title}</h2>
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="debug-action flex flex-col items-start gap-0.5 px-2 py-1.5 text-left"
                    onClick={() => {
                      setNote("")
                      void Promise.resolve(action.run(context())).catch((error: unknown) =>
                        setNote(String(error)),
                      )
                    }}
                  >
                    <span className="font-medium">{action.label}</span>
                    <span className="debug-hint text-[10px]">{action.hint}</span>
                  </button>
                ))}
              </section>
            ))}
            {note && <p className="debug-hint m-0 text-[10px]">{note}</p>}
          </aside>
        )}
      </>
    )
  }
  return DebugPanel
}
