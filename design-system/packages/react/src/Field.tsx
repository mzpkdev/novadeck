import "@novadeck/css/tailwind/field.css"
import { Field as ArkField } from "@ark-ui/react/field"
import type {
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react"

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
