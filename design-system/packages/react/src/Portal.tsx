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
const contextMediaQueries = [
  "(dynamic-range: high)",
  "(forced-colors: active)",
  "(inverted-colors: inverted)",
  "(prefers-color-scheme: dark)",
  "(prefers-contrast: more)",
  "(prefers-reduced-motion: reduce)",
] as const

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
  const inheritedProperties = new Set<string>()
  if (computedStyle) {
    for (const property of computedStyle) {
      if (!property.startsWith("--")) continue
      inheritedProperties.add(property)
      container.style.setProperty(property, computedStyle.getPropertyValue(property))
    }
  }

  let styledAncestor: HTMLElement | null = source
  while (styledAncestor) {
    for (const property of styledAncestor.style) {
      if (!property.startsWith("--") || inheritedProperties.has(property)) continue
      inheritedProperties.add(property)
      container.style.setProperty(property, styledAncestor.style.getPropertyValue(property))
    }
    styledAncestor = styledAncestor.parentElement
  }

  const previousProperties = Array.from(container.style)
  for (const property of previousProperties) {
    if (property.startsWith("--") && !inheritedProperties.has(property))
      container.style.removeProperty(property)
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

    const synchronize = () => synchronizeContext(nextContainer, contextSource)
    const contextWindow = contextSource.ownerDocument.defaultView
    const MutationObserver = contextWindow?.MutationObserver
    const ResizeObserver = contextWindow?.ResizeObserver
    const observer = MutationObserver ? new MutationObserver(synchronize) : null
    const resizeObserver = ResizeObserver ? new ResizeObserver(synchronize) : null
    const mediaQueries =
      contextWindow && typeof contextWindow.matchMedia === "function"
        ? contextMediaQueries.map((query) => contextWindow.matchMedia(query))
        : []
    let ancestor: HTMLElement | null = contextSource
    while (ancestor) {
      observer?.observe(ancestor, { attributes: true })
      resizeObserver?.observe(ancestor)
      ancestor = ancestor.parentElement
    }
    observer?.observe(contextSource.ownerDocument.documentElement, {
      characterData: true,
      childList: true,
      subtree: true,
    })
    contextWindow?.addEventListener("resize", synchronize)
    contextWindow?.visualViewport?.addEventListener("resize", synchronize)
    for (const mediaQuery of mediaQueries) mediaQuery.addEventListener("change", synchronize)

    return () => {
      observer?.disconnect()
      resizeObserver?.disconnect()
      contextWindow?.removeEventListener("resize", synchronize)
      contextWindow?.visualViewport?.removeEventListener("resize", synchronize)
      for (const mediaQuery of mediaQueries) mediaQuery.removeEventListener("change", synchronize)
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
