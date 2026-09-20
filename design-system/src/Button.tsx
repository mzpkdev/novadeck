import { ark, type HTMLArkProps } from "@ark-ui/react/factory"
import type { RefAttributes } from "react"

const base =
  "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"

const variants = {
  primary:
    "bg-indigo-500 text-white shadow-lg shadow-indigo-950/30 enabled:hover:bg-indigo-400 enabled:active:bg-indigo-600",
  secondary:
    "border border-slate-600 bg-slate-900 text-slate-100 enabled:hover:border-slate-500 enabled:hover:bg-slate-800 enabled:active:bg-slate-950",
} as const

export type ButtonProps = Omit<HTMLArkProps<"button">, "variant"> &
  RefAttributes<HTMLButtonElement> & {
    variant?: keyof typeof variants
  }

export const Button = ({
  className,
  variant = "primary",
  ...props
}: ButtonProps): React.JSX.Element => (
  <ark.button
    type="button"
    {...props}
    className={[base, variants[variant], className].filter(Boolean).join(" ")}
  />
)
