import type { Meta, StoryObj } from "@storybook/react-vite"

import { Stack } from "../../Layout"

const meta = { title: "Layout/Stack", component: Stack } satisfies Meta<typeof Stack>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Stack gap="1rem">
      <strong>First</strong>
      <span>Second</span>
    </Stack>
  ),
}
