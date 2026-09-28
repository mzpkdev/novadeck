import { useState } from "react"

import { endingText, type TerminalEnding } from "../../model/terminal-ending"

export type RunnerSurfaceProps = {
  readonly minimized?: boolean | undefined
  readonly clipContent?: boolean | undefined
  readonly locked: boolean
  readonly ending: TerminalEnding | null
  readonly notice: string
  readonly onRestart: () => void
  readonly onRootMount: (element: HTMLDivElement | null) => void
  readonly onHostMount: (element: HTMLDivElement | null) => void
}

export const LockNotice = ({ notice }: { readonly notice: string }): React.JSX.Element => (
  <span className="rounded-control border border-line bg-paper px-3.5 py-2 text-[11px] font-bold tracking-wider text-ink uppercase shadow-floating">
    {notice}
  </span>
)

// Whole class strings so Tailwind finds the ending bar's tints and focus rings.
const endingTones: Record<TerminalEnding["tone"], string> = {
  danger: "border-danger-fg/20 bg-danger text-danger-fg [--ending-ring:var(--color-danger-fg)]",
  warning:
    "border-warning-fg/20 bg-warning text-warning-fg [--ending-ring:var(--color-warning-fg)]",
}

export const EndingBar = ({
  ending,
  paused,
  onRestart,
}: {
  readonly ending: TerminalEnding | null
  readonly paused: boolean
  readonly onRestart: () => void
}): React.JSX.Element => {
  const [shown, setShown] = useState(ending)
  const text = shown ? endingText(shown) : ""
  if (ending && (ending.tone !== shown?.tone || endingText(ending) !== text)) setShown(ending)
  return (
    <>
      <span aria-live="polite" aria-atomic className="sr-only">
        {ending ? endingText(ending) : ""}
      </span>
      <div
        className={`runner-ending absolute inset-x-0 bottom-0 flex h-7 items-center justify-between gap-3 border-t pr-6 pl-3 text-[10px] transition-[opacity,translate] duration-(--motion-state) ease-interface ${shown ? endingTones[shown.tone] : ""} ${ending ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}
        inert={!ending}
        data-terminal-ending={ending?.tone}
      >
        <span
          className="min-w-0 truncate font-bold tracking-wider uppercase"
          title={text || undefined}
        >
          {text}
        </span>
        {shown && (
          <button
            type="button"
            aria-disabled={paused || undefined}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-1.5 py-0.5 font-bold tracking-wider uppercase underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--ending-ring) aria-disabled:cursor-default aria-disabled:no-underline aria-disabled:opacity-50"
            onClick={() => {
              if (!paused) onRestart()
            }}
          >
            Restart
            <span aria-hidden className="font-normal opacity-60">
              ↵
            </span>
          </button>
        )}
      </div>
    </>
  )
}
