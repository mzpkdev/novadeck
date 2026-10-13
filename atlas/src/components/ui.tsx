import { clsx } from "clsx"
import type { ReactNode } from "react"

// A page as one of Novadeck's windows: a pane on the recessed workspace, its heading
// carrying the selection bar, an optional sidebar of the app's chrome to its left.
export const Page = ({
  title,
  crumbs,
  tools,
  side,
  flush = false,
  children,
}: {
  title: ReactNode
  // What leads up to the title, such as "Areas /".
  crumbs?: ReactNode
  // Controls at the heading's end.
  tools?: ReactNode
  side?: ReactNode
  // Content that lays itself out edge to edge and scrolls itself, such as a canvas.
  flush?: boolean
  children: ReactNode
}) => (
  <div className="flex min-h-0 min-w-0 flex-1">
    {side}
    <div className="workspace dots relative flex min-w-0 flex-1 p-3">
      <section className="pane relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="pane-heading flex h-12 shrink-0 items-center gap-3 px-4">
          {crumbs ? (
            <span className="flex shrink-0 items-center gap-1.5 text-body text-muted">
              {crumbs}
            </span>
          ) : null}
          <h1 className="m-0 min-w-0 truncate text-body font-medium">{title}</h1>
          {tools ? <div className="ml-auto flex shrink-0 items-center gap-3">{tools}</div> : null}
        </header>
        <div className={clsx("relative min-h-0 flex-1", flush ? "flex flex-col" : "overflow-auto")}>
          {flush ? children : <div className="px-5 py-5">{children}</div>}
        </div>
      </section>
    </div>
  </div>
)

// The app's sidebar: a grained ground, a panel labelled in small capitals.
export const Sidebar = ({
  title,
  count,
  children,
  footer,
  className,
}: {
  title: string
  count?: number
  children: ReactNode
  footer?: ReactNode
  className?: string
}) => (
  <aside className={clsx("sidebar flex w-64 shrink-0 flex-col", className)}>
    <header className="mx-3 mt-3 flex h-[38px] shrink-0 items-center px-0.5">
      <h2 className="section-label m-0 flex items-center gap-1.5">
        {title}
        {count === undefined ? null : <span className="count">{count}</span>}
      </h2>
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">{children}</div>
    {footer}
  </aside>
)

export const SectionLabel = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => <h2 className={clsx("section-label m-0 mb-2.5", className)}>{children}</h2>

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
    <h2 className="section-label mb-2 flex items-baseline gap-2 border-b border-line pb-1.5">
      {title}
      {count === undefined ? null : <span className="count">{count}</span>}
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
      "badge inline-block px-1.5 text-[11px] leading-4",
      accent && "border-accent text-accent",
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
