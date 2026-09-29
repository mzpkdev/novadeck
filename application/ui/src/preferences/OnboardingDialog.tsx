import { ArrowRight, Check, RotateCcw, Sparkles } from "lucide-react"
import { useRef, useState, type RefObject } from "react"

import { deckName, DeckMark, DeckWordmark } from "../ui-toolkit/DeckLogo"
import { Dialog, DialogDescription, DialogTitle } from "../ui-toolkit/Dialog"
import { ClaudeIcon } from "../ui-toolkit/icons/ClaudeIcon"
import { CodexIcon } from "../ui-toolkit/icons/CodexIcon"
import { agentLabels, type AgentSwitch } from "./AgentSwitches"
import { OnboardingPreview } from "./OnboardingPreview"

import motion from "../ui-toolkit/ModalMotion.module.css"

type Choices = Record<AgentSwitch["agent"], boolean>

const choicesFrom = (agents: readonly AgentSwitch[]): Choices => ({
  claude: agents.find(({ agent }) => agent === "claude")?.connected ?? false,
  codex: agents.find(({ agent }) => agent === "codex")?.connected ?? false,
  agy: agents.find(({ agent }) => agent === "agy")?.connected ?? false,
})

const icons = { claude: ClaudeIcon, codex: CodexIcon, agy: Sparkles }

const choiceNote = (item: AgentSwitch, selected: boolean): string => {
  if (item.busy) return item.connected ? "Disconnecting…" : "Connecting…"
  if (item.error) return item.error
  if (!item.available) return "Not installed on this computer"
  return selected ? "Resume sessions after a restart" : "Connect to resume your sessions"
}

const OnboardingForm = ({
  agents,
  onChange,
  onDone,
  heading,
}: {
  readonly agents: readonly AgentSwitch[]
  readonly onChange: (agent: AgentSwitch["agent"], connected: boolean) => void
  readonly onDone: () => void
  readonly heading: RefObject<HTMLHeadingElement | null>
}): React.JSX.Element => {
  const [choices, setChoices] = useState<Choices>(() => choicesFrom(agents))

  const submit = (): void => {
    for (const item of agents) {
      const connected = choices[item.agent]
      if (item.available && !item.busy && connected !== item.connected) {
        onChange(item.agent, connected)
      }
    }
    onDone()
  }

  return (
    <form
      className="grid min-h-0 min-[820px]:grid-cols-[1.3fr_1fr]"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="min-w-0 border-b border-line bg-shell px-8 pt-8 pb-6 min-[820px]:border-r min-[820px]:border-b-0 min-[820px]:px-10 min-[820px]:pt-10 max-[420px]:px-5">
        <div
          className="flex items-center gap-2.5 text-[23px] font-semibold tracking-[-0.8px]"
          role="img"
          aria-label={deckName}
        >
          <DeckMark size={35} animated />
          <DeckWordmark />
        </div>
        <div className="mt-9 max-[819px]:mt-6">
          <p className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
            <span className="h-px w-5 bg-accent" aria-hidden="true" />
            Your next great thing starts here
          </p>
          <DialogTitle
            ref={heading}
            tabIndex={-1}
            className="m-0 text-[46px] leading-[1.06] font-medium tracking-[-2.2px] focus-visible:outline-none max-[819px]:text-[38px] max-[420px]:text-[34px]"
          >
            Big ideas.
            <br />
            Room to build.
          </DialogTitle>
          <DialogDescription className="mt-4 mb-0 max-w-[350px] text-[13px] leading-[1.7] text-muted">
            Your terminals, agents, and projects. Together in a workspace that moves with you.
          </DialogDescription>
        </div>
        <OnboardingPreview />
      </div>

      <div className="flex min-w-0 flex-col px-8 pt-10 pb-7 max-[819px]:pt-7 max-[420px]:px-5">
        <div className="mb-7 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.13em] text-muted uppercase">
            Make yourself at home
          </span>
          <span className="rounded-control border border-line px-2 py-1 text-[10px] text-muted">
            Optional setup
          </span>
        </div>
        <div className="mb-6">
          <RotateCcw size={21} strokeWidth={1.5} className="mb-4 text-muted" aria-hidden="true" />
          <h3 className="m-0 text-[25px] leading-[1.2] font-medium tracking-[-0.9px]">
            Good work deserves
            <br />a seamless return.
          </h3>
          <p className="mt-3 mb-0 text-[12px] leading-[1.7] text-muted">
            Connect your coding agents to pick up the same conversations after a restart.
          </p>
        </div>

        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-3 p-0 text-[11px] font-medium">Choose your agents</legend>
          <div className="grid gap-2">
            {agents.map((item) => {
              const selected = choices[item.agent]
              const disabled = !item.available || item.busy
              const description = `onboarding-${item.agent}-description`
              const Icon = icons[item.agent]
              return (
                <label
                  key={item.agent}
                  className={`group flex min-h-[68px] items-center gap-3 rounded-panel border px-3.5 py-3 transition-colors duration-(--motion-feedback) has-focus-visible:outline-2 has-focus-visible:outline-strong has-focus-visible:outline-offset-2 ${selected ? "border-line-strong bg-soft" : "border-line bg-paper"} ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:border-line-strong hover:bg-shell"}`}
                >
                  <Icon
                    size={24}
                    strokeWidth={1.4}
                    className={`shrink-0 ${disabled ? "text-muted" : "text-ink"}`}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className={`text-[12px] font-medium ${disabled ? "text-muted" : "text-ink"}`}
                    >
                      {agentLabels[item.agent]}
                    </span>
                    <span
                      id={description}
                      className={`text-[10px] leading-relaxed ${item.error ? "text-danger-fg" : "text-muted"}`}
                      role={item.error ? "alert" : undefined}
                    >
                      {choiceNote(item, selected)}
                    </span>
                  </span>
                  <span className="relative flex size-4 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      name="agents"
                      value={item.agent}
                      checked={selected}
                      disabled={disabled}
                      aria-label={agentLabels[item.agent]}
                      aria-describedby={description}
                      className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-[2px] border border-line-strong bg-paper checked:border-strong checked:bg-strong disabled:cursor-not-allowed disabled:bg-shell focus-visible:outline-none"
                      onChange={(event) =>
                        setChoices((current) => ({
                          ...current,
                          [item.agent]: event.target.checked,
                        }))
                      }
                    />
                    <Check
                      size={12}
                      strokeWidth={2.5}
                      className="pointer-events-none relative text-white opacity-0 peer-checked:opacity-100"
                      aria-hidden="true"
                    />
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <p className="mt-4 mb-7 text-[10px] leading-[1.65] text-muted">
          When you start, we’ll install a small local plugin for each selected agent. You can
          disconnect it anytime in Preferences.
        </p>
        <div className="mt-auto">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-strong bg-strong px-4 py-3 text-[12px] font-medium text-white shadow-control hover:bg-ink focus-visible:outline-2 focus-visible:outline-strong focus-visible:outline-offset-2"
          >
            Let’s build something
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mt-2 min-h-9 w-full rounded-control px-3 py-2 text-[11px] text-muted hover:bg-shell hover:text-ink"
            onClick={onDone}
          >
            Skip setup and explore
          </button>
        </div>
      </div>
    </form>
  )
}

// Choices stay local until submission. Dismissing makes no connection changes;
// Preferences keeps its immediate switches.
export const OnboardingDialog = ({
  open,
  agents,
  onChange,
  onDone,
}: {
  readonly open: boolean
  readonly agents: readonly AgentSwitch[]
  readonly onChange: (agent: AgentSwitch["agent"], connected: boolean) => void
  readonly onDone: () => void
}): React.JSX.Element => {
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <Dialog
      open={open}
      closeOnInteractOutside
      onOpenChange={(expanded) => {
        if (!expanded) onDone()
      }}
      label="Welcome to NovaDeck"
      initialFocusEl={() => heading.current}
      backdropClassName={`${motion.backdrop} fixed inset-0 z-50 bg-scrim backdrop-blur-[5px]`}
      positionerClassName="fixed inset-0 z-50 flex items-center justify-center p-4"
      className={`${motion.dialog} max-h-[calc(100dvh-32px)] w-[min(980px,calc(100vw-32px))] overflow-y-auto rounded-popover border border-line-strong bg-paper text-ink shadow-modal`}
    >
      <OnboardingForm agents={agents} onChange={onChange} onDone={onDone} heading={heading} />
    </Dialog>
  )
}
