import type { Meta, StoryObj } from "@storybook/react-vite"

import { Switch } from "../../Form"

const meta = {
  title: "Forms/Switch",
  component: Switch,
  args: { defaultChecked: true, label: "Auto-save" },
} satisfies Meta<typeof Switch>
export default meta
type Story = StoryObj<typeof meta>

export const Outlined: Story = {}

export const Elevated: Story = { args: { variant: "elevated" } }
