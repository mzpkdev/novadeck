import { useEffectEvent, useLayoutEffect, useRef } from "react"
import { useStore } from "zustand"

import type { LiveTerminalRuntime } from "../runtime/live/runtime"
import type { RuntimeTerminalProps } from "./RuntimeTerminal"
import { TerminalFrame } from "./Terminal"

import "@xterm/xterm/css/xterm.css"
import "./live-terminal.css"

export type LiveTerminalProps = Omit<RuntimeTerminalProps, "runtime"> & {
  runtime: LiveTerminalRuntime
  fontSize?: number
  keyHandler?: (event: KeyboardEvent) => boolean
}
export const LiveTerminal = ({
  runtime,
  target: _target,
  fontSize,
  keyHandler,
  focusInput,
  onInputFocused,
  projectName: _projectName,
  ...props
}: LiveTerminalProps): React.JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)
  const id = props.session.id
  const state = useStore(runtime.getTerminalStore(id))
  const handleKey = useEffectEvent((event: KeyboardEvent) => keyHandler?.(event) ?? false)
  const inputFocused = useEffectEvent(() => onInputFocused?.())
  useLayoutEffect(() => {
    if (!ref.current) return
    return runtime.mount(id, ref.current, {
      ...(fontSize === undefined ? {} : { fontSize }),
      keyHandler: handleKey,
      onInputFocused: inputFocused,
    })
  }, [runtime, id, fontSize])
  useLayoutEffect(() => {
    if (focusInput) runtime.focus(id)
  }, [runtime, id, focusInput])
  return (
    <TerminalFrame {...props}>
      <div
        className="live-terminal-content nodrag nopan"
        data-terminal-content=""
        data-terminal-surface=""
        hidden={props.minimize?.minimized && !props.minimize.clipContent}
        aria-hidden={props.minimize?.minimized}
        inert={props.minimize?.minimized}
      >
        <div ref={ref} className="live-terminal-container" />
        {state.status !== "attached" ? (
          <div className="live-terminal-status" role="status">
            {state.status === "exited"
              ? `Process exited${state.exitCode === null ? "" : ` (${state.exitCode})`}`
              : (state.error ??
                (state.status === "connecting" ? "Connecting terminal…" : "Runtime disconnected"))}
            {state.status === "error" && (
              <button
                type="button"
                className="live-terminal-retry"
                onClick={(event) => {
                  event.stopPropagation()
                  runtime.retryAttachment(id)
                }}
              >
                Retry attachment
              </button>
            )}
          </div>
        ) : !state.control ? (
          <div className="live-terminal-status" role="status">
            Observing · another connection controls this terminal
          </div>
        ) : null}
        {state.status === "attached" && state.error && (
          <div className="live-terminal-status" role="alert">
            {state.error}
          </div>
        )}
      </div>
    </TerminalFrame>
  )
}
