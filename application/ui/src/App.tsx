import { ark } from "@ark-ui/react/factory"
import {
  Atom,
  Braces,
  CircleCheck,
  CircleX,
  LoaderCircle,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "./class-name"
import { readStatus, type ServiceStatus } from "./services/status"

const tools = [
  { icon: Server, label: "Hono" },
  { icon: Braces, label: "TypeScript" },
  { icon: Zap, label: "Vite" },
  { icon: Atom, label: "React" },
] as const satisfies ReadonlyArray<{ icon: LucideIcon; label: string }>

const statusDetails = {
  connecting: { icon: LoaderCircle, style: "text-sky-300", spin: true },
  ready: { icon: CircleCheck, style: "text-emerald-300", spin: false },
  unavailable: { icon: CircleX, style: "text-red-300", spin: false },
} as const

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

  const statusDetail = statusDetails[status]
  const StatusIcon = statusDetail.icon

  return (
    <ark.main className="relative grid min-h-svh min-w-80 items-end gap-[clamp(2rem,8vw,7rem)] overflow-hidden bg-[#090b10] px-[clamp(2rem,7vw,6rem)] py-[clamp(2rem,7vw,6rem)] font-sans text-[#f4f5f7] antialiased before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_15%_20%,rgb(95_94_255_/_24%),transparent_32rem),radial-gradient(circle_at_85%_80%,rgb(0_194_255_/_16%),transparent_28rem)] before:content-[''] md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <ark.section className="relative" aria-labelledby="title">
        <p className="mb-4 text-xs font-bold tracking-[0.18em] text-[#9aa3b8] uppercase">
          Application workspace
        </p>
        <h1
          className="text-[clamp(4rem,12vw,9rem)] leading-[0.82] font-bold tracking-[-0.075em]"
          id="title"
        >
          NovaDeck
        </h1>

        <ul className="mt-8 flex list-none flex-wrap gap-2.5 p-0" aria-label="Application stack">
          {tools.map(({ icon: Icon, label }) => (
            <li
              className="inline-flex items-center gap-2 rounded-[0.65rem] border border-white/10 bg-linear-to-br from-white/8 to-white/3 px-3 py-2 text-xs font-semibold tracking-[0.03em] text-[#cbd3e1] shadow-[inset_0_1px_0_rgb(255_255_255_/_6%),0_0.5rem_1.5rem_rgb(0_0_0_/_10%)]"
              key={label}
            >
              <Icon aria-hidden="true" className="size-3.5 text-cyan-300" strokeWidth={1.75} />
              {label}
            </li>
          ))}
        </ul>
      </ark.section>

      <ark.aside
        className="relative rounded-[1.25rem] border border-[#292e3a] bg-[rgb(14_17_24_/_78%)] p-5 shadow-[0_1.5rem_5rem_rgb(0_0_0_/_35%)] backdrop-blur-3xl"
        aria-label="Runtime status"
      >
        <p
          className={cn(
            "mb-4 flex items-center gap-2 text-xs font-bold tracking-[0.08em] uppercase",
            statusDetail.style,
          )}
        >
          <StatusIcon
            aria-hidden="true"
            className={cn("size-4", statusDetail.spin && "animate-spin")}
          />
          Runtime {status}
        </p>
        <dl className="grid gap-3.5">
          <div className="flex justify-between gap-4">
            <dt className="text-[#7e879b]">Frontend</dt>
            <dd className="m-0 text-[#e9ecf3] tabular-nums">React</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#7e879b]">Backend</dt>
            <dd className="m-0 text-[#e9ecf3] tabular-nums">Hono</dd>
          </div>
        </dl>
      </ark.aside>
    </ark.main>
  )
}
