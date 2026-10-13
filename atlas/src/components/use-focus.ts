import { useEffect, useRef } from "react"
import { useLocation } from "react-router"

// A row whose id matches the URL hash scrolls into view and reports `focused`.
export const useFocus = <T extends HTMLElement = HTMLDivElement>(id: string) => {
  const { hash } = useLocation()
  const ref = useRef<T>(null)
  const focused = decodeURIComponent(hash.slice(1)) === id
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center" })
  }, [focused])
  return { ref, focused }
}
