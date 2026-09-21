import "@novadeck/css/tailwind/card.css"
import "@novadeck/css/tailwind/columns.css"
import "@novadeck/css/tailwind/container.css"
import "@novadeck/css/tailwind/divider.css"
import "@novadeck/css/tailwind/grid.css"
import "@novadeck/css/tailwind/hero.css"
import "@novadeck/css/tailwind/inline.css"
import "@novadeck/css/tailwind/stack.css"
import {
  createElement,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react"

import { cn, withCustomProperties } from "./utils"

export type StackAlignment = "start" | "center" | "end" | "stretch"
export type StackJustification = "start" | "center" | "end" | "between"
export type InlineAlignment = StackAlignment
export type InlineJustification = StackJustification
export type ColumnsAlignment = StackAlignment
export type GridAlignment = StackAlignment

export type StackProps = HTMLAttributes<HTMLDivElement> & {
  align?: StackAlignment
  gap?: string
  justify?: StackJustification
}
export const Stack = ({
  align = "stretch",
  className,
  gap,
  justify = "start",
  style,
  ...props
}: StackProps) => (
  <div
    {...props}
    className={cn("stack", `items-${align}`, `justify-${justify}`, className)}
    style={withCustomProperties(style, { "--stack__gap": gap })}
  />
)

export type InlineProps = Omit<StackProps, "align" | "justify"> & {
  align?: InlineAlignment
  justify?: InlineJustification
  wrap?: boolean
}
export const Inline = ({
  align = "center",
  className,
  gap,
  justify = "start",
  style,
  wrap = true,
  ...props
}: InlineProps) => (
  <div
    {...props}
    className={cn("inline", `items-${align}`, `justify-${justify}`, !wrap && "nowrap", className)}
    style={withCustomProperties(style, { "--inline__gap": gap })}
  />
)

export type ColumnsProps = HTMLAttributes<HTMLDivElement> & {
  align?: ColumnsAlignment
  rowGap?: string
}
export const Columns = ({
  align = "stretch",
  className,
  rowGap,
  style,
  ...props
}: ColumnsProps) => (
  <div
    {...props}
    className={cn("columns", `items-${align}`, className)}
    style={withCustomProperties(style, { "--columns__row-gap": rowGap })}
  />
)

export type ColumnFraction =
  | { basis: string; of?: never; span?: never }
  | { basis?: never; of: number; span: number }
  | { basis?: never; of?: never; span?: never }
export type ColumnProps = HTMLAttributes<HTMLDivElement> & ColumnFraction
export const Column = ({ basis, className, of, span, style, ...props }: ColumnProps) => {
  if ((span === undefined) !== (of === undefined))
    throw new Error("Column requires both `span` and `of`.")
  if (span !== undefined && (!Number.isInteger(span) || span < 1))
    throw new Error("Column `span` must be a positive integer.")
  if (of !== undefined && (!Number.isInteger(of) || of < 2))
    throw new Error("Column `of` must be an integer greater than 1.")
  if (span !== undefined && of !== undefined && span > of)
    throw new Error("Column `span` must not exceed `of`.")
  const value = span !== undefined && of !== undefined ? `${(span / of) * 100}%` : basis
  return (
    <div
      {...props}
      className={cn("column", value && "fractional", className)}
      style={withCustomProperties(style, { "--column__basis": value })}
    />
  )
}

export type ContainerTextAlign = "start" | "center" | "end" | "justify"
export type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  fluid?: boolean
  maxWidth?: string
  padding?: string
  textAlign?: ContainerTextAlign
}
export const Container = ({
  className,
  fluid = false,
  maxWidth,
  padding,
  style,
  textAlign = "start",
  ...props
}: ContainerProps) => (
  <div
    {...props}
    className={cn("container", fluid && "fluid", `align-${textAlign}`, className)}
    style={withCustomProperties(style, {
      "--container__max-width": maxWidth,
      "--container__padding": padding,
    })}
  />
)

export type GridSizing =
  | { columns?: number; minWidth?: never }
  | { columns?: never; minWidth: string }
export type GridProps = HTMLAttributes<HTMLDivElement> &
  GridSizing & {
    align?: GridAlignment
    gap?: string
  }
export const Grid = ({
  align = "stretch",
  className,
  columns,
  gap,
  minWidth,
  style,
  ...props
}: GridProps) => {
  if (columns !== undefined && (!Number.isInteger(columns) || columns < 1))
    throw new Error("Grid columns must be a positive integer.")
  if (columns !== undefined && minWidth !== undefined)
    throw new Error("Grid accepts either `columns` or `minWidth`, not both.")
  return (
    <div
      {...props}
      className={cn("grid", minWidth && "responsive", `items-${align}`, className)}
      style={withCustomProperties(style, {
        "--grid__columns": columns,
        "--grid__gap": gap,
        "--grid__min-width": minWidth,
      })}
    />
  )
}

export type DividerOrientation = "horizontal" | "vertical"
export type DividerProps = HTMLAttributes<HTMLDivElement> & {
  decorative?: boolean
  orientation?: DividerOrientation
  spacing?: string
  thickness?: string
}
export const Divider = ({
  children,
  className,
  decorative = false,
  orientation = "horizontal",
  spacing,
  style,
  thickness,
  ...props
}: DividerProps) => {
  const common = {
    className: cn("divider", orientation, Boolean(children) && "labeled", className),
    style: withCustomProperties(style, {
      "--divider__spacing": spacing,
      "--divider__thickness": thickness,
    }),
  }
  if (!children && orientation === "horizontal")
    return <hr {...props} {...common} aria-hidden={decorative || undefined} />
  return (
    <div
      {...props}
      {...common}
      aria-hidden={decorative || undefined}
      aria-orientation={!children && !decorative ? orientation : undefined}
      role={!children && !decorative ? "separator" : undefined}
    >
      {children && <div className="content">{children}</div>}
    </div>
  )
}

export type HeroImageAlignment = "left" | "center" | "right"
export type HeroProps = HTMLAttributes<HTMLElement> & {
  background?: ReactNode
  fullHeight?: boolean
  headline?: ReactNode
  image?: ReactNode
  imageAlign?: HeroImageAlignment
  overlay?: boolean
  subheading?: ReactNode
}
export const Hero = ({
  background,
  children,
  className,
  fullHeight,
  headline,
  image,
  imageAlign = "right",
  overlay,
  subheading,
  ...props
}: HeroProps) => (
  <section
    {...props}
    className={cn(
      "hero",
      `image-${imageAlign}`,
      fullHeight && "full-height",
      overlay && "overlay",
      className,
    )}
  >
    {background && (
      <div aria-hidden="true" className="background" inert>
        {background}
      </div>
    )}
    {(headline || subheading || children) && (
      <div className="content">
        {headline && <div className="headline">{headline}</div>}
        {subheading && <div className="subheading">{subheading}</div>}
        {children && <div className="body">{children}</div>}
      </div>
    )}
    {image && <div className="image">{image}</div>}
  </section>
)

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "section" | "div" | "li"
  centered?: boolean
  external?: boolean
  fluid?: boolean
  footer?: ReactNode
  header?: ReactNode
  href?: string
  image?: ReactNode
  linkProps?: AnchorHTMLAttributes<HTMLAnchorElement>
  meta?: ReactNode
  raised?: boolean
  renderContent?: ReactNode
}
export const Card = ({
  as = "article",
  centered,
  children,
  className,
  external,
  fluid,
  footer,
  header,
  href,
  image,
  linkProps,
  meta,
  raised,
  renderContent,
  ...props
}: CardProps) => {
  const content = renderContent ?? (
    <>
      {image && <div className="image">{image}</div>}
      {(header || meta || children) && (
        <div className="content">
          {header && <header className="header">{header}</header>}
          {meta && <div className="meta">{meta}</div>}
          {children && <div className="description">{children}</div>}
        </div>
      )}
      {footer && <footer className="extra">{footer}</footer>}
    </>
  )
  return createElement(
    as,
    {
      ...props,
      className: cn(
        "card",
        fluid && "fluid",
        raised && "raised",
        centered && "centered",
        className,
      ),
    },
    href !== undefined ? (
      <a
        {...linkProps}
        className={cn("card-link", linkProps?.className)}
        href={href}
        rel={linkProps?.rel ?? (external ? "noreferrer" : undefined)}
        target={linkProps?.target ?? (external ? "_blank" : undefined)}
      >
        {content}
      </a>
    ) : (
      content
    ),
  )
}
