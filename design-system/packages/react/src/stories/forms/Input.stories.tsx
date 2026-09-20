import type { Meta, StoryObj } from "@storybook/react-vite"

import { Input } from "../../Form"
import { Search } from "../../icons"

const meta = { title: "Forms/Input", component: Input } satisfies Meta<typeof Input>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    controlProps: { "aria-label": "Search", placeholder: "Search decks" },
    start: <Search aria-hidden="true" />,
  },
}
