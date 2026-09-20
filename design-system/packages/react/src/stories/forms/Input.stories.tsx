import type { Meta, StoryObj } from "@storybook/react-vite"

import { Input } from "../../Form"
import { Search } from "../../icons"

const meta = {
  title: "Forms/Input",
  component: Input,
  args: {
    controlProps: { "aria-label": "Search", placeholder: "Search decks" },
    start: <Search aria-hidden="true" />,
  },
} satisfies Meta<typeof Input>
export default meta
type Story = StoryObj<typeof meta>

export const Outlined: Story = {}

export const Elevated: Story = { args: { variant: "elevated" } }
