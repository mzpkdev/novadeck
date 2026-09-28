import { WindowShell, type WindowShellProps } from "../../terminals/WindowShell"
import { ClaudeIcon } from "../../ui-toolkit/icons/ClaudeIcon"

const defaultIcon = <ClaudeIcon size={14} strokeWidth={1.5} />

// This renderer can customize its content or replace the shared shell entirely.
export const ClaudeCard = ({
  children,
  icon = defaultIcon,
  ...props
}: WindowShellProps): React.JSX.Element => (
  <WindowShell {...props} processCard="claude" icon={icon}>
    {children}
  </WindowShell>
)
