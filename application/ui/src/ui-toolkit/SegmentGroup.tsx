import { SegmentGroup as ArkSegmentGroup } from "@ark-ui/react/segment-group"
import { useId, type ReactNode } from "react"

import { cn } from "../class-name"
import { Tooltip } from "./Tooltip"

export type SegmentOption = {
  value: string
  label: string
  icon?: ReactNode
}

export type SegmentGroupProps = {
  label: string
  items: SegmentOption[]
  value: string
  onValueChange: (value: string) => void
  className?: string
  itemClassName?: string
}

export const SegmentGroup = ({
  label,
  items,
  value,
  onValueChange,
  className,
  itemClassName,
}: SegmentGroupProps): React.JSX.Element => {
  const id = useId()
  const itemId = (item: string): string => `${id}:${item}`
  return (
    <ArkSegmentGroup.Root
      id={id}
      ids={{ item: itemId }}
      orientation="horizontal"
      aria-label={label}
      className={className}
      value={value}
      onValueChange={(details) => {
        if (details.value !== null) onValueChange(details.value)
      }}
    >
      {items.map((item) => (
        <Tooltip key={item.value} content={item.label}>
          <ArkSegmentGroup.Item
            id={itemId(item.value)}
            value={item.value}
            className={cn(
              "relative cursor-pointer transition-[background-color,color,border-color] duration-(--motion-feedback) ease-interface data-focus-visible:outline data-focus-visible:outline-1 data-focus-visible:outline-muted data-focus-visible:outline-offset-2",
              itemClassName,
              value === item.value && "active border-line bg-paper text-ink shadow-control",
            )}
          >
            {item.icon}
            <ArkSegmentGroup.ItemText>{item.label}</ArkSegmentGroup.ItemText>
            <ArkSegmentGroup.ItemControl className="sr-only" />
            <ArkSegmentGroup.ItemHiddenInput aria-label={item.label} />
          </ArkSegmentGroup.Item>
        </Tooltip>
      ))}
    </ArkSegmentGroup.Root>
  )
}
