import { Tabs as ArkTabs } from "@ark-ui/react/tabs"
import type { ComponentProps, ComponentType } from "react"

import { cn } from "./utils"

const styled =
  <P extends { className?: string | undefined }>(Component: ComponentType<P>, base: string) =>
  ({ className, ...props }: P) => <Component {...(props as P)} className={cn(base, className)} />

const Root = ({ className, orientation, ...props }: ComponentProps<typeof ArkTabs.Root>) => (
  <ArkTabs.Root
    {...props}
    className={cn("tabs", orientation === "vertical" && "vertical", className)}
    orientation={orientation}
  />
)
const RootProvider = styled(ArkTabs.RootProvider, "tabs")
const List = styled(ArkTabs.List, "list")
const Trigger = styled(ArkTabs.Trigger, "trigger")
const Indicator = styled(ArkTabs.Indicator, "indicator")
const Content = styled(ArkTabs.Content, "content")

export const Tabs = { ...ArkTabs, Root, RootProvider, List, Trigger, Indicator, Content }
