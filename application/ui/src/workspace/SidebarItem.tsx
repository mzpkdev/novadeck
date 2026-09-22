import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react"

import "./SidebarItem.css"

export const SidebarItem = ({
  name,
  icon,
  detail,
  selected,
  selectLabel,
  tooltip,
  description,
  onSelect,
  actions,
  editor,
  ref,
  handleRef,
  className = "",
  ...attributes
}: Omit<ComponentPropsWithoutRef<"div">, "children" | "onSelect"> & {
  name: string
  icon: ReactNode
  detail: ReactNode
  selected: boolean
  selectLabel: string
  tooltip: string
  description?: string
  onSelect: () => void
  actions?: ReactNode
  editor?: ReactNode
  ref?: Ref<HTMLDivElement>
  handleRef?: Ref<HTMLButtonElement>
}): React.JSX.Element => (
  <div {...attributes} ref={ref} className={`sidebar-item ${className}`} data-selected={selected}>
    {editor ?? (
      <button
        ref={handleRef}
        className="sidebar-item-select"
        type="button"
        aria-label={selectLabel}
        aria-description={description}
        aria-current={selected ? "true" : undefined}
        title={tooltip}
        onClick={onSelect}
      >
        <span className="sidebar-item-icon">{icon}</span>
        <span className="sidebar-item-copy">
          <strong>{name}</strong>
          <span className="sidebar-item-detail">{detail}</span>
        </span>
      </button>
    )}
    {actions && <div className="sidebar-item-actions">{actions}</div>}
  </div>
)
