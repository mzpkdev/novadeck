import "@xterm/xterm/css/xterm.css"
import type { TerminalEvent } from "@novadeck/protocol"
import { hasCode, type AttachedTerminal } from "@novadeck/protocol/client"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal, type ITheme } from "@xterm/xterm"
import { useEffect, useRef } from "react"

import type { TerminalKey, TerminalSurfaceProps } from "../port"
import type { SurfaceRuntime } from "./backend"
import { silenceQueries } from "./queries"

// The screen a runner terminal draws on, reduced to what following it needs.
export type Screen = {
  readonly write: (data: string) => Promise<void>
  readonly reset: () => void
  readonly resize: (size: { readonly cols: number; readonly rows: number }) => void
  // The size that fits the element now; undefined while it has no room, as when hidden.
  readonly fit: () => { readonly cols: number; readonly rows: number } | undefined
}

export type FollowedTerminal = {
  // Sends typed input; dropped while there is no attachment, such as while reconnecting.
  readonly input: (data: string) => void
  // Tells the runner the size that fits now, if it changed.
  readonly refit: () => void
  readonly stop: () => void
}

// Attaches to the terminal, draws what it sends, and passes input and size back until
// stopped. A terminal the runner lost or another window controls is reported instead.
export const followTerminal = (
  runtime: SurfaceRuntime,
  key: TerminalKey,
  screen: Screen,
): FollowedTerminal => {
  let stopped = false
  let attachment: AttachedTerminal | undefined
  let sent: string | undefined
  const refit = (): void => {
    const size = screen.fit()
    if (!size || !attachment) return
    screen.resize(size)
    const next = `${size.cols}x${size.rows}`
    if (next === sent) return
    sent = next
    void attachment.resize(size).catch(() => {
      sent = undefined
    })
  }
  const apply = async (event: TerminalEvent): Promise<void> => {
    if (event.type === "snapshot") {
      screen.reset()
      screen.resize(event)
      sent = `${event.cols}x${event.rows}`
      await screen.write(event.data)
      refit()
    } else if (event.type === "output") await screen.write(event.data)
    else if (event.type === "resized") {
      sent = `${event.cols}x${event.rows}`
      screen.resize(event)
    }
  }
  const open = async (): Promise<AttachedTerminal | undefined> => {
    const entry = runtime.entry(key)
    if (!entry || !(await entry.ready)) return undefined
    const wanted = (): boolean => !stopped && !entry.closed
    while (wanted()) {
      try {
        // eslint-disable-next-line no-await-in-loop -- Retry after the runner comes back.
        const attached = await runtime.attach(key.terminalId)
        if (wanted()) return attached
        // Closed while attaching: finish the close this attachment now holds up.
        // eslint-disable-next-line no-await-in-loop -- Release before giving up.
        if (entry.closed) await attached.close().catch(() => {})
        // eslint-disable-next-line no-await-in-loop -- Release before giving up.
        await attached.detach()
        return undefined
      } catch (error) {
        if (!hasCode(error, "DISCONNECTED")) {
          runtime.lost(key, error)
          return undefined
        }
        // eslint-disable-next-line no-await-in-loop -- Wait for the runner to come back.
        await runtime.connected()
      }
    }
    return undefined
  }
  const run = async (): Promise<void> => {
    const attached = await runtime.track(open())
    if (!attached) return
    const entry = runtime.entry(key)
    attachment = attached
    if (entry) entry.attachment = attached
    try {
      for await (const event of attached) {
        if (stopped) break
        // eslint-disable-next-line no-await-in-loop -- Drawing paces acknowledgement.
        await apply(event)
      }
    } catch (error) {
      if (!stopped) runtime.lost(key, error)
    } finally {
      if (entry?.attachment === attached) entry.attachment = undefined
      attachment = undefined
    }
  }
  void run()
  return {
    input: (data) => {
      const entry = runtime.entry(key)
      if (!attachment || !entry || entry.closed) return
      // Input typed while the runner is unreachable is dropped, not queued.
      void attachment.write(data).catch(() => {})
    },
    refit,
    stop: () => {
      stopped = true
      const attached = attachment
      attachment = undefined
      void attached?.detach()
    },
  }
}

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
    // A terminal already gone when the surface mounts has nothing to follow. One that
    // ends later keeps its last screen on show.
    const ended = useRef(terminal.state === "ended")

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
      const followed = ended.current ? undefined : followTerminal(runtime, terminalKey, screen)
      const input = xterm.onData((data) => followed?.input(data))
      // Some mouse reports arrive as binary; they go to the shell the same way.
      const binary = xterm.onBinary((data) => followed?.input(data))
      const resizes = new ResizeObserver(() => followed?.refit())
      resizes.observe(element)
      const scheme = window.matchMedia?.(darkScheme)
      const retheme = (): void => {
        xterm.options.theme = themeOf(element)
      }
      scheme?.addEventListener("change", retheme)
      view.current = { xterm, followed }
      return () => {
        view.current = null
        scheme?.removeEventListener("change", retheme)
        resizes.disconnect()
        input.dispose()
        binary.dispose()
        queries.dispose()
        followed?.stop()
        xterm.dispose()
      }
    }, [terminalKey])

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
        className="terminal-content runner-terminal nodrag nopan flex min-h-0 flex-1 flex-col p-3"
        hidden={minimized && !clipContent}
        aria-hidden={minimized}
        inert={minimized}
      >
        <div ref={host} className="min-h-0 flex-1" />
      </div>
    )
  }
  return RunnerTerminal
}
