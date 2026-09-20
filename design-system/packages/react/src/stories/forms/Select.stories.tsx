import type { Meta, StoryObj } from "@storybook/react-vite"

import { Select } from "../../Form"

const meta = {
  title: "Forms/Select",
  component: Select,
  args: {
    label: "Theme",
    options: [
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
    ],
  },
} satisfies Meta<typeof Select>
export default meta
type Story = StoryObj<typeof meta>

export const Outlined: Story = {}

export const Elevated: Story = { args: { variant: "elevated" } }
