import { useEffect, useRef, useState } from "react"

import type { TerminalMetadata } from "../model/types"

export const useRecentSwitcher = ({
  context,
  dialog,
  sessions,
  ordered,
  selected,
}: {
  context: string
  dialog: string | null
  sessions: TerminalMetadata[]
  ordered: TerminalMetadata[]
  selected: string
}) => {
  const [recentSwitcher, setRecentSwitcher] = useState<{
    context: string
    ids: string[]
    index: number
    fromInput: boolean
    mode: "held" | "click"
  } | null>(null)
  const switcherTrigger = useRef<HTMLButtonElement | null>(null)
  const recentByContext = useRef<Record<string, string[]>>({})
  const visibleRecentSwitcher =
    recentSwitcher?.context === context && !dialog ? recentSwitcher : null
  if (recentSwitcher && !visibleRecentSwitcher) setRecentSwitcher(null)
  const closeRecentSwitcher = (): void => {
    const trigger = visibleRecentSwitcher?.mode === "click" ? switcherTrigger.current : null
    setRecentSwitcher(null)
    queueMicrotask(() => trigger?.isConnected && trigger.focus({ preventScroll: true }))
  }
  const openRecentSwitcher = (id: string, trigger: HTMLButtonElement): void => {
    const ids = recentByContext.current[context] ?? ordered.map((session) => session.id)
    switcherTrigger.current = trigger
    setRecentSwitcher({
      context,
      ids,
      index: Math.max(0, ids.indexOf(id)),
      fromInput: false,
      mode: "click",
    })
  }
  useEffect(() => {
    const previous = recentByContext.current[context] ?? []
    recentByContext.current[context] = [
      ...(selected ? [selected] : []),
      ...previous.filter((id) => id !== selected && sessions.some((session) => session.id === id)),
      ...ordered
        .map((session) => session.id)
        .filter((id) => id !== selected && !previous.includes(id)),
    ]
  })

  const recentIds = (): string[] => recentByContext.current[context] ?? []
  return {
    recentSwitcher,
    visibleRecentSwitcher,
    setRecentSwitcher,
    closeRecentSwitcher,
    openRecentSwitcher,
    recentIds,
  }
}
