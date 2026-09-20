import type { Meta, StoryObj } from "@storybook/react-vite"

import { Select } from "../../Form"

const meta = { title: "Forms/Select", component: Select } satisfies Meta<typeof Select>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: "Theme",
    options: [
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
    ],
  },
}
