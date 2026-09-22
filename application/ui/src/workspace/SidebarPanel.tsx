import { X } from "lucide-react"
import type { ReactNode } from "react"

import "./SidebarPanel.css"

export const SidebarPanel = ({
  id,
  title,
  count,
  active,
  onClose,
  children,
}: {
  id: string
  title: string
  count?: number
  active: boolean
  onClose: () => void
  children: ReactNode
}): React.JSX.Element => (
  <section
    id={id}
    className="sidebar-panel"
    data-active={active}
    aria-labelledby={`${id}-title`}
    aria-hidden={!active}
    inert={!active}
  >
    <header className="sidebar-panel-header">
      <h2 id={`${id}-title`}>
        {title}
        {count !== undefined && <span className="sidebar-panel-count">{count}</span>}
      </h2>
      <button
        className="icon-button sidebar-close"
        type="button"
        aria-label={`Hide ${title.toLowerCase()}`}
        title={`Hide ${title.toLowerCase()}`}
        onClick={onClose}
      >
        <X size={15} strokeWidth={1.6} />
      </button>
    </header>
    <div className="sidebar-panel-content">{children}</div>
  </section>
)
