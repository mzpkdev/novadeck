import { Editable as ArkEditable, useEditableContext } from "@ark-ui/react/editable"
import type { ComponentProps, ComponentType } from "react"

import { cn } from "./utils"

const styled =
  <P extends { className?: string | undefined }>(Component: ComponentType<P>, base: string) =>
  ({ className, ...props }: P) => <Component {...(props as P)} className={cn(base, className)} />

const Root = styled(ArkEditable.Root, "editable")
const RootProvider = styled(ArkEditable.RootProvider, "editable")
const Label = styled(ArkEditable.Label, "label")
const Area = styled(ArkEditable.Area, "area")
type InputProps = ComponentProps<typeof ArkEditable.Input>

const Input = ({ className, onInput, ...props }: InputProps) => {
  const editable = useEditableContext()
  const input: NonNullable<InputProps["onInput"]> = (event) => {
    editable.setValue(event.currentTarget.value)
    onInput?.(event)
  }

  return <ArkEditable.Input {...props} className={cn("input", className)} onInput={input} />
}
const Preview = styled(ArkEditable.Preview, "preview")
const Control = styled(ArkEditable.Control, "control")
const EditTrigger = styled(ArkEditable.EditTrigger, "edit-trigger")
const SubmitTrigger = styled(ArkEditable.SubmitTrigger, "submit-trigger")
const CancelTrigger = styled(ArkEditable.CancelTrigger, "cancel-trigger")

export const Editable = {
  ...ArkEditable,
  Root,
  RootProvider,
  Label,
  Area,
  Input,
  Preview,
  Control,
  EditTrigger,
  SubmitTrigger,
  CancelTrigger,
}
