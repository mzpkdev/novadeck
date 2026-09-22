import { Portal } from "@ark-ui/react/portal"
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip"
import type { ReactElement, ReactNode } from "react"

export type TooltipProps = {
  content: ReactNode
  children: ReactElement<{ id?: string }>
  disabled?: boolean
}

export const Tooltip = ({ content, children, disabled }: TooltipProps): React.JSX.Element => (
  <ArkTooltip.Root
    disabled={disabled}
    ids={children.props.id ? { trigger: children.props.id } : undefined}
    openDelay={400}
    closeDelay={100}
    positioning={{ placement: "bottom", gutter: 6, strategy: "fixed" }}
    lazyMount
    unmountOnExit
  >
    <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
    <Portal>
      <ArkTooltip.Positioner className="z-50">
        <ArkTooltip.Content className="z-50 max-w-64 rounded-control border border-line bg-paper px-2 py-1.5 text-[11px] text-ink shadow-floating">
          {content}
        </ArkTooltip.Content>
      </ArkTooltip.Positioner>
    </Portal>
  </ArkTooltip.Root>
)
