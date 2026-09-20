import type { Meta, StoryObj } from "@storybook/react-vite"

import { Divider } from "../../Layout"

const meta = { title: "Layout/Divider", component: Divider } satisfies Meta<typeof Divider>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { children: "Details" } }
