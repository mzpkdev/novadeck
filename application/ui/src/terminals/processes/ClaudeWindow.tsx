import { WindowShell, type WindowShellProps } from "../WindowShell"

// Claude's window: where its own content or chrome can grow without touching others.
export const ClaudeWindow = ({ children, ...props }: WindowShellProps): React.JSX.Element => (
  <WindowShell {...props} processWindow="claude">
    {children}
  </WindowShell>
)
