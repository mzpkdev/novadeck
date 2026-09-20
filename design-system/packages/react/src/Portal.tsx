import { Portal as ArkPortal } from "@ark-ui/react/portal"
import type { ReactNode } from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"

export type PortalProps = {
  active?: boolean
  children?: ReactNode
  disabled?: boolean
  source?: HTMLElement | null | undefined
}

const inheritedAttributes = ["data-theme", "dir", "lang"] as const

const synchronizeContext = (container: HTMLElement, source: HTMLElement) => {
  const island = source.closest<HTMLElement>(".novadeck")
  const themeClasses = island
    ? [...island.classList].filter((className) => className.startsWith("theme-"))
    : []
  container.className = ["novadeck", ...themeClasses].join(" ")

  for (const attribute of inheritedAttributes) {
    const owner = island?.closest<HTMLElement>(`[${attribute}]`) ?? source.closest(`[${attribute}]`)
    const value = owner?.getAttribute(attribute)
    if (value === null || value === undefined) container.removeAttribute(attribute)
    else container.setAttribute(attribute, value)
  }

  const computedStyle = source.ownerDocument.defaultView?.getComputedStyle(source)
  if (!computedStyle) return
  for (const property of computedStyle) {
    if (property.startsWith("--"))
      container.style.setProperty(property, computedStyle.getPropertyValue(property))
  }
}

export const Portal = ({ active = true, children, disabled = false, source }: PortalProps) => {
  const fallbackSource = useRef<HTMLSpanElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const containerRef = useMemo(() => ({ current: container }), [container])

  useLayoutEffect(() => {
    if (disabled || !active) return
    const contextSource = source === undefined ? fallbackSource.current : source
    if (!contextSource) return

    const nextContainer = contextSource.ownerDocument.createElement("div")
    nextContainer.dataset.novadeckPortal = ""
    nextContainer.style.display = "contents"
    synchronizeContext(nextContainer, contextSource)
    const root = contextSource.getRootNode()
    const ShadowRoot = contextSource.ownerDocument.defaultView?.ShadowRoot
    const host = ShadowRoot && root instanceof ShadowRoot ? root : contextSource.ownerDocument.body
    host.append(nextContainer)
    setContainer(nextContainer)

    const Observer = contextSource.ownerDocument.defaultView?.MutationObserver
    const observer = Observer
      ? new Observer(() => synchronizeContext(nextContainer, contextSource))
      : null
    let ancestor: HTMLElement | null = contextSource
    while (ancestor) {
      observer?.observe(ancestor, { attributes: true })
      ancestor = ancestor.parentElement
    }

    return () => {
      observer?.disconnect()
      nextContainer.remove()
      setContainer(null)
    }
  }, [active, disabled, source])

  if (disabled) return children
  return (
    <>
      {source === undefined && (
        <span aria-hidden="true" data-novadeck-portal-anchor="" hidden ref={fallbackSource} />
      )}
      {active && container ? <ArkPortal container={containerRef}>{children}</ArkPortal> : null}
    </>
  )
}
