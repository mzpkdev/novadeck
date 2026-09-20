import type { Meta, StoryObj } from "@storybook/react-vite"

import { Column, Columns } from "../../Layout"

const meta = { title: "Layout/Columns", component: Columns } satisfies Meta<typeof Columns>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Columns rowGap="1rem">
      <Column of={3} span={1}>
        Sidebar
      </Column>
      <Column of={3} span={2}>
        Content
      </Column>
    </Columns>
  ),
}
