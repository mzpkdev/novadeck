import type { RefAttributes } from "react"
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components/Button"

const base =
  "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold outline-none transition-colors data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus-visible:ring-2 data-focus-visible:ring-indigo-400 data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-slate-950"

const variants = {
  primary:
    "bg-indigo-500 text-white shadow-lg shadow-indigo-950/30 data-hovered:bg-indigo-400 data-pressed:bg-indigo-600",
  secondary:
    "border border-slate-600 bg-slate-900 text-slate-100 data-hovered:border-slate-500 data-hovered:bg-slate-800 data-pressed:bg-slate-950",
} as const

export type ButtonProps = AriaButtonProps &
  RefAttributes<HTMLButtonElement> & {
    variant?: keyof typeof variants
  }

export const Button = ({
  className,
  variant = "primary",
  ...props
}: ButtonProps): React.JSX.Element => (
  <AriaButton
    {...props}
    className={(state) =>
      [base, variants[variant], typeof className === "function" ? className(state) : className]
        .filter(Boolean)
        .join(" ")
    }
  />
)
