import { Portal } from "@ark-ui/react/portal"
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip"
import { useState, type ReactElement, type ReactNode } from "react"

import { useRestingPointer } from "./resting-pointer"

export type TooltipProps = {
  content: ReactNode
  children: ReactElement<{ id?: string }>
  disabled?: boolean
}

// How long the pointer rests on a trigger before its tooltip opens.
const restDelay = 400

// A tooltip under its trigger: it opens once the pointer rests there, or at once for
// keyboard focus, and closes as the pointer leaves, the focus moves, or it's pressed.
export const Tooltip = ({ content, children, disabled }: TooltipProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  const resting = useRestingPointer(restDelay, () => {
    if (!disabled) setOpen(true)
  })
  return (
    <ArkTooltip.Root
      disabled={disabled}
      ids={children.props.id ? { trigger: children.props.id } : undefined}
      open={open && !disabled}
      // The pointer opens it by resting, not by Ark's delay; keyboard focus still does.
      onOpenChange={({ open: next }) => {
        if (!next || !resting.over()) setOpen(next)
      }}
      openDelay={restDelay}
      closeDelay={100}
      positioning={{ placement: "bottom", gutter: 6, strategy: "fixed" }}
      lazyMount
      unmountOnExit
    >
      <ArkTooltip.Trigger
        asChild
        {...resting.handlers}
        // Ark would open it on its own as the pointer moves, at once while another
        // tooltip shows; only resting opens it, so Ark never sees the pointer hover. A
        // move with a button held is a drag's, which a sortable trigger needs whole.
        onPointerMoveCapture={(event) => {
          if (event.buttons === 0) event.preventDefault()
        }}
        onPointerOverCapture={(event) => {
          if (event.buttons === 0) event.preventDefault()
        }}
      >
        {children}
      </ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner className="z-50">
          <ArkTooltip.Content className="floating z-50 max-w-64 px-2 py-1.5 text-[11px]">
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  )
}
