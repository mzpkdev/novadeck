import { useState } from "react"

import type { ConnectionSnapshot } from "../services/runtime-connection"

export const StartupPanel = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element => (
  <main className="flex min-h-dvh items-center justify-center bg-paper p-6 text-ink">
    <section
      className="w-full max-w-md rounded-panel border border-line bg-shell p-7 shadow-panel"
      aria-label={title}
    >
      <p className="mb-6 text-lg font-semibold tracking-tight">
        novadeck<span className="text-muted">.</span>
      </p>
      <h1 className="mb-3 text-lg font-medium">{title}</h1>
      {children}
    </section>
  </main>
)

export const ConnectionScreen = ({
  state,
  endpoint,
  desktop,
  onConnect,
  error,
}: {
  state: ConnectionSnapshot
  endpoint: string
  desktop: boolean
  onConnect: (token: string) => Promise<void>
  error?: string | null
}): React.JSX.Element => {
  const [token, setToken] = useState("")
  const pending = state.status === "connecting" || state.status === "reconnecting"
  return (
    <StartupPanel title={desktop ? "Starting your workspace" : "Connect to your runtime"}>
      <p className="mb-5 text-sm leading-6 text-muted">
        {desktop
          ? "Your local runtime keeps projects, sessions, and terminals together."
          : "Enter the access token for your terminal server. It is kept only for this connection."}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (pending) return
          const credential = token
          setToken("")
          void onConnect(credential).catch(() => undefined)
        }}
      >
        {!desktop && (
          <>
            <label className="flex flex-col gap-2 text-xs text-muted">
              Server
              <input
                className="rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink"
                value={endpoint}
                readOnly
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted">
              Access token
              <input
                className="rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
                disabled={pending}
              />
            </label>
          </>
        )}
        {(error || state.error) && (
          <p role="alert" className="text-sm leading-5 text-muted">
            {error || state.error}
          </p>
        )}
        <button
          type="submit"
          className="small-button justify-center disabled:opacity-50"
          disabled={pending || (!desktop && !token)}
        >
          {pending ? "Connecting…" : desktop ? "Retry connection" : "Connect"}
        </button>
        <a className="text-center text-xs text-muted underline underline-offset-4" href="?demo=1">
          Explore the demo
        </a>
      </form>
    </StartupPanel>
  )
}
