import type { Meta, StoryObj } from "@storybook/react-vite"

import { Radio } from "../../Form"

const meta = {
  title: "Forms/Radio",
  component: Radio,
  args: {
    defaultValue: "wide",
    label: "Slide format",
    options: [
      { label: "Wide", value: "wide" },
      { label: "Standard", value: "standard" },
    ],
  },
} satisfies Meta<typeof Radio>
export default meta
type Story = StoryObj<typeof meta>

export const Outlined: Story = {}

export const Elevated: Story = { args: { variant: "elevated" } }
