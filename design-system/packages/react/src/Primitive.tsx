import type { AnchorHTMLAttributes, HTMLAttributes } from "react"

import { cn } from "./utils"

export type ButtonGroupProps = HTMLAttributes<HTMLDivElement> & { fluid?: boolean }
export const ButtonGroup = ({ className, fluid = false, ...props }: ButtonGroupProps) => (
  <div {...props} className={cn("button-group", fluid && "fluid", className)} role="group" />
)

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { external?: boolean }
export const Link = ({ className, external = false, rel, target, ...props }: LinkProps) => (
  <a
    {...props}
    className={cn("link", className)}
    rel={external ? (rel ?? "noreferrer") : rel}
    target={external ? (target ?? "_blank") : target}
  />
)
