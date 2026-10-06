import { useState, type RefObject } from "react"

import { currentPlatform, shortcutBindings, type Shortcut } from "../interaction/shortcuts"
import type { Voice, VoiceModel, VoiceState } from "../model/voice"
import { ConfirmDialog } from "../ui-toolkit/ConfirmDialog"
import { Progress } from "../ui-toolkit/Progress"
import { SegmentGroup } from "../ui-toolkit/SegmentGroup"
import { Select } from "../ui-toolkit/Select"
import { Switch } from "../ui-toolkit/Switch"
import { settingRowClasses, settingsCardClasses } from "./settings"
import {
  checkText,
  formatSize,
  installedSize,
  installSize,
  languages,
  modelNames,
  modelSummaries,
  recommendation,
  stepLabels,
} from "./voice-addon"

export type VoiceAddon = {
  readonly state: VoiceState
  readonly actions: Pick<Voice, "install" | "cancel" | "uninstall" | "set">
}

const models: readonly VoiceModel[] = ["turbo", "small"]
const rowClasses = `preference-row ${settingRowClasses}`
const noteClasses = "settings-description text-[11px] leading-relaxed"

// What the person holds to dictate, when the shortcut list names it.
const dictationKeys = (): string | undefined => {
  const bindings: Partial<Record<string, Shortcut>> = shortcutBindings(currentPlatform())
  return bindings["voice"]?.display.join(" + ")
}

const Row = ({
  id,
  label,
  description,
  children,
}: {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly children?: React.ReactNode
}): React.JSX.Element => (
  <div className={rowClasses}>
    <span className="flex min-w-0 flex-col gap-1">
      <span id={`voice-${id}`}>{label}</span>
      {description && (
        <span id={`voice-${id}-description`} className={noteClasses}>
          {description}
        </span>
      )}
    </span>
    {children}
  </div>
)

// The model chooser, with what the chosen one is like.
const ModelChoice = ({
  label,
  choices,
  value,
  onChange,
  detail,
}: {
  readonly label: string
  readonly choices: readonly VoiceModel[]
  readonly value: VoiceModel
  readonly onChange: (model: VoiceModel) => void
  readonly detail: (model: VoiceModel) => string
}): React.JSX.Element => (
  <Row id="model" label={label} description={`${modelSummaries[value]} ${detail(value)}`.trim()}>
    <SegmentGroup
      label={label}
      items={choices.map((model) => ({ label: modelNames[model], value: model }))}
      value={value}
      onValueChange={(next) => {
        const model = choices.find((item) => item === next)
        if (model) onChange(model)
      }}
      className="flex shrink-0 gap-1"
      itemClassName="flex h-7 min-w-14 items-center justify-center px-2.5 text-[11px]"
      indicatorClassName="absolute"
    />
  </Row>
)

const Installing = ({
  installing,
  onCancel,
}: {
  readonly installing: NonNullable<VoiceState["installing"]>
  readonly onCancel: () => void
}): React.JSX.Element => {
  const { step, received, total, model } = installing
  const label = stepLabels[step]
  return (
    <div
      className={`${rowClasses} flex-col items-stretch gap-2.5`}
      role="group"
      aria-label="Installing"
    >
      <div className="flex items-center justify-between gap-6">
        <span className="flex min-w-0 flex-col gap-1">
          <span>{`${label}${step === "check" ? "" : `: ${step === "model" ? modelNames[model] : "speech engine"}`}`}</span>
          {step !== "check" && (
            <span className={noteClasses}>{`${formatSize(received)} of ${formatSize(total)}`}</span>
          )}
        </span>
        <button
          type="button"
          className="button min-h-8 shrink-0 px-3 text-[11px]"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <Progress label={label} value={step === "check" ? 0 : received} max={total} />
    </div>
  )
}

// Voice input's card in Preferences' Addons tab: install it, choose how it listens, take
// it away. `voice` is absent where the backend has none.
export const VoiceInput = ({
  voice,
  open,
  portalContainer,
}: {
  readonly voice: VoiceAddon | undefined
  // Whether the card is on screen, which its select needs to know to close with the tab.
  readonly open: boolean
  readonly portalContainer: RefObject<HTMLElement | null>
}): React.JSX.Element => {
  const [choice, setChoice] = useState<VoiceModel>("turbo")
  const [selecting, setSelecting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  if (!voice)
    return (
      <div className={settingsCardClasses}>
        <p className={`${rowClasses} m-0 ${noteClasses}`}>Voice input isn't available here.</p>
      </div>
    )
  const { state, actions } = voice
  const { failure, installing, installed } = state
  const failed = failure && (
    <p
      className="settings-note m-0 px-4 py-3 text-[11px] leading-relaxed"
      data-tone="danger"
      role="alert"
    >
      {failure}
    </p>
  )
  if (!state.available)
    return (
      <div className={settingsCardClasses}>
        <p className={`${rowClasses} m-0 ${noteClasses}`}>
          This build has no voice engine for this platform.
        </p>
      </div>
    )
  if (installing)
    return (
      <div className={settingsCardClasses}>
        <Installing installing={installing} onCancel={actions.cancel} />
      </div>
    )
  if (!installed.length)
    return (
      <div className={settingsCardClasses}>
        <ModelChoice
          label="Model"
          choices={models}
          value={choice}
          onChange={setChoice}
          detail={(model) => `Downloads ${formatSize(installSize(state, model))}, with the engine.`}
        />
        <div className={rowClasses}>
          <span className={noteClasses}>Downloads once, then works offline.</span>
          <button
            type="button"
            className="button primary min-h-8 shrink-0 px-3 text-[11px]"
            onClick={() => actions.install(choice)}
          >
            Install
          </button>
        </div>
        {failed}
      </div>
    )
  const other = models.find((model) => !installed.includes(model))
  const keys = dictationKeys()
  const hint = recommendation(state)
  return (
    <>
      <ul className={`m-0 p-0 ${settingsCardClasses}`} aria-label="Voice input">
        <li className={rowClasses}>
          <span className="flex min-w-0 flex-col gap-1">
            <span id="voice-enabled">Enabled</span>
            <span id="voice-enabled-description" className={noteClasses}>
              {keys
                ? `Hold ${keys} in a terminal, or click its microphone, to speak.`
                : "Hold the dictation shortcut in a terminal, or click its microphone, to speak."}
            </span>
          </span>
          <Switch
            checked={state.enabled}
            onChange={(enabled) => actions.set({ enabled })}
            labelledBy="voice-enabled"
            describedBy="voice-enabled-description"
          />
        </li>
        <li>
          <ModelChoice
            label="Model"
            choices={installed}
            value={installed.includes(state.model) ? state.model : installed[0]!}
            onChange={(model) => actions.set({ model })}
            detail={() => ""}
          />
        </li>
        {other && (
          <li className={rowClasses}>
            <span className="flex min-w-0 flex-col gap-1">
              <span>{`Also install ${modelNames[other]}`}</span>
              <span className={noteClasses}>{modelSummaries[other]}</span>
            </span>
            <button
              type="button"
              className="button min-h-8 shrink-0 px-3 text-[11px]"
              onClick={() => actions.install(other)}
            >
              {`Install · ${formatSize(installSize(state, other))}`}
            </button>
          </li>
        )}
        <li>
          <Select
            className={`${rowClasses} [&_[data-part=trigger]]:w-36`}
            label="Language"
            items={languages}
            value={state.language}
            onValueChange={(language) => actions.set({ language })}
            open={open && selecting}
            onOpenChange={setSelecting}
            portalContainer={portalContainer}
          />
        </li>
        {state.check && (
          <li className={rowClasses}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className={noteClasses}>{checkText(state.check)}</span>
              {hint && <span className={noteClasses}>{hint}</span>}
            </span>
          </li>
        )}
        <li className={rowClasses}>
          <span className="flex min-w-0 flex-col gap-1">
            <span>Uninstall</span>
            <span className={noteClasses}>{`Frees ${formatSize(installedSize(state))}.`}</span>
          </span>
          <button
            type="button"
            className="button min-h-8 shrink-0 px-3 text-[11px]"
            onClick={() => setConfirming(true)}
          >
            Uninstall
          </button>
        </li>
        {failure && <li>{failed}</li>}
      </ul>
      <ConfirmDialog
        subject={confirming ? state : null}
        title={() => "Uninstall voice input?"}
        description={(shown) =>
          `The speech engine and its models are removed from this computer, freeing ${formatSize(installedSize(shown))}. You can install them again.`
        }
        confirmLabel="Uninstall"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirming(false)
          actions.uninstall()
        }}
        onCancel={() => setConfirming(false)}
        widthClassName="w-[min(380px,calc(100vw-32px))]"
      />
    </>
  )
}
