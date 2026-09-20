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

export const Elevated: Story = {
  args: { variant: "elevated" },
}

export const Filled: Story = {
  args: { variant: "filled" },
}

export const Tonal: Story = {
  args: { variant: "tonal" },
}

export const Text: Story = {
  args: { variant: "text" },
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
