import { WindowShell, type WindowShellProps } from "./WindowShell"

export type { MinimizeControls, TerminalLayoutControls } from "./WindowShell"
export type TerminalFrameProps = WindowShellProps

// The fallback renderer uses the same optional shell as the agent cards.
export const TerminalFrame = (props: TerminalFrameProps): React.JSX.Element => (
  <WindowShell {...props} />
)
