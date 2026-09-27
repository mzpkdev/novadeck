import "@xterm/xterm/css/xterm.css"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal, type ITheme } from "@xterm/xterm"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import type { TerminalSurfaceProps } from "../port"
import { restartable } from "./activity"
import type { SurfaceRuntime } from "./backend"
import { followTerminal, type FollowedTerminal, type Screen } from "./follow"
import { silenceQueries } from "./queries"

// The sizes the runner accepts.
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.floor(value)))
export const runnerSize = (size: {
  readonly cols: number
  readonly rows: number
}): { readonly cols: number; readonly rows: number } => ({
  cols: clamp(size.cols, 2, 500),
  rows: clamp(size.rows, 1, 200),
})

const token = (style: CSSStyleDeclaration, name: string): string | undefined =>
  style.getPropertyValue(name).trim() || undefined

// The app's colour tokens, read from the page so a theme change reaches the terminal.
const themeOf = (element: Element): ITheme => {
  const style = getComputedStyle(element)
  const background = token(style, "--color-paper")
  const foreground = token(style, "--color-ink")
  const selection = token(style, "--color-line-strong")
  return {
    ...(background ? { background } : {}),
    ...(foreground ? { foreground, cursor: foreground } : {}),
    ...(background ? { cursorAccent: background } : {}),
    ...(selection ? { selectionBackground: selection } : {}),
  }
}

const monospace = (element: Element): string =>
  token(getComputedStyle(element), "--font-mono") ?? "monospace"

const darkScheme = "(prefers-color-scheme: dark)"
const restartHint = "\r\n\u001b[2mPress Enter to restart\u001b[0m"
const lockedLabels = {
  connected: "Starting · input paused",
  reconnecting: "Reconnecting · input paused",
  unavailable: "Runner unavailable · input paused",
} as const
// A lock this short, such as while a screen arrives, stays out of sight: the dimming
// and the label fade in only after a moment.

// One component per backend, so its identity stays stable while the backend lives.
export const createRunnerTerminal = (runtime: SurfaceRuntime) => {
  const RunnerTerminal = ({
    terminalKey,
    terminal,
    fontSize,
    minimized,
    clipContent,
    focusInput,
    onInputFocused,
  }: TerminalSurfaceProps): React.JSX.Element => {
    const root = useRef<HTMLDivElement>(null)
    const host = useRef<HTMLDivElement>(null)
    const view = useRef<{ xterm: Terminal; followed: FollowedTerminal | undefined }>(null)
    const initialFont = useRef(fontSize)
    const name = terminal.name
    const initialName = useRef(name)
    // An exited or failed terminal waits for Enter; the hint says so under its output.
    // The stream reports an exit in order with the output, so it writes the hint when
    // attached; the status covers a shell that never started, with no stream to tell.
    const waiting = restartable(terminal)
    const restart = useRef({ status: waiting, stream: false, shown: false, show: () => {} })
    const connection = useSyncExternalStore(
      runtime.connection.subscribe,
      runtime.connection.getSnapshot,
    )
    // Input is refused while the runner is away, and while a running or starting shell
    // has no stream to take it, as right after a reconnection or a restart.
    const [live, setLive] = useState(false)
    const [resuming, setResuming] = useState(false)
    // The stream can tell of an exit before the status does; Enter works from then on.
    const [streamWaits, setStreamWaits] = useState(false)
    const locked = connection !== "connected" || (!waiting && !streamWaits && !live)

    useEffect(() => {
      const element = host.current!
      const xterm = new Terminal({
        fontSize: initialFont.current,
        fontFamily: monospace(element),
        theme: themeOf(element),
        scrollback: 1000,
        allowTransparency: false,
      })
      const fit = new FitAddon()
      xterm.loadAddon(fit)
      xterm.open(element)
      const queries = silenceQueries(xterm)
      xterm.textarea?.setAttribute("data-terminal-input", "")
      xterm.textarea?.setAttribute("aria-label", `Input for ${initialName.current}`)
      const screen: Screen = {
        exited: () => {},
        live: () => {},
        write: (data) => new Promise((resolve) => xterm.write(data, resolve)),
        reset: () => xterm.reset(),
        resize: ({ cols, rows }) => {
          if (xterm.cols !== cols || xterm.rows !== rows) xterm.resize(cols, rows)
        },
        fit: () => {
          if (!element.clientWidth || !element.clientHeight) return undefined
          const size = fit.proposeDimensions()
          return size && Number.isFinite(size.cols) && Number.isFinite(size.rows)
            ? runnerSize(size)
            : undefined
        },
      }
      const hint = restart.current
      // Each xterm starts blank, so a hint written to an earlier one does not count.
      hint.shown = false
      hint.stream = false
      hint.show = () => {
        if (hint.shown) return
        hint.shown = true
        xterm.write(restartHint)
      }
      const followed = followTerminal(runtime, terminalKey, {
        ...screen,
        reset: () => {
          hint.shown = false
          hint.stream = false
          setStreamWaits(false)
          screen.reset()
        },
        exited: (waits) => {
          hint.stream = waits
          setStreamWaits(waits)
          if (waits) hint.show()
        },
        live: (next, resumingNow = false) => {
          setLive(next)
          setResuming(resumingNow)
          // A stream that broke before reporting the exit leaves the hint to the status.
          if (!next && hint.status) hint.show()
        },
      })
      const send = (data: string): void => {
        // A shell that exited or failed to start only listens for Enter, to start again.
        if (!hint.status && !hint.stream) return followed.input(data)
        if (!data.includes("\r")) return
        // Locked until the fresh shell's screen arrives.
        hint.stream = false
        setStreamWaits(false)
        runtime.restart(terminalKey)
      }
      const input = xterm.onData(send)
      // Some mouse reports arrive as binary; they go to the shell the same way.
      const binary = xterm.onBinary(send)
      const resizes = new ResizeObserver(() => followed.refit())
      resizes.observe(element)
      const scheme = window.matchMedia?.(darkScheme)
      const retheme = (): void => {
        xterm.options.theme = themeOf(element)
      }
      scheme?.addEventListener("change", retheme)
      view.current = { xterm, followed }
      runtime.screen(terminalKey, "mounted")
      return () => {
        runtime.screen(terminalKey, "gone")
        view.current = null
        scheme?.removeEventListener("change", retheme)
        resizes.disconnect()
        input.dispose()
        binary.dispose()
        queries.dispose()
        followed.stop()
        xterm.dispose()
      }
    }, [terminalKey])

    // Show the hint once the terminal starts waiting; a fresh shell's snapshot clears it.
    useEffect(() => {
      const hint = restart.current
      hint.status = waiting
      if (!waiting) {
        hint.stream = false
        hint.shown = false
      } else if (!view.current?.followed?.attached()) hint.show()
    }, [waiting])

    // While the runner is away, keys are refused where the person can see it.
    useEffect(() => {
      const current = view.current
      if (!current) return
      current.xterm.options.disableStdin = locked
      current.xterm.textarea?.setAttribute("aria-disabled", String(locked))
    }, [locked])

    useEffect(() => {
      const current = view.current
      if (!current || current.xterm.options.fontSize === fontSize) return
      current.xterm.options.fontSize = fontSize
      current.followed?.refit()
    }, [fontSize])

    useEffect(() => {
      view.current?.xterm.textarea?.setAttribute("aria-label", `Input for ${name}`)
    }, [name])

    useEffect(() => {
      if (!focusInput || !view.current) return
      view.current.xterm.focus()
      onInputFocused()
    }, [focusInput, onInputFocused])

    useEffect(() => {
      const element = root.current
      if (!element) return
      const onWheel = (event: WheelEvent): void => {
        // Intercept before XYFlow's native listener, but let zoom gestures reach it.
        if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
      }
      element.addEventListener("wheel", onWheel, { passive: true })
      return () => element.removeEventListener("wheel", onWheel)
    }, [])

    return (
      <div
        ref={root}
        data-terminal-content
        className="terminal-content runner-terminal nodrag nopan relative flex min-h-0 flex-1 flex-col p-3"
        hidden={minimized && !clipContent}
        aria-hidden={minimized}
        inert={minimized}
        data-locked={locked || undefined}
      >
        <div
          ref={host}
          className={`min-h-0 flex-1 transition-opacity duration-(--motion-state) ease-interface ${locked ? "opacity-40 delay-200" : ""}`}
        />
        {locked && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center transition-opacity delay-200 duration-(--motion-state) ease-interface starting:opacity-0"
          >
            <span className="rounded-control border border-line bg-paper px-3 py-1.5 text-[11px] text-muted shadow-control">
              {lockedLabels[connection === "connected" && resuming ? "reconnecting" : connection]}
            </span>
          </div>
        )}
      </div>
    )
  }
  return RunnerTerminal
}
