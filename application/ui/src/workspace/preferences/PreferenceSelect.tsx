import { Portal } from "@ark-ui/react/portal"
import { Select, createListCollection } from "@ark-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { useMemo, type RefObject } from "react"

type Option = { label: string; value: string }

export const PreferenceSelect = ({
  label,
  items,
  value,
  onValueChange,
  open,
  onOpenChange,
  container,
}: {
  label: string
  items: Option[]
  value: string
  onValueChange?: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  container: RefObject<HTMLDialogElement | null>
}): React.JSX.Element => {
  const collection = useMemo(() => createListCollection({ items }), [items])
  return (
    <Select.Root
      className="preference-row flex min-h-[62px] items-center justify-between gap-4 border-b border-line text-[12px] text-ink"
      collection={collection}
      value={[value]}
      onValueChange={(details) => {
        if (details.value[0]) onValueChange?.(details.value[0])
      }}
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      positioning={{ placement: "bottom-end", sameWidth: true, gutter: 4, strategy: "fixed" }}
      lazyMount
      unmountOnExit
    >
      <Select.Label>{label}</Select.Label>
      <Select.Control>
        <Select.Trigger className="flex min-h-8 min-w-30 items-center justify-between gap-4 rounded-control border border-line bg-paper px-2.5 py-1.75 text-[11px] text-ink shadow-control hover:bg-shell data-[state=open]:border-line-strong">
          <Select.ValueText />
          <Select.Indicator className="text-muted">
            <ChevronDown size={13} aria-hidden="true" />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      {/* Stay inside the native dialog's top layer and outside its scrolling panels. */}
      <Portal container={container}>
        <Select.Positioner className="z-50">
          <Select.Content className="max-h-[min(240px,var(--available-height))] overflow-y-auto rounded-control border border-line bg-paper p-1 text-[11px] text-ink shadow-floating focus-visible:outline-none">
            {collection.items.map((item) => (
              <Select.Item
                key={item.value}
                item={item}
                className="flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded-control px-2 py-1.5 outline-none data-highlighted:bg-shell"
              >
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
      <Select.HiddenSelect />
    </Select.Root>
  )
}
