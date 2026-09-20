import type { Meta, StoryObj } from "@storybook/react-vite"

import { Menu, NavigationMenu, TreeView } from "./Navigation"

const meta = { title: "Navigation" } satisfies Meta
export default meta
type Story = StoryObj

export const MenuRecipe: Story = {
  name: "Menu",
  render: () => (
    <Menu.Root>
      <Menu.Trigger>Actions</Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content>
          <Menu.Item value="rename">
            <Menu.ItemText>Rename</Menu.ItemText>
          </Menu.Item>
          <Menu.Item value="duplicate">
            <Menu.ItemText>Duplicate</Menu.ItemText>
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  ),
}
export const NavigationMenuRecipe: Story = {
  name: "Navigation Menu",
  render: () => (
    <NavigationMenu.Root>
      <NavigationMenu.List>
        <NavigationMenu.Item value="file">
          <NavigationMenu.Trigger>File</NavigationMenu.Trigger>
          <NavigationMenu.Content>
            <NavigationMenu.Link href="#new">New deck</NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item value="help">
          <NavigationMenu.Link href="#help">Help</NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>
    </NavigationMenu.Root>
  ),
}
export const TreeViewRecipe: Story = {
  name: "Tree View",
  render: () => (
    <TreeView
      label="Deck outline"
      nodes={[
        { value: "intro", label: "Introduction" },
        {
          value: "chapters",
          label: "Chapters",
          children: [{ value: "one", label: "Chapter one" }],
        },
      ]}
    />
  ),
}
