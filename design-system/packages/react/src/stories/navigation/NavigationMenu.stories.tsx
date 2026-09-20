import type { Meta, StoryObj } from "@storybook/react-vite"

import { NavigationMenu } from "../../Navigation"

const meta = {
  title: "Navigation/Navigation Menu",
  component: NavigationMenu.Root,
} satisfies Meta<typeof NavigationMenu.Root>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
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
