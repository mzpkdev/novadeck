import type { Meta, StoryObj } from "@storybook/react-vite"

import { Textarea } from "../../Form"

const meta = { title: "Forms/Textarea", component: Textarea } satisfies Meta<typeof Textarea>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    controlProps: { "aria-label": "Notes", placeholder: "Notes" },
    footer: "Markdown supported",
  },
}
