import type { Meta, StoryObj } from "@storybook/react-vite"

import { Switch } from "../../Form"

const meta = { title: "Forms/Switch", component: Switch } satisfies Meta<typeof Switch>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { label: "Auto-save" } }
