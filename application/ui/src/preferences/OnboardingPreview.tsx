import { Check, Columns2, Grid2X2, Maximize, Terminal } from "lucide-react"
import { useId, useState } from "react"

import { ClaudeIcon } from "../ui-toolkit/icons/ClaudeIcon"
import { CodexIcon } from "../ui-toolkit/icons/CodexIcon"

import styles from "./OnboardingPreview.module.css"

const views = [
  {
    id: "focus",
    label: "Focus",
    icon: Columns2,
    title: "One thing. Your full attention.",
    detail: "Give a single terminal the whole stage.",
  },
  {
    id: "grid",
    label: "Grid",
    icon: Grid2X2,
    title: "Parallel work. All in view.",
    detail: "Keep your agents and tools side by side.",
  },
  {
    id: "canvas",
    label: "Canvas",
    icon: Maximize,
    title: "More room for your train of thought.",
    detail: "Arrange your terminals on a zoomable canvas.",
  },
] as const

export const OnboardingPreview = (): React.JSX.Element => {
  const [view, setView] = useState<(typeof views)[number]>(views[2])
  const caption = useId()

  return (
    <section className="mt-6" aria-label="Explore your workspace">
      <div className={styles.stage} data-view={view.id} aria-hidden="true">
        <div className={styles.coordinates}>YOUR WORKSPACE / YOUR WAY</div>
        <div className={`${styles.terminal} ${styles.agent}`}>
          <div className={styles.bar}>
            <ClaudeIcon size={13} />
            <span>Build something great</span>
            <span className={styles.dot} />
          </div>
          <div className={styles.code}>
            <span className={styles.prompt}>❯ Let’s bring this idea to life.</span>
            <span className={styles.response}>I’ll start with the big picture.</span>
            <span className={styles.line}>
              <Check size={10} /> A place for every project
            </span>
            <span className={styles.line}>
              <Check size={10} /> Room for every possibility
            </span>
            <span className={styles.cursor}>
              ❯ <i />
            </span>
          </div>
        </div>
        <div className={`${styles.terminal} ${styles.review}`}>
          <div className={styles.bar}>
            <CodexIcon size={13} />
            <span>A fresh perspective</span>
            <span className={styles.dot} />
          </div>
          <div className={styles.code}>
            <span className={styles.prompt}>❯ Review the changes</span>
            <span className={styles.response}>A second pair of eyes,</span>
            <span className={styles.response}>right beside your work.</span>
          </div>
        </div>
        <div className={`${styles.terminal} ${styles.server}`}>
          <div className={styles.bar}>
            <Terminal size={13} />
            <span>Dev server</span>
            <span className={styles.dot} />
          </div>
          <div className={styles.code}>
            <span className={styles.prompt}>$ pnpm dev</span>
            <span className={styles.line}>
              <Check size={10} /> Ready when you are.
            </span>
            <span className={styles.response}>localhost:5173</span>
          </div>
        </div>
        <div className={styles.scale}>
          − <span>{view.id === "canvas" ? "75%" : "100%"}</span> +
        </div>
      </div>

      <div
        className="mt-4 flex items-center justify-center gap-1"
        role="group"
        aria-label="Preview workspace layout"
        aria-describedby={caption}
      >
        {views.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={view.id === item.id}
              onClick={() => setView(item)}
              className={`flex min-h-9 items-center gap-2 rounded-control border px-3 py-2 text-[11px] ${view.id === item.id ? "border-line-strong bg-paper text-ink shadow-control" : "border-transparent text-muted hover:bg-soft hover:text-ink"}`}
            >
              <Icon size={13} strokeWidth={1.6} aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </div>
      <div id={caption} className="mt-3 text-center" aria-live="polite" aria-atomic="true">
        <p className="m-0 text-[12px] font-medium tracking-[-0.1px]">{view.title}</p>
        <p className="mt-1 mb-0 text-[10px] leading-relaxed text-muted">{view.detail}</p>
      </div>
    </section>
  )
}
