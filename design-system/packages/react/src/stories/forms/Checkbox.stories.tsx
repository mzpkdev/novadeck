import type { Meta, StoryObj } from "@storybook/react-vite"

import { Checkbox } from "../../Form"

const meta = { title: "Forms/Checkbox", component: Checkbox } satisfies Meta<typeof Checkbox>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { label: "Include speaker notes" } }
