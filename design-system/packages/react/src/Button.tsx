import { ark, type HTMLArkProps } from "@ark-ui/react/factory"
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"

import { cn } from "./utils"

export type ButtonVariant = "outlined" | "elevated" | "filled" | "tonal" | "text"

type ButtonSharedProps = {
  content?: string
  disabled?: boolean
  end?: ReactNode
  fluid?: boolean
  iconOnly?: boolean
  loading?: boolean
  start?: ReactNode
  variant?: ButtonVariant
}

export type ButtonNativeProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-busy" | "className"
> &
  ButtonSharedProps & { className?: string; href?: never }

export type ButtonLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-busy" | "aria-disabled" | "className" | "type"
> &
  ButtonSharedProps & { className?: string; href: string; type?: never }

export type ButtonProps = ButtonNativeProps | ButtonLinkProps

export const Button = ({
  children,
  className,
  content: contentText,
  disabled = false,
  end,
  fluid = false,
  iconOnly = false,
  loading = false,
  start,
  type,
  variant = "outlined",
  ...props
}: ButtonProps): React.JSX.Element => {
  const classes = cn("button", variant, iconOnly && "icon-only", fluid && "fluid", className)
  const content = (
    <>
      <span className="content">
        {start && (
          <span aria-hidden="true" className="icon start">
            {start}
          </span>
        )}
        {children ?? contentText}
        {end && (
          <span aria-hidden="true" className="icon end">
            {end}
          </span>
        )}
      </span>
      {loading && <span aria-hidden="true" className="spinner" />}
    </>
  )

  if ("href" in props && props.href !== undefined) {
    const { href, ...linkProps } = props
    const inactive = disabled || loading
    return (
      <ark.a
        {...(linkProps as HTMLArkProps<"a">)}
        aria-busy={loading || undefined}
        aria-disabled={inactive || undefined}
        className={classes}
        href={inactive ? undefined : href}
        onClick={
          inactive
            ? (event) => {
                event.preventDefault()
                event.stopPropagation()
              }
            : linkProps.onClick
        }
        role={inactive ? "link" : linkProps.role}
        tabIndex={inactive ? -1 : linkProps.tabIndex}
      >
        {content}
      </ark.a>
    )
  }

  return (
    <ark.button
      {...(props as HTMLArkProps<"button">)}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      type={(type as ButtonHTMLAttributes<HTMLButtonElement>["type"]) ?? "button"}
    >
      {content}
    </ark.button>
  )
}
