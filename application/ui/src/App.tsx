import { useEffect, useState } from "react"

import { readStatus, type ServiceStatus } from "./services/status"

const tools = ["Hono", "TypeScript", "Vite", "React"] as const

export const App = (): React.JSX.Element => {
  const [status, setStatus] = useState<ServiceStatus["status"] | "connecting" | "unavailable">(
    "connecting",
  )

  useEffect(() => {
    let active = true

    void readStatus().then(
      (result) => {
        if (active) setStatus(result.status)
      },
      () => {
        if (active) setStatus("unavailable")
      },
    )

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="novadeck shell">
      <section className="hero" aria-labelledby="title">
        <p className="eyebrow">Application workspace</p>
        <h1 id="title">NovaDeck</h1>
        <p className="lede">A clean launchpad for the ideas that deserve their own window.</p>

        <ul className="tools" aria-label="Application stack">
          {tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      </section>

      <aside className="runtime" aria-label="Runtime status">
        <p>Runtime {status}</p>
        <dl>
          <div>
            <dt>Frontend</dt>
            <dd>React</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>Hono</dd>
          </div>
        </dl>
      </aside>
    </main>
  )
}
