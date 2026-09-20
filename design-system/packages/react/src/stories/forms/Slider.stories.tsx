import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slider } from "../../Form"

const meta = { title: "Forms/Slider", component: Slider } satisfies Meta<typeof Slider>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { label: "Zoom", thumbLabels: ["Zoom percentage"] } }
