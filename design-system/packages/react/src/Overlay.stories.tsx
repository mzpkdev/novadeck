import type { Meta, StoryObj } from "@storybook/react-vite"

import { Dialog } from "./Overlay"

const meta = { title: "Overlay/Dialog", component: Dialog } satisfies Meta<typeof Dialog>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    content: "This removes the selected slide.",
    description: "This action cannot be undone.",
    title: "Delete slide?",
    triggerLabel: "Delete slide",
  },
}
