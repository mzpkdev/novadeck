import { ark, type HTMLArkProps } from "@ark-ui/react/factory"
import type { ReactNode, RefAttributes } from "react"

export type ButtonVariant = "outlined" | "elevated" | "filled" | "tonal" | "text"

export type ButtonProps = Omit<HTMLArkProps<"button">, "variant"> &
  RefAttributes<HTMLButtonElement> & {
    end?: ReactNode
    fluid?: boolean
    iconOnly?: boolean
    loading?: boolean
    start?: ReactNode
    variant?: ButtonVariant
  }

export const Button = ({
  children,
  className,
  disabled = false,
  end,
  fluid = false,
  iconOnly = false,
  loading = false,
  start,
  type = "button",
  variant = "outlined",
  ...props
}: ButtonProps): React.JSX.Element => {
  const classes = ["button", variant, iconOnly && "icon-only", fluid && "fluid", className]
    .filter(Boolean)
    .join(" ")

  return (
    <ark.button
      {...props}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      type={type}
    >
      <span className="content">
        {start && (
          <span aria-hidden="true" className="icon start">
            {start}
          </span>
        )}
        {children}
        {end && (
          <span aria-hidden="true" className="icon end">
            {end}
          </span>
        )}
      </span>
      {loading && <span aria-hidden="true" className="spinner" />}
    </ark.button>
  )
}
