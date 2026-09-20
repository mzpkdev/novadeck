import type { Meta, StoryObj } from "@storybook/react-vite"

import { Menu } from "../../Navigation"

const meta = { title: "Navigation/Menu", component: Menu.Root } satisfies Meta<typeof Menu.Root>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
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
