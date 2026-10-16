import { useEffect, useState } from "react"

import { changeFailurePrefix, type VoiceState } from "../model/voice"
import { formatSize, stepLabels } from "../preferences/voice-addon"
import { Chord } from "../ui-toolkit/Chord"
import { CornerCard } from "../ui-toolkit/CornerCard"
import { voiceReady } from "../voice/dictation"

// How long the card that says voice input is ready stays, in milliseconds.
export const readyCardMilliseconds = 6000

// What the card shows of voice input's first install, whoever started it: its progress, how it
// failed, and once it is ready, how to use it. An engine update of voice input that is
// already ready, and a cancelled install, show nothing; a failed one is not a decline, so
// its card offers to try again.
export const VoiceInstallCard = ({
  state,
  keys,
  onInstall,
  onCancel,
}: {
  readonly state: VoiceState
  // The dictation shortcut's keys.
  readonly keys: readonly string[] | undefined
  readonly onInstall: () => void
  readonly onCancel: () => void
}): React.JSX.Element | null => {
  // An install under way was seen, so its end is told: ready, or failed.
  const [seen, setSeen] = useState(false)
  // The failure whose card the person closed.
  const [closed, setClosed] = useState<string | null>(null)
  // The progress card was closed: the install goes on, and Addons shows it.
  const [hidden, setHidden] = useState(false)
  const ready = voiceReady(state)
  const { installing } = state
  if (hidden && !installing) setHidden(false)
  // Only an install's own failure; a setting that was refused is not about setting up. Nor
  // does anything show once the person said no thanks.
  const failure =
    state.wanted && state.failure !== null && !state.failure.startsWith(changeFailurePrefix)
      ? state.failure
      : null
  if (installing !== null && !ready && state.wanted && !seen) setSeen(true)
  // What this card followed ends here unless it ended ready: a cancel, a failure (which has
  // its own card, and Try again follows a new install), or a decline.
  if (seen && !installing && !ready) setSeen(false)
  if (seen && !state.wanted) setSeen(false)
  const showsReady = seen && !installing && ready && state.wanted
  useEffect(() => {
    if (!showsReady) return undefined
    const timer = setTimeout(() => setSeen(false), readyCardMilliseconds)
    return () => clearTimeout(timer)
  }, [showsReady])

  if (installing && !ready && state.wanted) {
    if (hidden) return null
    const { step, received, total } = installing
    return (
      <CornerCard
        title="Setting up voice input"
        {...(step !== "check" && {
          progress: { label: stepLabels[step], value: received, max: total },
        })}
        note={step === "check" ? "Checking" : `${formatSize(received)} of ${formatSize(total)}`}
        onClose={() => setHidden(true)}
        actions={
          <button
            type="button"
            className="button min-h-8 px-3"
            onClick={() => {
              setSeen(false)
              onCancel()
            }}
          >
            Cancel
          </button>
        }
      >
        <p className="corner-card-detail">
          {step === "check"
            ? "Checking that it works…"
            : `${stepLabels[step]} · ${formatSize(received)} of ${formatSize(total)}`}
        </p>
      </CornerCard>
    )
  }
  if (failure && !ready && failure !== closed)
    return (
      <CornerCard
        title="Voice input didn't install"
        note="Download failed"
        urgent
        onClose={() => setClosed(failure)}
        actions={
          <>
            <button
              type="button"
              className="button min-h-8 px-3"
              onClick={() => setClosed(failure)}
            >
              Not now
            </button>
            <button
              type="button"
              className="button primary min-h-8 px-3"
              onClick={() => {
                setClosed(null)
                onInstall()
              }}
            >
              Try again
            </button>
          </>
        }
      >
        <p className="corner-card-error corner-card-detail">{failure}</p>
      </CornerCard>
    )
  if (showsReady)
    return (
      <CornerCard
        title="Voice input ready"
        {...(keys && { note: `Hold ${keys.join(" ")} to talk` })}
        onClose={() => setSeen(false)}
      >
        <p className="corner-card-detail">
          {keys ? (
            <>
              Hold <Chord keys={keys} /> to talk.
            </>
          ) : (
            "Click the mic in a terminal to talk."
          )}
        </p>
      </CornerCard>
    )
  return null
}
