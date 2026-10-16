import { Progress as ArkProgress } from "@ark-ui/react/progress"

import { cn } from "../class-name"

// A bar for work of a known size: `value` of `max`. The label names it for assistive
// technology; the caller shows the numbers where it wants them. `indeterminate` is work with
// no size to show (a check): the bar moves back and forth instead of standing empty.
export const Progress = ({
  label,
  value,
  max,
  indeterminate = false,
  className,
}: {
  readonly label: string
  readonly value: number
  readonly max: number
  readonly indeterminate?: boolean
  readonly className?: string
}): React.JSX.Element => (
  <ArkProgress.Root
    value={indeterminate ? null : Math.min(value, max)}
    min={0}
    max={Math.max(max, 1)}
    aria-label={label}
    className={cn("w-full", className)}
  >
    <ArkProgress.Track className="progress-track h-1.5">
      <ArkProgress.Range className="progress-range" />
    </ArkProgress.Track>
  </ArkProgress.Root>
)
