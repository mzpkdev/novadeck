import { HoverCard as ArkHoverCard } from "@ark-ui/react/hover-card"
import { Portal } from "@ark-ui/react/portal"
import type { ReactElement, ReactNode } from "react"

export type HoverCardProps = {
  trigger: ReactElement
  children: ReactNode
  className?: string
}

// A peek above its trigger, opened by hovering or focusing it. It stays while the pointer
// is on either, so what's in it can be clicked.
export const HoverCard = ({ trigger, children, className }: HoverCardProps): React.JSX.Element => (
  <ArkHoverCard.Root
    openDelay={250}
    closeDelay={120}
    positioning={{ placement: "top-start", strategy: "fixed", gutter: 8, overflowPadding: 12 }}
    lazyMount
    unmountOnExit
  >
    <ArkHoverCard.Trigger asChild>{trigger}</ArkHoverCard.Trigger>
    <Portal>
      <ArkHoverCard.Positioner className="z-40">
        <ArkHoverCard.Content
          className={`z-40 rounded-popover border border-line-strong bg-paper text-ink shadow-floating focus-visible:outline-none ${className ?? ""}`}
        >
          {children}
        </ArkHoverCard.Content>
      </ArkHoverCard.Positioner>
    </Portal>
  </ArkHoverCard.Root>
)
