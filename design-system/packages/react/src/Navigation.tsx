import { Menu as ArkMenu } from "@ark-ui/react/menu"
import { NavigationMenu as ArkNavigationMenu } from "@ark-ui/react/navigation-menu"
import { TreeView as ArkTreeView, createTreeCollection } from "@ark-ui/react/tree-view"
import { ChevronRight } from "lucide-react"
import type { ComponentProps, ComponentType, ReactNode } from "react"

import { Portal } from "./Portal"
import { cn } from "./utils"

const styled =
  <P extends { className?: string | undefined }>(Component: ComponentType<P>, base: string) =>
  ({ className, ...props }: P) => <Component {...(props as P)} className={cn(base, className)} />

const MenuTrigger = ({ className, ...props }: ComponentProps<typeof ArkMenu.Trigger>) => (
  <ArkMenu.Trigger {...props} className={cn("button", "menu-trigger", className)} />
)
const MenuContextTrigger = ({
  className,
  ...props
}: ComponentProps<typeof ArkMenu.ContextTrigger>) => (
  <ArkMenu.ContextTrigger
    {...props}
    className={cn("button", "menu-trigger", "context", className)}
  />
)
const MenuPositioner = ({
  className,
  portal = true,
  ...props
}: ComponentProps<typeof ArkMenu.Positioner> & { portal?: boolean }) => {
  const positioner = <ArkMenu.Positioner {...props} className={cn("menu-positioner", className)} />
  return portal ? <Portal>{positioner}</Portal> : positioner
}
const MenuContent = styled(ArkMenu.Content, "menu")
const MenuArrow = styled(ArkMenu.Arrow, "arrow")
const MenuArrowTip = styled(ArkMenu.ArrowTip, "tip")
const MenuItemGroup = styled(ArkMenu.ItemGroup, "group")
const MenuItemGroupLabel = styled(ArkMenu.ItemGroupLabel, "label")
const MenuItem = styled<ComponentProps<typeof ArkMenu.Item>>(ArkMenu.Item, "item")
const MenuCheckboxItem = styled<ComponentProps<typeof ArkMenu.CheckboxItem>>(
  ArkMenu.CheckboxItem,
  "item",
)
const MenuRadioItemGroup = styled(ArkMenu.RadioItemGroup, "group")
const MenuRadioItem = styled<ComponentProps<typeof ArkMenu.RadioItem>>(ArkMenu.RadioItem, "item")
const MenuTriggerItem = styled(ArkMenu.TriggerItem, "item")
const MenuItemText = styled(ArkMenu.ItemText, "text")
const MenuItemIndicator = styled(ArkMenu.ItemIndicator, "indicator")
const MenuIndicator = styled(ArkMenu.Indicator, "indicator")
const MenuSeparator = styled(ArkMenu.Separator, "separator")
export const Menu = {
  ...ArkMenu,
  Trigger: MenuTrigger,
  ContextTrigger: MenuContextTrigger,
  Positioner: MenuPositioner,
  Content: MenuContent,
  Arrow: MenuArrow,
  ArrowTip: MenuArrowTip,
  ItemGroup: MenuItemGroup,
  ItemGroupLabel: MenuItemGroupLabel,
  Item: MenuItem,
  CheckboxItem: MenuCheckboxItem,
  RadioItemGroup: MenuRadioItemGroup,
  RadioItem: MenuRadioItem,
  TriggerItem: MenuTriggerItem,
  ItemText: MenuItemText,
  ItemIndicator: MenuItemIndicator,
  Indicator: MenuIndicator,
  Separator: MenuSeparator,
}

const NavigationMenuRoot = ({
  className,
  orientation,
  ...props
}: ComponentProps<typeof ArkNavigationMenu.Root>) => (
  <ArkNavigationMenu.Root
    {...props}
    className={cn("navigation-menu", orientation === "vertical" && "vertical", className)}
    orientation={orientation}
  />
)
const NavigationMenuRootProvider = ({
  className,
  ...props
}: ComponentProps<typeof ArkNavigationMenu.RootProvider>) => (
  <ArkNavigationMenu.RootProvider {...props} className={cn("navigation-menu", className)} />
)
const NavigationMenuList = styled(ArkNavigationMenu.List, "list")
const NavigationMenuItem = styled<ComponentProps<typeof ArkNavigationMenu.Item>>(
  ArkNavigationMenu.Item,
  "item",
)
const NavigationMenuTrigger = styled(ArkNavigationMenu.Trigger, "trigger")
const NavigationMenuContent = styled(ArkNavigationMenu.Content, "content")
const NavigationMenuLink = styled(ArkNavigationMenu.Link, "link")
const NavigationMenuIndicator = styled(ArkNavigationMenu.Indicator, "indicator")
const NavigationMenuArrow = styled(ArkNavigationMenu.Arrow, "arrow")
const NavigationMenuItemIndicator = styled(ArkNavigationMenu.ItemIndicator, "item-indicator")
export const NavigationMenu = {
  ...ArkNavigationMenu,
  Root: NavigationMenuRoot,
  RootProvider: NavigationMenuRootProvider,
  List: NavigationMenuList,
  Item: NavigationMenuItem,
  Trigger: NavigationMenuTrigger,
  Content: NavigationMenuContent,
  Link: NavigationMenuLink,
  Indicator: NavigationMenuIndicator,
  Arrow: NavigationMenuArrow,
  ItemIndicator: NavigationMenuItemIndicator,
}

export type TreeViewNode = {
  children?: TreeViewNode[]
  download?: string | boolean
  disabled?: boolean
  end?: ReactNode
  href?: string
  icon?: ReactNode
  label: string
  rel?: string
  target?: string
  value: string
}
export type TreeViewSelectionValue = string | string[]
export type TreeViewProps = Omit<
  ComponentProps<typeof ArkTreeView.Root<TreeViewNode>>,
  "children" | "collection" | "selectedValue"
> & { label: string; nodes: TreeViewNode[]; selectedValue?: TreeViewSelectionValue }

const getChildren = (node: TreeViewNode) => node.children ?? []
const getExpandedValues = (nodes: TreeViewNode[]): string[] =>
  nodes.flatMap((node) =>
    node.children?.length ? [node.value, ...getExpandedValues(node.children)] : [],
  )
const rootPath: number[] = []
const TreeNodes = ({ items, path = rootPath }: { items: TreeViewNode[]; path?: number[] }) => (
  <>
    {items.map((node, index) => {
      const indexPath = [...path, index]
      const branch = getChildren(node).length > 0
      if (branch && node.href)
        throw new Error(`TreeView node "${node.value}" cannot link and branch.`)
      return (
        <ArkTreeView.NodeProvider indexPath={indexPath} key={node.value} node={node}>
          {branch ? (
            <ArkTreeView.Branch className="branch">
              <ArkTreeView.BranchControl
                aria-disabled={node.disabled || undefined}
                className="control"
              >
                <ArkTreeView.BranchIndicator className="indicator">
                  <ChevronRight aria-hidden="true" className="arrow" />
                </ArkTreeView.BranchIndicator>
                {node.icon}
                <ArkTreeView.BranchText className="text">{node.label}</ArkTreeView.BranchText>
                <span className="end">{node.end}</span>
              </ArkTreeView.BranchControl>
              <ArkTreeView.BranchContent className="content">
                <TreeNodes items={getChildren(node)} path={indexPath} />
              </ArkTreeView.BranchContent>
            </ArkTreeView.Branch>
          ) : (
            <ArkTreeView.Item className="item" asChild={Boolean(node.href)}>
              {node.href && !node.disabled ? (
                <a download={node.download} href={node.href} rel={node.rel} target={node.target}>
                  <span aria-hidden="true" className="spacer" />
                  {node.icon}
                  <ArkTreeView.ItemText className="text">{node.label}</ArkTreeView.ItemText>
                  <span className="end">{node.end}</span>
                </a>
              ) : (
                <>
                  <span aria-hidden="true" className="spacer" />
                  {node.icon}
                  <ArkTreeView.ItemText className="text">{node.label}</ArkTreeView.ItemText>
                  <span className="end">{node.end}</span>
                </>
              )}
            </ArkTreeView.Item>
          )}
        </ArkTreeView.NodeProvider>
      )
    })}
  </>
)

export const TreeView = ({
  defaultExpandedValue,
  label,
  nodes,
  selectedValue,
  ...props
}: TreeViewProps) => {
  const collection = createTreeCollection<TreeViewNode>({
    rootNode: { value: "root", label: "root", children: nodes },
    nodeToChildren: getChildren,
    nodeToString: (node) => String(node.label),
    nodeToValue: (node) => node.value,
  })
  const selection =
    selectedValue === undefined
      ? undefined
      : Array.isArray(selectedValue)
        ? selectedValue
        : [selectedValue]
  return (
    <ArkTreeView.Root
      {...props}
      className={cn("tree-view", props.className)}
      collection={collection}
      defaultExpandedValue={defaultExpandedValue ?? getExpandedValues(nodes)}
      selectedValue={selection}
    >
      <ArkTreeView.Label className="visually-hidden">{label}</ArkTreeView.Label>
      <ArkTreeView.Tree className="tree">
        <TreeNodes items={nodes} />
      </ArkTreeView.Tree>
    </ArkTreeView.Root>
  )
}
