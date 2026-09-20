import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slider } from "../../Form"

const meta = {
  title: "Forms/Slider",
  component: Slider,
  args: { label: "Zoom", thumbLabels: ["Zoom percentage"] },
} satisfies Meta<typeof Slider>
export default meta
type Story = StoryObj<typeof meta>

export const Filled: Story = {}

export const Elevated: Story = { args: { variant: "elevated" } }
