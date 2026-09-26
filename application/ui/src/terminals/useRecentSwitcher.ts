import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"

import type { TerminalMetadata } from "../model/types"

export type RecentSwitcher = {
  context: string
  ids: string[]
  index: number
  fromInput: boolean
  mode: "held" | "click"
}

export type RecentSwitcherOptions = {
  context: string
  dialog: string | null
  terminals: TerminalMetadata[]
  ordered: TerminalMetadata[]
  selected: string
}

export type RecentSwitcherController = {
  readonly recentSwitcher: RecentSwitcher | null
  readonly visibleRecentSwitcher: RecentSwitcher | null
  readonly setRecentSwitcher: Dispatch<SetStateAction<RecentSwitcher | null>>
  readonly closeRecentSwitcher: () => void
  readonly openRecentSwitcher: (id: string, trigger: HTMLButtonElement) => void
  readonly recentIds: () => string[]
}

export const useRecentSwitcher = ({
  context,
  dialog,
  terminals,
  ordered,
  selected,
}: RecentSwitcherOptions): RecentSwitcherController => {
  const [recentSwitcher, setRecentSwitcher] = useState<RecentSwitcher | null>(null)
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
    const ids = recentByContext.current[context] ?? ordered.map((terminal) => terminal.id)
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
      ...previous.filter(
        (id) => id !== selected && terminals.some((terminal) => terminal.id === id),
      ),
      ...ordered
        .map((terminal) => terminal.id)
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
