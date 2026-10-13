import { clsx } from "clsx"
import type { ReactNode } from "react"

export const Page = ({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) => (
  <div className="mx-auto max-w-5xl px-6 py-6">
    <h1 className="text-lg font-semibold">{title}</h1>
    {subtitle ? <p className="mt-1 max-w-3xl text-muted">{subtitle}</p> : null}
    <div className="mt-5 space-y-8">{children}</div>
  </div>
)

export const Section = ({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) => (
  <section>
    <h2 className="mb-2 flex items-baseline gap-2 border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
      {title}
      {count === undefined ? null : <span className="font-mono normal-case">{count}</span>}
    </h2>
    {children}
  </section>
)

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="text-muted italic">{children}</p>
)

export const Mono = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={clsx("font-mono text-[12px]", className)}>{children}</span>
)

export const Badge = ({ children, accent }: { children: ReactNode; accent?: boolean }) => (
  <span
    className={clsx(
      "inline-block rounded-sm border px-1.5 font-mono text-[11px] leading-4",
      accent ? "border-accent text-accent" : "border-line text-muted",
    )}
  >
    {children}
  </span>
)

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={clsx("rounded-sm border border-line bg-panel", className)}>{children}</div>
)

export const Table = ({ children }: { children: ReactNode }) => (
  <table className="w-full border-collapse text-[13px] leading-5">{children}</table>
)

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th
    className={clsx(
      "border-b border-line px-2 py-1 text-left text-[11px] font-medium text-muted",
      className,
    )}
  >
    {children}
  </th>
)

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={clsx("border-b border-line/60 px-2 py-1 align-top", className)}>{children}</td>
)
