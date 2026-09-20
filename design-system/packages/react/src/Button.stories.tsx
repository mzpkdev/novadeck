import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "./Button"
import { ArrowRight, Plus } from "./icons"

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

export const WithIcons: Story = {
  args: { end: <ArrowRight />, start: <Plus /> },
}

export const IconOnly: Story = {
  args: {
    "aria-label": "Create deck",
    children: <Plus aria-hidden="true" />,
    iconOnly: true,
  },
}

export const Loading: Story = {
  args: { loading: true, variant: "filled" },
}

export const Disabled: Story = {
  args: { disabled: true },
}
