import { Combobox, createListCollection } from "@ark-ui/react/combobox"
import { useMemo, type ReactNode, type RefObject } from "react"

import { cn } from "../class-name"

export const searchResultClasses =
  "group flex min-h-15 w-full cursor-pointer items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-left hover:border-line hover:bg-shell data-highlighted:border-line data-highlighted:bg-shell [&>svg]:shrink-0 [&>svg]:text-muted"

export type SearchOption = { value: string; label: string; content: ReactNode }

export const SearchCombobox = ({
  items,
  label,
  placeholder,
  resultsLabel,
  controlClassName,
  contentClassName,
  query,
  onQueryChange,
  onSelect,
  inputRef,
  leading,
  trailing,
  empty,
}: {
  items: SearchOption[]
  label: string
  placeholder: string
  resultsLabel: string
  controlClassName?: string
  contentClassName?: string
  query: string
  onQueryChange: (query: string) => void
  onSelect: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  leading: ReactNode
  trailing: ReactNode
  empty: ReactNode
}): React.JSX.Element => {
  const collection = useMemo(() => createListCollection({ items }), [items])
  return (
    <Combobox.Root
      collection={collection}
      open
      disableLayer
      inputValue={query}
      onInputValueChange={({ inputValue }) => onQueryChange(inputValue)}
      inputBehavior="autohighlight"
      defaultHighlightedValue={items[0]?.value}
      selectionBehavior="preserve"
      onSelect={({ value }) => {
        if (value[0]) onSelect(value[0])
      }}
    >
      <Combobox.Control
        className={cn(
          "flex min-h-17 items-center gap-3 border-b border-line px-5 py-3 text-muted",
          controlClassName,
        )}
      >
        {leading}
        <Combobox.Context>
          {(combobox) => (
            <Combobox.Input
              ref={inputRef}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink focus-visible:outline-none"
              aria-label={label}
              placeholder={placeholder}
              onFocus={() => {
                if (items[0]) combobox.setHighlightValue(items[0].value)
              }}
              onKeyDownCapture={(event) => {
                // A pointer can clear the highlight; Enter still opens the first match.
                if (
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing &&
                  !combobox.highlightedValue &&
                  items[0]
                ) {
                  event.preventDefault()
                  onSelect(items[0].value)
                }
              }}
            />
          )}
        </Combobox.Context>
        {trailing}
      </Combobox.Control>
      <Combobox.Content
        aria-label={resultsLabel}
        className={cn("flex max-h-[50vh] flex-col gap-1 overflow-y-auto p-2", contentClassName)}
      >
        {items.map((item) => (
          <Combobox.Item item={item} key={item.value} className={searchResultClasses}>
            {item.content}
          </Combobox.Item>
        ))}
        {!items.length && empty}
      </Combobox.Content>
    </Combobox.Root>
  )
}
