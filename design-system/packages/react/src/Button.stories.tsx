import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "./Button"

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: {
    children: "Create deck",
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Outlined: Story = {}

export const Filled: Story = {
  args: { variant: "filled" },
}

export const Loading: Story = {
  args: { loading: true, variant: "filled" },
}

export const Disabled: Story = {
  args: { disabled: true },
}
