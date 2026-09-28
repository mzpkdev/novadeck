import { WindowShell, type WindowShellProps } from "../WindowShell"

// Codex's window: where its own content or chrome can grow without touching others.
export const CodexWindow = ({ children, ...props }: WindowShellProps): React.JSX.Element => (
  <WindowShell {...props} processWindow="codex">
    {children}
  </WindowShell>
)
