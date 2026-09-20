const tools = ["Electron", "TypeScript", "Vite", "React"] as const

export const App = (): React.JSX.Element => {
  const { versions } = window.novadeck

  return (
    <main className="novadeck shell">
      <section className="hero" aria-labelledby="title">
        <p className="eyebrow">Desktop workspace</p>
        <h1 id="title">NovaDeck</h1>
        <p className="lede">A clean launchpad for the ideas that deserve their own window.</p>

        <ul className="tools" aria-label="Application stack">
          {tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      </section>

      <aside className="runtime" aria-label="Runtime versions">
        <p>Runtime ready</p>
        <dl>
          <div>
            <dt>Electron</dt>
            <dd>{versions.electron}</dd>
          </div>
          <div>
            <dt>Chrome</dt>
            <dd>{versions.chrome}</dd>
          </div>
          <div>
            <dt>Node</dt>
            <dd>{versions.node}</dd>
          </div>
        </dl>
      </aside>
    </main>
  )
}
