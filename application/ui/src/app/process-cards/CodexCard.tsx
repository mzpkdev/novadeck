import { WindowShell, type WindowShellProps } from "../../terminals/WindowShell"
import { CodexIcon } from "../../ui-toolkit/icons/CodexIcon"

const defaultIcon = <CodexIcon size={14} strokeWidth={1.5} />

// This renderer can customize its content or replace the shared shell entirely.
export const CodexCard = ({
  children,
  icon = defaultIcon,
  ...props
}: WindowShellProps): React.JSX.Element => (
  <WindowShell {...props} processCard="codex" icon={icon}>
    {children}
  </WindowShell>
)
