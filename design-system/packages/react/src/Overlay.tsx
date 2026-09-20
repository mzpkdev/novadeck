import { Dialog as ArkDialog } from "@ark-ui/react/dialog"
import type { ComponentProps, HTMLAttributes, ReactNode } from "react"

import { Portal } from "./Portal"
import { cn } from "./utils"

const DialogTrigger = ({ className, ...props }: ComponentProps<typeof ArkDialog.Trigger>) => (
  <ArkDialog.Trigger {...props} className={cn("button", "dialog-trigger", className)} />
)
const DialogBackdrop = ({ className, ...props }: ComponentProps<typeof ArkDialog.Backdrop>) => (
  <ArkDialog.Backdrop {...props} className={cn("dialog-backdrop", className)} />
)
const DialogPositioner = ({ className, ...props }: ComponentProps<typeof ArkDialog.Positioner>) => (
  <ArkDialog.Positioner {...props} className={cn("dialog-positioner", className)} />
)
const DialogContent = ({ className, ...props }: ComponentProps<typeof ArkDialog.Content>) => (
  <ArkDialog.Content {...props} className={cn("dialog", className)} />
)
const DialogTitle = ({ className, ...props }: ComponentProps<typeof ArkDialog.Title>) => (
  <ArkDialog.Title {...props} className={cn("title", className)} />
)
const DialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof ArkDialog.Description>) => (
  <ArkDialog.Description {...props} className={cn("description", className)} />
)
const DialogCloseTrigger = ({
  className,
  ...props
}: ComponentProps<typeof ArkDialog.CloseTrigger>) => (
  <ArkDialog.CloseTrigger {...props} className={cn("close", className)} />
)
const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={cn("header", className)} />
)
const DialogBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={cn("body", className)} />
)
const DialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={cn("footer", className)} />
)
const DialogPortal = ({
  portal = true,
  ...props
}: ComponentProps<typeof Portal> & { portal?: boolean }) => <Portal {...props} disabled={!portal} />

export const DialogParts = {
  ...ArkDialog,
  Trigger: DialogTrigger,
  Backdrop: DialogBackdrop,
  Positioner: DialogPositioner,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  CloseTrigger: DialogCloseTrigger,
  Header: DialogHeader,
  Body: DialogBody,
  Footer: DialogFooter,
  Portal: DialogPortal,
}

export type DialogProps = Omit<ComponentProps<typeof ArkDialog.Root>, "children"> & {
  "aria-label"?: string
  closeLabel?: string
  content?: ReactNode
  description?: ReactNode
  portal?: boolean
  title?: ReactNode
  trigger?: ReactNode
  triggerLabel?: string
}

export const Dialog = ({
  "aria-label": ariaLabel,
  children,
  closeLabel = "Close dialog",
  content,
  description,
  portal = true,
  title,
  trigger,
  triggerLabel = "Open dialog",
  ...props
}: DialogProps & { children?: ReactNode }) => {
  if (!title && !ariaLabel?.trim()) throw new Error("Dialog requires a title or aria-label.")
  return (
    <ArkDialog.Root {...props}>
      <DialogTrigger>{trigger ?? triggerLabel}</DialogTrigger>
      <DialogPortal portal={portal}>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent aria-label={ariaLabel}>
            <DialogHeader>
              <div>
                {title && <DialogTitle>{title}</DialogTitle>}
                {description && <DialogDescription>{description}</DialogDescription>}
              </div>
              <DialogCloseTrigger aria-label={closeLabel}>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </DialogCloseTrigger>
            </DialogHeader>
            {(children ?? content) && <DialogBody>{children ?? <p>{content}</p>}</DialogBody>}
          </DialogContent>
        </DialogPositioner>
      </DialogPortal>
    </ArkDialog.Root>
  )
}
