import { Portal } from "@ark-ui/react/portal"
import { Select as ArkSelect, createListCollection } from "@ark-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { useMemo, type RefObject } from "react"

import { cn } from "../class-name"

export type SelectOption = { label: string; value: string; description?: string }

export type SelectProps = {
  label: string
  variant?: "field" | "title"
  items: SelectOption[]
  value: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  portalContainer?: RefObject<HTMLElement | null>
  className?: string
}

export const Select = ({
  label,
  variant = "field",
  items,
  value,
  onValueChange,
  open,
  onOpenChange,
  portalContainer,
  className,
}: SelectProps): React.JSX.Element => {
  const collection = useMemo(() => createListCollection({ items }), [items])
  return (
    <ArkSelect.Root
      className={cn(
        "flex min-w-0 items-center justify-between gap-4 text-[12px] text-ink",
        className,
      )}
      collection={collection}
      value={[value]}
      onValueChange={(details) => {
        if (details.value[0] !== undefined) onValueChange?.(details.value[0])
      }}
      open={open}
      onOpenChange={(details) => onOpenChange?.(details.open)}
      positioning={{
        placement: variant === "title" ? "bottom-start" : "bottom-end",
        sameWidth: variant !== "title",
        gutter: 4,
        strategy: "fixed",
        overflowPadding: 12,
      }}
      lazyMount
      unmountOnExit
    >
      <ArkSelect.Label className={variant === "title" ? "sr-only" : undefined}>
        {label}
      </ArkSelect.Label>
      <ArkSelect.Control className="min-w-0">
        <ArkSelect.Trigger
          className={
            variant === "title"
              ? "flex min-h-8 max-w-full items-center gap-2 rounded-control px-2 text-xs font-medium text-ink hover:bg-shell data-[state=open]:bg-shell"
              : "flex min-h-8 min-w-30 items-center justify-between gap-4 rounded-control border border-line bg-paper px-2.5 py-1.75 text-[11px] text-ink shadow-control hover:bg-shell data-[state=open]:border-line-strong"
          }
        >
          <ArkSelect.ValueText className="truncate" />
          <ArkSelect.Indicator className="text-muted">
            <ChevronDown size={13} aria-hidden="true" />
          </ArkSelect.Indicator>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      {/* Modal callers supply their top-layer container; otherwise portal to the document body. */}
      <Portal container={portalContainer}>
        <ArkSelect.Positioner className="z-50">
          <ArkSelect.Content
            className={cn(
              "z-50 max-h-[min(240px,var(--available-height))] overflow-y-auto rounded-control border border-line bg-paper p-1 text-[11px] text-ink shadow-floating focus-visible:outline-none",
              variant === "title" && "min-w-48 max-w-[calc(100vw-24px)]",
            )}
          >
            {collection.items.map((item) => (
              <ArkSelect.Item
                key={item.value}
                item={item}
                className="flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded-control px-2 py-1.5 outline-none data-highlighted:bg-shell"
              >
                <ArkSelect.ItemText className="min-w-0 truncate">{item.label}</ArkSelect.ItemText>
                {item.description && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted">
                    {item.description}
                  </span>
                )}
                <ArkSelect.ItemIndicator>
                  <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                </ArkSelect.ItemIndicator>
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
      <ArkSelect.HiddenSelect />
    </ArkSelect.Root>
  )
}
