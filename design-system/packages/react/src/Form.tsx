import { Checkbox as ArkCheckbox } from "@ark-ui/react/checkbox"
import { Field as ArkField } from "@ark-ui/react/field"
import { RadioGroup as ArkRadio } from "@ark-ui/react/radio-group"
import { Select as ArkSelect, createListCollection } from "@ark-ui/react/select"
import { Slider as ArkSlider } from "@ark-ui/react/slider"
import { Switch as ArkSwitch } from "@ark-ui/react/switch"
import { Check, ChevronDown, Minus } from "lucide-react"
import type {
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react"
import { createContext, useContext } from "react"

import { Portal, type PortalProps } from "./Portal"
import { cn } from "./utils"

const FieldRoot = ({ className, ...props }: ComponentProps<typeof ArkField.Root>) => (
  <ArkField.Root {...props} className={cn("field", className)} />
)
const FieldRootProvider = ({
  className,
  ...props
}: ComponentProps<typeof ArkField.RootProvider>) => (
  <ArkField.RootProvider {...props} className={cn("field", className)} />
)
const FieldLabel = ({ className, ...props }: ComponentProps<typeof ArkField.Label>) => (
  <ArkField.Label {...props} className={cn("label", className)} />
)
const FieldHelperText = ({ className, ...props }: ComponentProps<typeof ArkField.HelperText>) => (
  <ArkField.HelperText {...props} className={cn("helper", className)} />
)
const FieldErrorText = ({ className, ...props }: ComponentProps<typeof ArkField.ErrorText>) => (
  <ArkField.ErrorText {...props} className={cn("error", className)} />
)
const FieldRequiredIndicator = ({
  className,
  ...props
}: ComponentProps<typeof ArkField.RequiredIndicator>) => (
  <ArkField.RequiredIndicator {...props} className={cn("required", className)} />
)
const FieldInput = ({ className, ...props }: ComponentProps<typeof ArkField.Input>) => (
  <ArkField.Input {...props} className={cn("input", className)} />
)
const FieldTextarea = ({ className, ...props }: ComponentProps<typeof ArkField.Textarea>) => (
  <ArkField.Textarea {...props} className={cn("textarea", className)} />
)
const FieldSelect = ({ className, ...props }: ComponentProps<typeof ArkField.Select>) => (
  <ArkField.Select {...props} className={cn("input", className)} />
)
export const Field = {
  ...ArkField,
  Root: FieldRoot,
  RootProvider: FieldRootProvider,
  Label: FieldLabel,
  HelperText: FieldHelperText,
  ErrorText: FieldErrorText,
  RequiredIndicator: FieldRequiredIndicator,
  Input: FieldInput,
  Textarea: FieldTextarea,
  Select: FieldSelect,
}

export type InputVariant = "outlined" | "elevated"
export type InputProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  controlProps?: InputHTMLAttributes<HTMLInputElement>
  end?: ReactNode
  loading?: boolean
  start?: ReactNode
  variant?: InputVariant
}
export const Input = ({
  className,
  controlProps,
  end,
  loading,
  start,
  variant = "outlined",
  ...props
}: InputProps) => (
  <div {...props} className={cn("input", variant, className)}>
    {start && <span className="start">{start}</span>}
    <ArkField.Input
      {...controlProps}
      aria-busy={loading || undefined}
      className={cn("control", controlProps?.className)}
    />
    {(end || loading) && (
      <span className="end">
        {end}
        {loading && <span aria-hidden="true" className="spinner" />}
      </span>
    )}
  </div>
)

export type TextareaVariant = InputVariant
export type TextareaProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  controlProps?: TextareaHTMLAttributes<HTMLTextAreaElement>
  footer?: ReactNode
  variant?: TextareaVariant
}
export const Textarea = ({
  className,
  controlProps,
  footer,
  variant = "outlined",
  ...props
}: TextareaProps) => (
  <div {...props} className={cn("textarea", variant, className)}>
    <ArkField.Textarea {...controlProps} className={cn("control", controlProps?.className)} />
    {footer && <div className="footer">{footer}</div>}
  </div>
)

export type CheckboxVariant = "outlined" | "filled"
const CheckboxRoot = ({
  className,
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkCheckbox.Root> & { variant?: CheckboxVariant | undefined }) => (
  <ArkCheckbox.Root {...props} className={cn("checkbox", variant, className)} />
)
const CheckboxRootProvider = ({
  className,
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkCheckbox.RootProvider> & { variant?: CheckboxVariant | undefined }) => (
  <ArkCheckbox.RootProvider {...props} className={cn("checkbox", variant, className)} />
)
const CheckboxControl = ({ className, ...props }: ComponentProps<typeof ArkCheckbox.Control>) => (
  <ArkCheckbox.Control {...props} className={cn("control", className)} />
)
const CheckboxIndicator = ({
  className,
  ...props
}: ComponentProps<typeof ArkCheckbox.Indicator>) => (
  <ArkCheckbox.Indicator {...props} className={cn("indicator", className)} />
)
const CheckboxLabel = ({ className, ...props }: ComponentProps<typeof ArkCheckbox.Label>) => (
  <ArkCheckbox.Label {...props} className={cn("label", className)} />
)
export const CheckboxParts = {
  ...ArkCheckbox,
  Root: CheckboxRoot,
  RootProvider: CheckboxRootProvider,
  Control: CheckboxControl,
  Indicator: CheckboxIndicator,
  Label: CheckboxLabel,
}
export type CheckboxProps = Omit<ComponentProps<typeof ArkCheckbox.Root>, "children"> & {
  inputProps?: ComponentProps<typeof ArkCheckbox.HiddenInput>
  label: ReactNode
  variant?: CheckboxVariant
}
export const Checkbox = ({ inputProps, label, variant, ...props }: CheckboxProps) => (
  <CheckboxRoot {...props} variant={variant}>
    <CheckboxControl>
      <CheckboxIndicator>
        <Check aria-hidden="true" />
      </CheckboxIndicator>
      <CheckboxIndicator indeterminate>
        <Minus aria-hidden="true" />
      </CheckboxIndicator>
    </CheckboxControl>
    <CheckboxLabel>{label}</CheckboxLabel>
    <ArkCheckbox.HiddenInput {...inputProps} />
  </CheckboxRoot>
)

export type RadioVariant = "outlined" | "elevated"
const RadioRoot = ({
  className,
  orientation = "vertical",
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkRadio.Root> & { variant?: RadioVariant | undefined }) => (
  <ArkRadio.Root
    {...props}
    className={cn("radio", orientation, variant, className)}
    orientation={orientation}
  />
)
const RadioRootProvider = ({
  className,
  value,
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkRadio.RootProvider> & { variant?: RadioVariant | undefined }) => (
  <ArkRadio.RootProvider
    {...props}
    className={cn(
      "radio",
      (value.getRootProps() as { "data-orientation"?: "horizontal" | "vertical" })[
        "data-orientation"
      ] ?? "vertical",
      variant,
      className,
    )}
    value={value}
  />
)
const RadioLabel = ({ className, ...props }: ComponentProps<typeof ArkRadio.Label>) => (
  <ArkRadio.Label {...props} className={cn("label", className)} />
)
const RadioItem = ({ className, ...props }: ComponentProps<typeof ArkRadio.Item>) => (
  <ArkRadio.Item {...props} className={cn("item", className)} />
)
const RadioItemControl = ({ className, ...props }: ComponentProps<typeof ArkRadio.ItemControl>) => (
  <ArkRadio.ItemControl {...props} className={cn("control", className)} />
)
const RadioIndicator = ({ className, ...props }: ComponentProps<"span">) => (
  <span {...props} className={cn("indicator", className)} />
)
const RadioItemText = ({ className, ...props }: ComponentProps<typeof ArkRadio.ItemText>) => (
  <ArkRadio.ItemText {...props} className={cn("text", className)} />
)
export const RadioParts = {
  ...ArkRadio,
  Root: RadioRoot,
  RootProvider: RadioRootProvider,
  Label: RadioLabel,
  Item: RadioItem,
  ItemControl: RadioItemControl,
  Indicator: RadioIndicator,
  ItemText: RadioItemText,
}
export type RadioOption = { disabled?: boolean; invalid?: boolean; label: ReactNode; value: string }
export type RadioProps = Omit<ComponentProps<typeof ArkRadio.Root>, "children"> & {
  label: ReactNode
  options: RadioOption[]
  variant?: RadioVariant
}
export const Radio = ({ label, options, variant, ...props }: RadioProps) => (
  <RadioRoot {...props} variant={variant}>
    <RadioLabel>{label}</RadioLabel>
    <div className="options">
      {options.map((option) => (
        <RadioItem
          key={option.value}
          disabled={option.disabled}
          invalid={option.invalid}
          value={option.value}
        >
          <RadioItemControl>
            <RadioIndicator />
          </RadioItemControl>
          <RadioItemText>{option.label}</RadioItemText>
          <ArkRadio.ItemHiddenInput />
        </RadioItem>
      ))}
    </div>
  </RadioRoot>
)

export type SwitchVariant = "outlined" | "elevated"
const SwitchRoot = ({
  className,
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkSwitch.Root> & { variant?: SwitchVariant | undefined }) => (
  <ArkSwitch.Root {...props} className={cn("switch", variant, className)} />
)
const SwitchRootProvider = ({
  className,
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkSwitch.RootProvider> & { variant?: SwitchVariant | undefined }) => (
  <ArkSwitch.RootProvider {...props} className={cn("switch", variant, className)} />
)
const SwitchControl = ({ className, ...props }: ComponentProps<typeof ArkSwitch.Control>) => (
  <ArkSwitch.Control {...props} className={cn("control", className)} />
)
const SwitchThumb = ({ className, ...props }: ComponentProps<typeof ArkSwitch.Thumb>) => (
  <ArkSwitch.Thumb {...props} className={cn("thumb", className)} />
)
const SwitchLabel = ({ className, ...props }: ComponentProps<typeof ArkSwitch.Label>) => (
  <ArkSwitch.Label {...props} className={cn("label", className)} />
)
export const SwitchParts = {
  ...ArkSwitch,
  Root: SwitchRoot,
  RootProvider: SwitchRootProvider,
  Control: SwitchControl,
  Thumb: SwitchThumb,
  Label: SwitchLabel,
}
export type SwitchProps = Omit<ComponentProps<typeof ArkSwitch.Root>, "children"> & {
  inputProps?: ComponentProps<typeof ArkSwitch.HiddenInput>
  label: ReactNode
  variant?: SwitchVariant
}
export const Switch = ({ inputProps, label, variant, ...props }: SwitchProps) => (
  <SwitchRoot {...props} variant={variant}>
    <SwitchControl>
      <SwitchThumb />
    </SwitchControl>
    <SwitchLabel>{label}</SwitchLabel>
    <ArkSwitch.HiddenInput {...inputProps} />
  </SwitchRoot>
)

export type SliderVariant = "filled" | "elevated"
const defaultSliderValue = [50]
const SliderRoot = ({
  className,
  orientation = "horizontal",
  variant = "filled",
  ...props
}: ComponentProps<typeof ArkSlider.Root> & { variant?: SliderVariant | undefined }) => (
  <ArkSlider.Root
    {...props}
    className={cn("slider", orientation, variant, className)}
    orientation={orientation}
  />
)
const SliderRootProvider = ({
  className,
  value,
  variant = "filled",
  ...props
}: ComponentProps<typeof ArkSlider.RootProvider> & { variant?: SliderVariant | undefined }) => (
  <ArkSlider.RootProvider
    {...props}
    className={cn(
      "slider",
      (value.getRootProps() as { "data-orientation"?: "horizontal" | "vertical" })[
        "data-orientation"
      ] ?? "horizontal",
      variant,
      className,
    )}
    value={value}
  />
)
const SliderLabel = ({ className, ...props }: ComponentProps<typeof ArkSlider.Label>) => (
  <ArkSlider.Label {...props} className={cn("label", className)} />
)
const SliderControl = ({ className, ...props }: ComponentProps<typeof ArkSlider.Control>) => (
  <ArkSlider.Control {...props} className={cn("control", className)} />
)
const SliderTrack = ({ className, ...props }: ComponentProps<typeof ArkSlider.Track>) => (
  <ArkSlider.Track {...props} className={cn("track", className)} />
)
const SliderRange = ({ className, ...props }: ComponentProps<typeof ArkSlider.Range>) => (
  <ArkSlider.Range {...props} className={cn("range", className)} />
)
const SliderThumb = ({ className, ...props }: ComponentProps<typeof ArkSlider.Thumb>) => (
  <ArkSlider.Thumb {...props} className={cn("thumb", className)} />
)
const SliderValueText = ({ className, ...props }: ComponentProps<typeof ArkSlider.ValueText>) => (
  <ArkSlider.ValueText {...props} className={cn("value", className)} />
)
export const SliderParts = {
  ...ArkSlider,
  Root: SliderRoot,
  RootProvider: SliderRootProvider,
  Label: SliderLabel,
  Control: SliderControl,
  Track: SliderTrack,
  Range: SliderRange,
  Thumb: SliderThumb,
  ValueText: SliderValueText,
}
export type SliderProps = Omit<ComponentProps<typeof ArkSlider.Root>, "children"> & {
  description?: ReactNode
  error?: ReactNode
  label: ReactNode
  thumbLabels?: string[]
  variant?: SliderVariant
}
export const Slider = ({
  defaultValue = defaultSliderValue,
  description,
  error,
  label,
  thumbLabels,
  value,
  variant,
  ...props
}: SliderProps) => {
  const values = value ?? defaultValue
  return (
    <SliderRoot
      {...props}
      defaultValue={defaultValue}
      invalid={props.invalid ?? Boolean(error)}
      value={value}
      variant={variant}
    >
      <div className="header">
        <SliderLabel>{label}</SliderLabel>
        <SliderValueText />
      </div>
      {description && <div className="description">{description}</div>}
      <SliderControl>
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        {values.map((thumbValue, index) => (
          <SliderThumb
            aria-label={thumbLabels?.[index]}
            index={index}
            key={thumbLabels?.[index] ?? `thumb-${thumbValue}`}
          >
            <ArkSlider.HiddenInput />
          </SliderThumb>
        ))}
      </SliderControl>
      {error && <div className="error">{error}</div>}
    </SliderRoot>
  )
}

export type SelectOption = { disabled?: boolean; label: string; value: string }
export const createSelectCollection = (options: SelectOption[]) =>
  createListCollection({
    items: options,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
    isItemDisabled: (item) => item.disabled ?? false,
  })
export type SelectVariant = "outlined" | "elevated"
const SelectVariantContext = createContext<SelectVariant>("outlined")
const SelectRoot = ({
  children,
  className,
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkSelect.Root<SelectOption>> & {
  variant?: SelectVariant | undefined
}) => (
  <SelectVariantContext value={variant}>
    <ArkSelect.Root {...props} className={cn("select", variant, className)}>
      {children}
    </ArkSelect.Root>
  </SelectVariantContext>
)
const SelectRootProvider = ({
  children,
  className,
  variant = "outlined",
  ...props
}: ComponentProps<typeof ArkSelect.RootProvider<SelectOption>> & {
  variant?: SelectVariant | undefined
}) => (
  <SelectVariantContext value={variant}>
    <ArkSelect.RootProvider {...props} className={cn("select", variant, className)}>
      {children}
    </ArkSelect.RootProvider>
  </SelectVariantContext>
)
const SelectLabel = ({ className, ...props }: ComponentProps<typeof ArkSelect.Label>) => (
  <ArkSelect.Label {...props} className={cn("label", className)} />
)
const SelectControl = ({ className, ...props }: ComponentProps<typeof ArkSelect.Control>) => (
  <ArkSelect.Control {...props} className={cn("control", className)} />
)
const SelectTrigger = ({ className, ...props }: ComponentProps<typeof ArkSelect.Trigger>) => (
  <ArkSelect.Trigger {...props} className={cn("trigger", className)} />
)
const SelectValueText = ({ className, ...props }: ComponentProps<typeof ArkSelect.ValueText>) => (
  <ArkSelect.ValueText {...props} className={cn("value", className)} />
)
const SelectIndicator = ({ className, ...props }: ComponentProps<typeof ArkSelect.Indicator>) => (
  <ArkSelect.Indicator {...props} className={cn("indicator", className)} />
)
const SelectPositioner = ({
  className,
  portal = true,
  source,
  ...props
}: ComponentProps<typeof ArkSelect.Positioner> & {
  portal?: boolean
  source?: PortalProps["source"]
  variant?: SelectVariant | undefined
}) => {
  const inheritedVariant = useContext(SelectVariantContext)
  const { variant = inheritedVariant, ...positionerProps } = props
  const positioner = (
    <ArkSelect.Positioner
      {...positionerProps}
      className={cn("select", "positioner", variant, className)}
    />
  )
  return portal ? <Portal source={source}>{positioner}</Portal> : positioner
}
const SelectContent = ({ className, ...props }: ComponentProps<typeof ArkSelect.Content>) => (
  <ArkSelect.Content {...props} className={cn("content", className)} />
)
const SelectItem = ({ className, ...props }: ComponentProps<typeof ArkSelect.Item>) => (
  <ArkSelect.Item {...props} className={cn("item", className)} />
)
const SelectItemText = ({ className, ...props }: ComponentProps<typeof ArkSelect.ItemText>) => (
  <ArkSelect.ItemText {...props} className={cn("item-text", className)} />
)
const SelectItemIndicator = ({
  className,
  ...props
}: ComponentProps<typeof ArkSelect.ItemIndicator>) => (
  <ArkSelect.ItemIndicator {...props} className={cn("item-indicator", className)} />
)
export const SelectParts = {
  ...ArkSelect,
  Root: SelectRoot,
  RootProvider: SelectRootProvider,
  Label: SelectLabel,
  Control: SelectControl,
  Trigger: SelectTrigger,
  ValueText: SelectValueText,
  Indicator: SelectIndicator,
  Positioner: SelectPositioner,
  Content: SelectContent,
  Item: SelectItem,
  ItemText: SelectItemText,
  ItemIndicator: SelectItemIndicator,
}
export type SelectProps = Omit<
  ComponentProps<typeof ArkSelect.Root<SelectOption>>,
  "children" | "collection"
> & {
  label: ReactNode
  options: SelectOption[]
  placeholder?: string
  portal?: boolean
  variant?: SelectVariant
}
export const Select = ({
  label,
  options,
  placeholder = "Select an option",
  portal = true,
  variant,
  ...props
}: SelectProps) => {
  const collection = createSelectCollection(options)
  const content = (
    <SelectPositioner portal={portal} variant={variant}>
      <SelectContent>
        {options.map((option) => (
          <SelectItem item={option} key={option.value}>
            <SelectItemText>{option.label}</SelectItemText>
            <SelectItemIndicator>
              <Check aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPositioner>
  )
  return (
    <SelectRoot
      {...props}
      collection={collection}
      positioning={{ sameWidth: true }}
      variant={variant}
    >
      <SelectLabel>{label}</SelectLabel>
      <SelectControl>
        <SelectTrigger>
          <SelectValueText placeholder={placeholder} />
          <SelectIndicator aria-hidden="true">
            <ChevronDown />
          </SelectIndicator>
        </SelectTrigger>
      </SelectControl>
      <ArkSelect.HiddenSelect />
      {content}
    </SelectRoot>
  )
}
