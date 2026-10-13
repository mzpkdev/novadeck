import { Check, Circle, X } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

import type { Store } from "../model/store"
import { useWorkspaceServices, useWorkspaceState } from "./controller/context"
import { currentState } from "./selectors"
import { done, hints, noticed, type Seen } from "./visitor-hints"

// Where a visitor gets the app.
const downloadUrl = "https://novadeck.dev"

const Download = ({ className }: { readonly className: string }): React.JSX.Element => (
  <a className={className} href={downloadUrl} target="_blank" rel="noopener noreferrer">
    Download Novadeck
  </a>
)

// A slim strip above the header on a visitor build: it says the agents are simulated, and
// where to get the real app. Part of the page's column, so it covers nothing.
export const VisitorBar = (): React.JSX.Element | null => {
  const { backend } = useWorkspaceServices()
  if (!backend.visitor) return null
  return (
    <div className="visitor-bar flex shrink-0 items-center justify-between gap-3 px-3 text-caption">
      <p className="m-0 min-w-0 truncate">
        <strong className="visitor-bar-mark font-medium">Demo</strong>
        <span aria-hidden="true"> · </span>
        agents are simulated
      </p>
      <Download className="visitor-download shrink-0 font-medium" />
    </div>
  )
}

// The things to try, as a small card that ticks each off and can be dismissed.
export const VisitorHints = (): React.JSX.Element | null => {
  const { backend } = useWorkspaceServices()
  const answered = backend.visitor?.answered
  if (!answered) return null
  return <Hints answered={answered} />
}

const Hints = ({ answered }: { readonly answered: Store<boolean> }): React.JSX.Element | null => {
  const view = useWorkspaceState((workspace) => currentState(workspace).view)
  const companion = useWorkspaceState((workspace) =>
    Object.values(currentState(workspace).bars).some((bar) => bar.open),
  )
  const project = useWorkspaceState((workspace) => workspace.activeProjectId)
  const replied = useSyncExternalStore(answered.subscribe, answered.getSnapshot, () => false)
  const [first] = useState(project)
  const [seen, setSeen] = useState<ReadonlySet<Seen>>(new Set())
  const [open, setOpen] = useState(true)
  // What the person did so far, kept as it shows now.
  const now = noticed(seen, { answered: replied, view, companion, project, first })
  if (now !== seen) setSeen(now)
  if (!open) return null
  const finished = hints.every((hint) => done(hint, seen))
  return (
    <section
      className="visitor-hints card fixed right-3 bottom-10 z-30 w-72 p-3"
      aria-label="Things to try"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="visitor-hints-title m-0 text-control font-medium">
          {finished ? "That's the tour" : "Things to try"}
        </h2>
        <button
          className="icon-button small"
          aria-label="Dismiss the things to try"
          onClick={() => setOpen(false)}
        >
          <X size={14} />
        </button>
      </div>
      <ul className="visitor-hints-list m-0 mt-2 flex flex-col gap-1.5 p-0 text-control">
        {hints.map((hint) => {
          const ticked = done(hint, seen)
          return (
            <li key={hint.id} className="visitor-hint flex items-start gap-2" data-done={ticked}>
              {ticked ? (
                <Check aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
              ) : (
                <Circle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
              )}
              <span>
                {hint.text}
                {ticked && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          )
        })}
      </ul>
      {finished && <Download className="button primary visitor-hints-download mt-3" />}
    </section>
  )
}

// Under about 760px the app has no room to lay out: a panel covers it and points to a
// desktop browser, or the download.
export const VisitorPhone = (): React.JSX.Element | null => {
  const { backend } = useWorkspaceServices()
  if (!backend.visitor) return null
  return (
    <div
      className="visitor-phone fixed inset-0 z-100 items-center justify-center p-6"
      role="region"
      aria-label="Best on a desktop browser"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="visitor-phone-title m-0 text-title font-medium">
          Best on a desktop browser
        </h2>
        <p className="visitor-phone-text m-0 text-body">
          Novadeck lays terminals out in Focus, Grid and Canvas, which needs a window about 760
          pixels wide. Open this page on a computer to try the demo, where the agents are simulated.
        </p>
        <Download className="button primary visitor-phone-download" />
      </div>
    </div>
  )
}
