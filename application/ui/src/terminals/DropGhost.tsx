import type { DropOutline } from "./drop-space"

// A ghost of the window a drop would open, where it would sit: its outline, and a header
// strip with what it would show, at the view's scale.
export const DropGhost = ({
  outline: { left, top, width, height, scale = 1, label },
  className = "",
}: {
  outline: DropOutline
  className?: string
}): React.JSX.Element => (
  <div
    className={`view-drop-preview ${className}`}
    aria-hidden="true"
    style={{ left, top, width, height, "--drop-scale": scale } as React.CSSProperties}
  >
    <span className="view-drop-preview-header">{label}</span>
  </div>
)
