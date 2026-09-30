import { HoverCard as ArkHoverCard } from "@ark-ui/react/hover-card"
import { Portal } from "@ark-ui/react/portal"
import { useRef, useState, type ReactElement, type ReactNode } from "react"

export type HoverCardProps = {
  trigger: ReactElement
  children: ReactNode
  className?: string
}

// A peek above its trigger, for the pointer: it opens on hover and stays while the
// pointer is on either, so what's in it can be clicked. Focus doesn't open it, so give
// the trigger another way to what the peek offers, such as a menu. A context menu opened
// on the trigger closes it.
export const HoverCard = ({ trigger, children, className }: HoverCardProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  const hovering = useRef(false)
  return (
    <ArkHoverCard.Root
      open={open}
      onOpenChange={({ open: next }) => setOpen(next && (open || hovering.current))}
      openDelay={250}
      closeDelay={120}
      positioning={{ placement: "top-start", strategy: "fixed", gutter: 8, overflowPadding: 12 }}
      lazyMount
      unmountOnExit
    >
      <ArkHoverCard.Trigger
        asChild
        onPointerEnter={() => {
          hovering.current = true
        }}
        onPointerLeave={() => {
          hovering.current = false
        }}
        onContextMenu={() => setOpen(false)}
      >
        {trigger}
      </ArkHoverCard.Trigger>
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
}
