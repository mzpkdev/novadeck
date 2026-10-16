import { useEffect, useState, useSyncExternalStore } from "react"

import { CornerCard } from "../ui-toolkit/CornerCard"
import { useWorkspaceServices } from "./controller/context"
import { offerable, offerText, offerView, watchAgentFinishes, workingText } from "./murmur-offer"

// How long "Your terminals name themselves now." stays before the card goes by itself.
export const doneMs = 4000

const never = (): (() => void) => () => {}

// Murmur's one-time offer, in the corner. It comes up once per run of the page, when the
// first agent finishes a turn and Murmur could be on, and downloads nothing until Turn on.
// Closing it or No thanks turns Murmur down for good; Turn on becomes the install's
// progress, then a brief done note, or the failure with Try again. It never takes focus.
export const MurmurOffer = (): React.JSX.Element | null => {
  const { backend, workspace, ui, commands } = useWorkspaceServices()
  const { murmur } = backend
  const state = useSyncExternalStore(murmur?.state.subscribe ?? never, () =>
    murmur?.state.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  // Whether the person pressed Turn on in this card.
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (!murmur) return undefined
    return watchAgentFinishes(workspace, () => {
      if (ui.getSnapshot().addonOfferShown || !offerable(murmur.state.getSnapshot())) return
      commands.markAddonOfferShown()
      setOpen(true)
    })
  }, [murmur, workspace, ui, commands])
  const view = state ? offerView(state, started) : "gone"
  useEffect(() => {
    if (!open || view !== "done") return undefined
    const timer = setTimeout(() => setOpen(false), doneMs)
    return () => clearTimeout(timer)
  }, [open, view])
  if (!murmur || !state || !open || view === "gone") return null
  const hide = (): void => setOpen(false)
  const turnOn = (): void => {
    setStarted(true)
    murmur.install()
  }
  if (view === "working") {
    const received = state.installing?.step === "check" ? 0 : (state.installing?.received ?? 0)
    return (
      <CornerCard
        title={offerText.working}
        progress={{
          label: "Murmur setup",
          value: received,
          max: state.installing?.total ?? 1,
          indeterminate: state.installing === null || state.installing.step === "check",
        }}
        actions={
          <button
            type="button"
            className="button min-h-8 px-3"
            onClick={() => {
              murmur.cancel()
              setStarted(false)
            }}
          >
            Cancel
          </button>
        }
        onClose={hide}
      >
        <p>{workingText(state)}</p>
      </CornerCard>
    )
  }
  if (view === "failed")
    return (
      <CornerCard
        title={offerText.failed}
        announce={`${offerText.failed}. ${state.failure}`}
        urgent
        actions={
          <>
            <button type="button" className="button min-h-8 px-3" onClick={hide}>
              {offerText.later}
            </button>
            <button type="button" className="button primary min-h-8 px-3" onClick={turnOn}>
              {offerText.retry}
            </button>
          </>
        }
        onClose={hide}
      >
        <p className="corner-card-error">{state.failure}</p>
      </CornerCard>
    )
  if (view === "done") return <CornerCard title={offerText.done} onClose={hide} />
  const decline = (): void => {
    murmur.set({ enabled: false })
    hide()
  }
  return (
    <CornerCard
      title={offerText.title}
      note={offerText.size(state)}
      actions={
        <>
          <button type="button" className="button min-h-8 px-3" onClick={decline}>
            {offerText.decline}
          </button>
          <button type="button" className="button primary min-h-8 px-3" onClick={turnOn}>
            {offerText.accept}
          </button>
        </>
      }
      onClose={decline}
    >
      <p className="corner-card-detail">{offerText.body(state)}</p>
      <p className="corner-card-detail corner-card-quiet">{offerText.quiet}</p>
    </CornerCard>
  )
}
