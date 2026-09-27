import "@xterm/xterm/css/xterm.css"
import type { TerminalEvent, TerminalExit } from "@novadeck/protocol"
import { hasCode, type AttachedTerminal } from "@novadeck/protocol/client"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal, type ITheme } from "@xterm/xterm"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import type { TerminalKey, TerminalSurfaceProps } from "../port"
import { exitStatus, restartable } from "./activity"
import type { RunnerEntry, SurfaceRuntime } from "./backend"
import { silenceQueries } from "./queries"

// The screen a runner terminal draws on, reduced to what following it needs.
export type Screen = {
  readonly write: (data: string) => Promise<void>
  readonly reset: () => void
  readonly resize: (size: { readonly cols: number; readonly rows: number }) => void
  // The size that fits the element now; undefined while it has no room, as when hidden.
  readonly fit: () => { readonly cols: number; readonly rows: number } | undefined
  // Called in stream order once the shell has exited, after its last output is drawn,
  // with whether it waits for Enter to start again.
  readonly exited: (waiting: boolean) => void
  // Whether a stream is drawing the current shell: true once its screen arrived, false
  // once the stream ended, or while it takes up again after a reconnection
  // (`resuming`). Input goes nowhere in between.
  readonly live: (live: boolean, resuming?: boolean) => void
}

export type FollowedTerminal = {
  // Sends typed input; dropped while there is no attachment.
  readonly input: (data: string) => void
  // Tells the runner the size that fits now, if it changed.
  readonly refit: () => void
  // Whether a stream is attached, which then reports the exit itself.
  readonly attached: () => boolean
  readonly stop: () => void
}

// Attaches to the terminal, draws what it sends, and passes input and size back until
// stopped. When its shell exits, or the runner loses it, the surface waits for a fresh
// shell and attaches again. A terminal another window controls is reported instead.
export const followTerminal = (
  runtime: SurfaceRuntime,
  key: TerminalKey,
  screen: Screen,
): FollowedTerminal => {
  let stopped = false
  let stop: (() => void) | undefined
  const halted = new Promise<void>((resolve) => {
    stop = resolve
  })
  let attachment: AttachedTerminal | undefined
  let sent: string | undefined
  const refit = (): void => {
    const size = screen.fit()
    const entry = runtime.entry(key)
    if (size && entry) entry.size = size
    if (!size || !attachment) return
    screen.resize(size)
    const next = `${size.cols}x${size.rows}`
    if (next === sent) return
    sent = next
    const attached = attachment
    void attached.resize(size).catch(() => {
      sent = undefined
      // Busy or reconnecting: try again while this stream lasts.
      setTimeout(() => {
        if (attachment === attached) refit()
      }, 500)
    })
  }
  const apply = async (event: TerminalEvent): Promise<void> => {
    if (event.type === "snapshot") {
      screen.reset()
      screen.resize(event)
      sent = `${event.cols}x${event.rows}`
      await screen.write(event.data)
      screen.live(true)
      if (event.status === "exited") {
        runtime.exited(key, event.exit)
        screen.exited(waitsForEnter(event.exit))
      }
      refit()
    } else if (event.type === "output") await screen.write(event.data)
    else if (event.type === "exited") {
      runtime.exited(key, event.exit)
      screen.exited(waitsForEnter(event.exit))
    } else if (event.type === "resized") {
      sent = `${event.cols}x${event.rows}`
      screen.resize(event)
    }
  }
  const wanted = (entry: RunnerEntry): boolean => !stopped && !entry.closed
  // Attaches, retrying after the runner comes back; undefined when it cannot.
  const open = async (entry: RunnerEntry): Promise<AttachedTerminal | undefined> => {
    while (wanted(entry)) {
      try {
        // eslint-disable-next-line no-await-in-loop -- Retry after the runner comes back.
        const attached = await runtime.attach(key.terminalId)
        if (wanted(entry)) return attached
        // eslint-disable-next-line no-await-in-loop -- Release before giving up.
        await attached.detach()
        return undefined
      } catch (error) {
        if (hasCode(error, "RESOURCE_LIMIT")) {
          // Too many calls in flight: try again shortly.
          // eslint-disable-next-line no-await-in-loop -- Back off before trying again.
          await Promise.race([pause(300), halted])
          continue
        }
        if (!hasCode(error, "DISCONNECTED")) {
          runtime.lost(key, error)
          return undefined
        }
        // eslint-disable-next-line no-await-in-loop -- Wait for the runner to come back.
        await Promise.race([runtime.connected(), halted])
      }
    }
    return undefined
  }
  const follow = async (entry: RunnerEntry, attached: AttachedTerminal): Promise<void> => {
    attachment = attached
    entry.attachment = attached
    try {
      for await (const event of attached) {
        if (stopped) break
        // eslint-disable-next-line no-await-in-loop -- Drawing paces acknowledgement.
        await apply(event)
      }
    } catch (error) {
      if (!stopped) runtime.lost(key, error)
    } finally {
      if (entry.attachment === attached) entry.attachment = undefined
      attachment = undefined
      screen.live(false)
    }
  }
  const running = (): boolean => !stopped
  const run = async (): Promise<void> => {
    while (running()) {
      const entry = runtime.entry(key)
      if (!entry || entry.closed) return
      // Taken first, so a fresh shell started while this one attaches is not missed.
      const { revived } = entry
      // eslint-disable-next-line no-await-in-loop -- The shell must exist first.
      const ready = await Promise.race([entry.ready, halted])
      // eslint-disable-next-line no-await-in-loop -- Then attach to it.
      const attached = ready && (await runtime.track(open(entry)))
      // eslint-disable-next-line no-await-in-loop -- One attachment at a time.
      if (attached) await follow(entry, attached)
      // eslint-disable-next-line no-await-in-loop -- Wait for a fresh shell.
      await Promise.race([revived, halted])
    }
  }
  void run()
  // After a reconnection the attachment takes up again on its own, without a new screen.
  // Until a call through it succeeds, input would be lost, so the surface stays locked;
  // re-sending the current size is a harmless call to find out.
  let resumes = 0
  const resume = async (attached: AttachedTerminal): Promise<void> => {
    const turn = (resumes += 1)
    screen.live(false, true)
    const current = (): boolean => !stopped && attachment === attached && turn === resumes
    while (current()) {
      const size = runtime.entry(key)?.size ?? screen.fit()
      try {
        // eslint-disable-next-line no-await-in-loop -- One probe at a time.
        if (size) await attached.resize(size)
        if (current()) screen.live(true)
        return
      } catch {
        // eslint-disable-next-line no-await-in-loop -- Still reattaching; look again soon.
        await Promise.race([pause(200), halted])
      }
    }
  }
  let previous = runtime.connection.getSnapshot()
  const unsubscribe = runtime.connection.subscribe(() => {
    const state = runtime.connection.getSnapshot()
    const back = previous !== "connected" && state === "connected"
    previous = state
    if (back && attachment) void resume(attachment)
  })
  return {
    input: (data) => {
      const entry = runtime.entry(key)
      if (!attachment || !entry || entry.closed) return
      void attachment.write(data).catch(() => {})
    },
    refit,
    attached: () => attachment !== undefined,
    stop: () => {
      unsubscribe()
      stopped = true
      stop?.()
      const attached = attachment
      attachment = undefined
      void attached?.detach()
    },
  }
}

const waitsForEnter = (exit: TerminalExit | null): boolean => {
  const status = exitStatus(exit)
  return status !== "clean" && restartable(status)
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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
      return () => {
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
