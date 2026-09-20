import type { Meta, StoryObj } from "@storybook/react-vite"

import { Checkbox } from "../../Form"

const meta = {
  title: "Forms/Checkbox",
  component: Checkbox,
  args: { defaultChecked: true, label: "Include speaker notes" },
} satisfies Meta<typeof Checkbox>
export default meta
type Story = StoryObj<typeof meta>

export const Outlined: Story = {}

export const Filled: Story = { args: { variant: "filled" } }
